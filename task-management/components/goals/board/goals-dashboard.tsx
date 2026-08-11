"use client";

/**
 * GOALS DASHBOARD — DIRECTOR / EXECUTIVE VIEW.
 *
 * A pace-aware "control room" for one level (Yearly / Quarterly / Monthly) or
 * the Weekly board of the currently-viewed person's cascade. EVERYTHING here is
 * a pure CLIENT-SIDE projection over the goals the board already holds — zero
 * new DB queries, recomputed whenever the props change.
 *
 * The whole point (vs. the old flat card wall): it drives EVERY health / at-risk
 * / forecast number off the canonical pace engine in `lib/goals/derive.ts`
 * (`deriveHealth` · `expectedPct` · `rollupPct`), NOT static ≥80/≥60 cutoffs.
 *
 * Sections:
 *   1. HERO — weighted OKR attainment gauge + pace read + forecast chip.
 *   2. KPI row — weighted attainment · on-pace · at-risk · overdue · done ·
 *      ₹ attainment · cascade coverage. Each clickable → drill.
 *   3. Pace / health distribution — segmented bar across the 6 derived bands.
 *   4. At-risk & overdue action list — worst-first, the director's to-do.
 *   5. Cascade coverage — broken-down vs orphaned + "needs breakdown" list.
 *   6. By Pillar (goalType) + By Area — weighted attainment per group.
 *   7. Accountability / delegation — self·assigned·delegated, dependency, review.
 *   8. ₹ / quantitative attainment — Σ actual vs Σ target (only if measures).
 *   9. Drill-down panel — the goals behind any clicked KPI / band / group.
 *  10. Controls — All / At-risk lens + pillar filter.
 *
 * Brand laws (altus-premium-ui): Altus-red identity, --font-display numbers,
 * tabular-nums everywhere, .wg-rise / .wg-sheen + kpi-aurora depth, semantic
 * status hexes only, all motion reduced-motion-gated.
 */

import * as React from "react";
import { useReducedMotion } from "motion/react";
import {
  Target,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  AlertTriangle,
  X,
  GitBranch,
  Users,
  IndianRupee,
  Gauge,
  Sparkles,
  Network,
  ShieldCheck,
  HandCoins,
  Boxes,
} from "lucide-react";
import {
  type GoalDTO,
  type RosterMember,
  periodKeyLabel,
  fmtNum,
  fyLabel,
} from "@/components/goals/cascade/util";
import { CardGrid } from "@/components/layout/card-grid";
import type { GoalPeriod } from "@/lib/goals/types";
// The numbers live in ONE place — see `dashboard-model.ts`. This file owns the
// executive LAYOUT over them; the Weekly board renders its own layout over the
// same model.
import {
  GREEN,
  GREEN_BRIGHT,
  AMBER,
  RED,
  RED_DEEP,
  SLATE,
  BLUE,
  DISPLAY,
  BAND_META,
  BAND_ORDER,
  classify,
  pillarOf,
  buildModel,
  type DisplayBand,
  type Row,
  type Group,
  type Model,
} from "./dashboard-model";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const PANEL: React.CSSProperties = {
  background: "var(--color-surface-card)",
  border: "1px solid var(--color-hairline-strong)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)",
};

const LEVEL_NOUN: Record<string, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};
const CHILD_NOUN: Record<string, string> = {
  year: "quarter",
  quarter: "month",
  month: "week",
  week: "",
  day: "",
};

/* ── Count-up (rAF ease-out; renders final state under reduced motion) ─── */
function useCountUp(target: number, enabled: boolean): number {
  const [val, setVal] = React.useState(enabled ? 0 : target);
  const fromRef = React.useRef(enabled ? 0 : target);
  React.useEffect(() => {
    if (!enabled) {
      fromRef.current = target;
      setVal(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const dur = 680;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, enabled]);
  return val;
}

/* ── Drill descriptor (a click → the goals behind a KPI / band / group) ── */
interface Drill {
  id: string;
  label: string;
  color: string;
  test: (r: Row) => boolean;
}

/* ── SVG gauge geometry ────────────────────────────────────────────────── */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/* ====================================================================== */
/* Props                                                                  */
/* ====================================================================== */

export interface GoalsDashboardProps {
  /** FULL loaded cascade set (all levels) for the viewed person + FY. */
  allGoals: GoalDTO[];
  /** The level this dashboard summarises. */
  level: GoalPeriod;
  fyStartYear: number;
  /** Loaded roster (id → name) for delegate / dependency labels — load-neutral.
   *  OPTIONAL so lighter callers (e.g. the Weekly board) can mount the dashboard
   *  without the full cascade context; all extras default to inert. */
  roster?: RosterMember[];
  /** Weekly execution rows (period="week") — used for month→week coverage. */
  weekCards?: GoalDTO[];
  /** The person whose cascade this is. */
  viewedName?: string;
  viewedEmployeeId?: string;
  /** parentGoalId → its direct children (cascade rows, all levels). */
  childrenByParent?: Map<string, GoalDTO[]>;
  managesViewed?: boolean;
  isAdmin?: boolean;
}

const EMPTY_ROWS: GoalDTO[] = [];
const EMPTY_CHILDREN = new Map<string, GoalDTO[]>();

/* ====================================================================== */
/* Root                                                                   */
/* ====================================================================== */

export function GoalsDashboard(props: GoalsDashboardProps) {
  const {
    allGoals,
    level,
    fyStartYear,
    weekCards = EMPTY_ROWS,
    childrenByParent = EMPTY_CHILDREN,
    viewedName = "",
    managesViewed = false,
    isAdmin = false,
  } = props;
  const reduce = useReducedMotion() ?? false;

  // Premium reveal even though data is synchronous (props).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stamp `now` once per payload so pace math is stable across the render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => new Date(), [allGoals]);

  const childCountOf = React.useCallback(
    (id: string) => {
      const direct = childrenByParent.get(id)?.length ?? 0;
      let weeks = 0;
      for (const w of weekCards) if (w.parentGoalId === id) weeks += 1;
      return direct + weeks;
    },
    [childrenByParent, weekCards],
  );

  // Analysed rows — adopted goals at this level (crossed-out rows excluded).
  const allRows = React.useMemo(
    () =>
      allGoals
        .filter((g) => g.period === level && g.adopted)
        .map((g) => classify(g, now, childCountOf(g.id))),
    [allGoals, level, now, childCountOf],
  );

  // Controls — lens (all / at-risk) + pillar filter.
  const [lens, setLens] = React.useState<"all" | "risk">("all");
  const [pillar, setPillar] = React.useState<string | null>(null);
  const pillarOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) {
      const p = pillarOf(r.g);
      if (p) s.add(p);
    }
    return [...s].sort();
  }, [allRows]);
  // A pillar that no longer exists (data changed) resets to All.
  React.useEffect(() => {
    if (pillar && !pillarOptions.includes(pillar)) setPillar(null);
  }, [pillar, pillarOptions]);

  const viewRows = React.useMemo(() => {
    let rs = allRows;
    if (pillar) rs = rs.filter((r) => pillarOf(r.g) === pillar);
    if (lens === "risk")
      rs = rs.filter((r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover");
    return rs;
  }, [allRows, pillar, lens]);

  const m = React.useMemo(() => buildModel(viewRows, level), [viewRows, level]);

  // Drill state.
  const [drill, setDrill] = React.useState<Drill | null>(null);
  const toggleDrill = React.useCallback((d: Drill) => {
    setDrill((cur) => (cur?.id === d.id ? null : d));
  }, []);
  const drilled = React.useMemo(
    () => (drill ? viewRows.filter(drill.test).sort((a, b) => b.eff - a.eff) : []),
    [drill, viewRows],
  );
  // Drill can go stale when the lens/pillar changes it out of the set.
  React.useEffect(() => {
    setDrill(null);
  }, [lens, pillar]);

  if (!mounted) return <DashboardSkeleton />;
  if (allRows.length === 0) return <DashboardEmpty level={level} />;

  const heroTone = m.paceDelta >= 0 ? GREEN : m.paceDelta > -25 ? AMBER : RED;
  const forecastTone = m.avgConfidence >= 80 ? GREEN : m.avgConfidence >= 60 ? AMBER : RED;

  const viewingNote = (managesViewed || isAdmin) && viewedName ? viewedName : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Controls ── */}
      <Controls
        lens={lens}
        onLens={setLens}
        pillar={pillar}
        onPillar={setPillar}
        pillarOptions={pillarOptions}
        showing={viewRows.length}
        total={allRows.length}
        filtered={pillar != null || lens === "risk"}
      />

      {/* ── 1 · HERO ── */}
      <Hero
        level={level}
        fyStartYear={fyStartYear}
        model={m}
        heroTone={heroTone}
        forecastTone={forecastTone}
        reduce={reduce}
        viewingNote={viewingNote}
      />

      {/* ── 2 · KPI row ── */}
      <KpiRow model={m} drill={drill} onDrill={toggleDrill} reduce={reduce} level={level} />

      {/* ── 3 + 4 · Distribution + at-risk action list ── */}
      <div className="grid grid-cols-[1.05fr_1.35fr] gap-4 max-xl:grid-cols-1">
        <Distribution
          model={m}
          reduce={reduce}
          activeBand={
            drill?.id.startsWith("band:") ? (drill.id.slice(5) as DisplayBand) : null
          }
          onPick={(band) =>
            toggleDrill({
              id: `band:${band}`,
              label: BAND_META[band].label,
              color: BAND_META[band].color,
              test: (r) => r.band === band,
            })
          }
        />
        <AtRiskList rows={m.atRiskRows} total={m.total} />
      </div>

      {/* ── 5 · Cascade coverage (year / quarter / month) ── */}
      {m.coverage && (
        <CoveragePanel coverage={m.coverage} total={m.total} level={level} reduce={reduce} />
      )}

      {/* ── 6 · By pillar + by area ── */}
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <GroupPanel
          title="By pillar"
          subtitle="weighted attainment · goal type"
          icon={<Boxes size={15} strokeWidth={2.4} />}
          groups={m.byPillar}
          reduce={reduce}
          activeLabel={
            drill?.id.startsWith("pillar:") ? drill.id.slice(7) : null
          }
          onPick={(label) =>
            toggleDrill({
              id: `pillar:${label}`,
              label: `Pillar · ${label}`,
              color: "var(--color-altus-red-deep)",
              test: (r) => (pillarOf(r.g) ?? "Unspecified") === label,
            })
          }
        />
        <GroupPanel
          title="By area"
          subtitle="weighted attainment · focus area"
          icon={<Network size={15} strokeWidth={2.4} />}
          groups={m.byArea}
          reduce={reduce}
          activeLabel={drill?.id.startsWith("area:") ? drill.id.slice(5) : null}
          onPick={(label) =>
            toggleDrill({
              id: `area:${label}`,
              label: `Area · ${label}`,
              color: "var(--color-altus-red-deep)",
              test: (r) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned") === label,
            })
          }
        />
      </div>

      {/* ── 7 + 8 · Accountability + ₹/qty ── */}
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <AccountabilityPanel model={m} />
        {m.rupee || m.qty ? (
          <MeasurePanel rupee={m.rupee} qty={m.qty} reduce={reduce} />
        ) : (
          <AccountabilityCallout model={m} />
        )}
      </div>

      {/* ── 9 · Drill-down ── */}
      {drill && <DrillPanel drill={drill} rows={drilled} onClose={() => setDrill(null)} />}
    </div>
  );
}

/* ====================================================================== */
/* Controls                                                               */
/* ====================================================================== */

function Controls({
  lens,
  onLens,
  pillar,
  onPillar,
  pillarOptions,
  showing,
  total,
  filtered,
}: {
  lens: "all" | "risk";
  onLens: (l: "all" | "risk") => void;
  pillar: string | null;
  onPillar: (p: string | null) => void;
  pillarOptions: string[];
  showing: number;
  total: number;
  filtered: boolean;
}) {
  return (
    <div className="wg-rise flex flex-wrap items-center gap-2.5">
      {/* Lens toggle */}
      <div
        role="tablist"
        aria-label="Goal lens"
        className="inline-flex items-center gap-1 rounded-full border p-1"
        style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
      >
        {(
          [
            { id: "all", label: "All goals" },
            { id: "risk", label: "At-risk only" },
          ] as const
        ).map((o) => {
          const active = lens === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onLens(o.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-all ${FOCUS_RING}`}
              style={{
                background: active
                  ? o.id === "risk"
                    ? "linear-gradient(135deg, #dc2626, #991b1b)"
                    : "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                  : "transparent",
                color: active ? "#fff" : "var(--color-ink-muted)",
                boxShadow: active ? "0 6px 16px -8px rgba(168,4,0,0.55)" : "none",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Pillar filter */}
      {pillarOptions.length > 0 && (
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Pillar</span>
          <div className="inline-flex flex-wrap items-center gap-1">
            <FilterChip active={pillar == null} onClick={() => onPillar(null)}>
              All
            </FilterChip>
            {pillarOptions.map((p) => (
              <FilterChip key={p} active={pillar === p} onClick={() => onPillar(pillar === p ? null : p)}>
                {p}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      <span className="ml-auto text-[12px] font-semibold text-ink-subtle tabular-nums">
        {filtered ? (
          <>
            showing <span className="font-black text-ink-soft">{showing}</span> of {total}
          </>
        ) : (
          <>
            <span className="font-black text-ink-soft">{total}</span> adopted goal{total === 1 ? "" : "s"}
          </>
        )}
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
      style={{
        borderColor: active ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
        background: active ? "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" : "transparent",
        color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)",
      }}
    >
      {children}
    </button>
  );
}

/* ====================================================================== */
/* 1 · Hero                                                               */
/* ====================================================================== */

function Hero({
  level,
  fyStartYear,
  model,
  heroTone,
  forecastTone,
  reduce,
  viewingNote,
}: {
  level: GoalPeriod;
  fyStartYear: number;
  model: Model;
  heroTone: string;
  forecastTone: string;
  reduce: boolean;
  viewingNote: string | null;
}) {
  const behind = model.paceDelta < 0;
  const onPacePct = model.total ? Math.round((model.onPace / model.total) * 100) : 0;

  return (
    <section
      className="wg-rise relative isolate overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(160deg, #FBF7F0 0%, #F4EEE3 56%, #F1E9DB 100%)",
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <span aria-hidden className="kpi-strip-mesh" />
      <span aria-hidden className="kpi-strip-grain" />

      <div className="relative z-[2] flex items-center gap-5 p-4 max-md:flex-col max-md:items-stretch max-md:gap-4">
        {/* Gauge */}
        <AttainmentGauge value={model.weighted} expected={model.avgExpected} tone={heroTone} reduce={reduce} />

        {/* Read-out — compact 3 rows: title (w/ inline eyebrow) · sub · chips. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="inline-flex items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.16em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              <Sparkles size={12} strokeWidth={2.6} />
              Executive Scorecard
            </span>
            <h1
              className="leading-none text-ink-strong"
              style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}
            >
              {LEVEL_NOUN[level]} Objectives &amp; Key Results
            </h1>
          </div>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-subtle tabular-nums">
            {model.total} adopted goal{model.total === 1 ? "" : "s"} · {fyLabel(fyStartYear)}
            {viewingNote && (
              <>
                {" · "}
                <span className="font-bold text-ink-soft">viewing {viewingNote}</span>
              </>
            )}
          </p>

          {/* Pace read + forecast/on-pace chips — one line (wraps only if narrow) */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold tabular-nums"
              style={{ background: `color-mix(in srgb, ${heroTone} 12%, transparent)`, color: heroTone }}
            >
              {behind ? <TrendingDown size={14} strokeWidth={2.8} /> : <TrendingUp size={14} strokeWidth={2.8} />}
              {Math.abs(model.paceDelta)} pts {behind ? "behind" : "ahead of"} schedule
            </span>
            <span className="text-[12px] font-semibold text-ink-subtle tabular-nums">
              attained <span className="font-black text-ink-soft">{model.weighted}%</span> · expected{" "}
              <span className="font-black text-ink-soft">{model.avgExpected}%</span> by now
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums"
              style={{
                borderColor: `color-mix(in srgb, ${forecastTone} 40%, transparent)`,
                background: `color-mix(in srgb, ${forecastTone} 8%, transparent)`,
                color: forecastTone,
              }}
            >
              <Gauge size={13} strokeWidth={2.6} />
              Forecast finish ~{model.avgConfidence}%
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums text-ink-soft"
              style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
            >
              <CheckCircle2 size={13} strokeWidth={2.6} style={{ color: GREEN }} />
              {model.onPace} on pace · {onPacePct}%
            </span>
            {model.needsAttention > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums"
                style={{
                  borderColor: `color-mix(in srgb, ${RED} 38%, transparent)`,
                  background: `color-mix(in srgb, ${RED} 8%, transparent)`,
                  color: RED,
                }}
              >
                <AlertTriangle size={13} strokeWidth={2.6} />
                {model.needsAttention} need attention
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AttainmentGauge({
  value,
  expected,
  tone,
  reduce,
}: {
  value: number;
  expected: number;
  tone: string;
  reduce: boolean;
}) {
  const size = 116;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const START = 135;
  const SWEEP = 270;
  const valEnd = START + SWEEP * (Math.min(100, Math.max(0, value)) / 100);
  const tickA = START + SWEEP * (Math.min(100, Math.max(0, expected)) / 100);
  const p1 = polar(cx, cy, r - 9, tickA);
  const p2 = polar(cx, cy, r + 9, tickA);
  const shown = Math.round(useCountUp(value, !reduce));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`Weighted attainment ${value}%, expected ${expected}%`}>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone} />
            <stop offset="100%" stopColor={`color-mix(in srgb, ${tone} 62%, #fff)`} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path
          d={arcPath(cx, cy, r, START, START + SWEEP)}
          fill="none"
          stroke="var(--color-surface-soft)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        {/* Value */}
        {value > 0 && (
          <path
            d={arcPath(cx, cy, r, START, valEnd)}
            fill="none"
            stroke="url(#gauge-fill)"
            strokeWidth={15}
            strokeLinecap="round"
            style={reduce ? undefined : { animation: "fadeUp 640ms both" }}
          />
        )}
        {/* Expected-pace tick */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="var(--color-ink-strong)"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums leading-none text-ink-strong"
          style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 28, letterSpacing: "-0.03em" }}
        >
          {shown}
          <span style={{ fontSize: 14 }}>%</span>
        </span>
        <span className="mt-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-ink-subtle">
          Weighted attn.
        </span>
        <span className="mt-1 flex items-center gap-1 text-[9px] font-bold text-ink-subtle tabular-nums">
          <span className="inline-block h-1.5 w-[2px] rounded" style={{ background: "var(--color-ink-strong)", opacity: 0.55 }} />
          pace {expected}%
        </span>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* 2 · KPI row                                                            */
/* ====================================================================== */

interface Kpi {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  numeric: number | null;
  sub: React.ReactNode;
  accent: string;
  drill?: Drill;
}

function KpiRow({
  model,
  drill,
  onDrill,
  reduce,
  level,
}: {
  model: Model;
  drill: Drill | null;
  onDrill: (d: Drill) => void;
  reduce: boolean;
  level: GoalPeriod;
}) {
  const rupeePct =
    model.rupee && model.rupee.target > 0
      ? Math.round((model.rupee.actual / model.rupee.target) * 100)
      : null;

  const kpis: Kpi[] = [];

  kpis.push({
    key: "attn",
    icon: <Gauge size={16} strokeWidth={2.4} />,
    label: "Weighted attainment",
    value: `${model.weighted}%`,
    numeric: model.weighted,
    sub:
      model.paceDelta >= 0 ? (
        <span style={{ color: GREEN }}>▲ {model.paceDelta} pts ahead of pace</span>
      ) : (
        <span style={{ color: model.paceDelta <= -25 ? RED : AMBER }}>
          ▼ {Math.abs(model.paceDelta)} pts behind pace
        </span>
      ),
    accent: "var(--color-altus-red-deep)",
  });

  kpis.push({
    key: "onpace",
    icon: <TrendingUp size={16} strokeWidth={2.4} />,
    label: "On pace",
    value: String(model.onPace),
    numeric: model.onPace,
    sub: "ahead + on-track",
    accent: GREEN,
    drill: {
      id: "kpi:onpace",
      label: "On-pace goals",
      color: GREEN,
      test: (r) => r.band === "ahead" || r.band === "on-track",
    },
  });

  kpis.push({
    key: "atrisk",
    icon: <AlertTriangle size={16} strokeWidth={2.4} />,
    label: "At risk",
    value: String(model.atRisk),
    numeric: model.atRisk,
    sub: "behind pace / carried",
    accent: RED,
    drill: {
      id: "kpi:atrisk",
      label: "At-risk goals",
      color: RED,
      test: (r) => r.band === "at-risk" || r.band === "spillover",
    },
  });

  kpis.push({
    key: "overdue",
    icon: <CalendarClock size={16} strokeWidth={2.4} />,
    label: "Overdue",
    value: String(model.overdue),
    numeric: model.overdue,
    sub: "past target date",
    accent: RED_DEEP,
    drill:
      model.overdue > 0
        ? { id: "kpi:overdue", label: "Overdue goals", color: RED_DEEP, test: (r) => r.band === "overdue" }
        : undefined,
  });

  kpis.push({
    key: "done",
    icon: <CheckCircle2 size={16} strokeWidth={2.4} />,
    label: "Completed",
    value: String(model.done),
    numeric: model.done,
    sub: model.total ? `${Math.round((model.done / model.total) * 100)}% at 100%` : "—",
    accent: GREEN,
    drill: { id: "kpi:done", label: "Completed goals", color: GREEN, test: (r) => r.band === "done" },
  });

  if (model.rupee) {
    kpis.push({
      key: "rupee",
      icon: <IndianRupee size={16} strokeWidth={2.4} />,
      label: "₹ attainment",
      value: `₹${fmtNum(model.rupee.actual)}`,
      numeric: null,
      sub:
        rupeePct != null ? (
          <span style={{ color: rupeePct >= 100 ? GREEN : rupeePct >= 60 ? AMBER : RED }}>
            {rupeePct}% of ₹{fmtNum(model.rupee.target)}
          </span>
        ) : (
          `of ₹${fmtNum(model.rupee.target)}`
        ),
      accent: "var(--color-altus-red-deep)",
    });
  }

  if (model.coverage) {
    kpis.push({
      key: "coverage",
      icon: <GitBranch size={16} strokeWidth={2.4} />,
      label: "Cascade coverage",
      value: `${model.coverage.pct}%`,
      numeric: model.coverage.pct,
      sub: `${model.coverage.orphans.length} need breakdown`,
      accent: BLUE,
      drill:
        model.coverage.orphans.length > 0
          ? {
              id: "kpi:coverage",
              label: `${CHILD_NOUN[level] || "child"}-less goals`,
              color: BLUE,
              test: (r) => r.childCount === 0,
            }
          : undefined,
    });
  }

  return (
    // One line — every KPI card on a single row, equal width, filling the page;
    // holds a min-width and scrolls horizontally only if the viewport is narrow.
    <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
      {kpis.map((k, i) => (
        <div key={k.key} className="min-w-[150px] flex-1 [&>*]:h-full">
          <KpiCard
            kpi={k}
            index={i}
            reduce={reduce}
            active={!!k.drill && drill?.id === k.drill.id}
            onSelect={k.drill ? () => onDrill(k.drill!) : undefined}
          />
        </div>
      ))}
    </div>
  );
}

function KpiCard({
  kpi,
  index,
  reduce,
  active,
  onSelect,
}: {
  kpi: Kpi;
  index: number;
  reduce: boolean;
  active: boolean;
  onSelect?: () => void;
}) {
  const animated = useCountUp(kpi.numeric ?? 0, !reduce && kpi.numeric != null);
  const shown =
    kpi.numeric != null
      ? kpi.value.includes("%")
        ? `${Math.round(animated)}%`
        : String(Math.round(animated))
      : kpi.value;

  const clickable = !!onSelect;
  const Tag: React.ElementType = clickable ? "button" : "div";

  return (
    <Tag
      {...(clickable ? { type: "button", onClick: onSelect, "aria-pressed": active } : {})}
      className={`wg-rise wg-sheen group relative overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-all ${
        clickable ? `cursor-pointer hover:-translate-y-0.5 ${FOCUS_RING}` : ""
      }`}
      style={{
        animationDelay: `${index * 45}ms`,
        background: active
          ? `color-mix(in srgb, ${kpi.accent} 9%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        border: `1px solid ${
          active ? `color-mix(in srgb, ${kpi.accent} 45%, transparent)` : "var(--color-hairline-strong)"
        }`,
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 26px -16px ${kpi.accent}`
          : "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-60 transition-opacity group-hover:opacity-90"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${kpi.accent} 13%, transparent), transparent 68%)` }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${kpi.accent} 12%, transparent)`, color: kpi.accent }}
        >
          {kpi.icon}
        </span>
        <span className="text-[10.5px] font-black uppercase tracking-[0.09em] text-ink-subtle">{kpi.label}</span>
      </div>
      <div
        className="relative mt-2 font-black tabular-nums leading-none text-ink-strong"
        style={{ fontFamily: DISPLAY, fontSize: 29, letterSpacing: "-0.02em" }}
      >
        {shown}
      </div>
      <div className="relative mt-1.5 text-[12px] font-semibold text-ink-subtle tabular-nums">{kpi.sub}</div>
    </Tag>
  );
}

/* ====================================================================== */
/* 3 · Pace / health distribution                                        */
/* ====================================================================== */

function Distribution({
  model,
  reduce,
  activeBand,
  onPick,
}: {
  model: Model;
  reduce: boolean;
  activeBand: DisplayBand | null;
  onPick: (b: DisplayBand) => void;
}) {
  const total = model.total;
  const present = BAND_ORDER.filter((b) => model.counts[b] > 0);
  const [reveal, setReveal] = React.useState(reduce);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">Pace distribution</h3>
        <span className="text-[11px] font-semibold text-ink-subtle">click a band to drill in</span>
      </div>

      {/* Segmented bar */}
      <div
        className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full"
        style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 1px 2px rgba(15,23,42,0.06)" }}
      >
        {present.map((b) => {
          const w = total ? (model.counts[b] / total) * 100 : 0;
          return (
            <button
              key={b}
              type="button"
              onClick={() => onPick(b)}
              aria-label={`${BAND_META[b].label}: ${model.counts[b]} goals`}
              title={`${BAND_META[b].label} · ${model.counts[b]}`}
              className="h-full cursor-pointer"
              style={{
                width: reveal ? `${w}%` : "0%",
                minWidth: 6,
                background: BAND_META[b].color,
                opacity: activeBand && activeBand !== b ? 0.35 : 1,
                transition: reduce ? "opacity 150ms" : "width 680ms cubic-bezier(0.2,0,0,1), opacity 150ms",
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-1.5 max-sm:grid-cols-1">
        {BAND_ORDER.map((b) => {
          const c = model.counts[b];
          const active = activeBand === b;
          const pct = total ? Math.round((c / total) * 100) : 0;
          return (
            <button
              key={b}
              type="button"
              onClick={() => c > 0 && onPick(b)}
              aria-pressed={active}
              disabled={c === 0}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors ${
                c > 0 ? `cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,transparent)] ${FOCUS_RING}` : "opacity-45"
              }`}
              style={active ? { background: `color-mix(in srgb, ${BAND_META[b].color} 9%, transparent)` } : undefined}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: BAND_META[b].color }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-soft">
                {BAND_META[b].label}
              </span>
              <span className="text-[13px] font-black tabular-nums text-ink-strong">{c}</span>
              <span className="w-9 text-right text-[11px] font-bold tabular-nums text-ink-subtle">{pct}%</span>
            </button>
          );
        })}
      </div>

      {/* Read-out — turns the empty lower half into the pace story */}
      {total > 0 && (() => {
        const tracking = model.done + model.onPace; // done + ahead + on-track
        const trackingPct = Math.round((tracking / total) * 100);
        const gap = model.weighted - model.avgExpected;
        const gapColor = gap >= 0 ? GREEN : RED;
        const attention = model.atRisk + model.overdue;
        return (
          <div className="mt-5 space-y-3 border-t pt-4" style={{ borderColor: "var(--color-hairline)" }}>
            {/* Tracking-to-plan bar */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">Tracking to plan</span>
                <span className="text-[12.5px] font-bold text-ink-soft tabular-nums">
                  <span className="font-black text-ink-strong">{tracking}</span> of {total} · {trackingPct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${trackingPct}%`,
                    background: `linear-gradient(90deg, ${GREEN}, ${GREEN_BRIGHT})`,
                    transition: reduce ? undefined : "width 680ms cubic-bezier(0.2,0,0,1)",
                  }}
                />
              </div>
            </div>

            {/* Attainment vs expected pace */}
            <div
              className="grid grid-cols-3 divide-x rounded-xl px-1 py-2.5"
              style={{ background: "var(--color-surface-soft)", borderColor: "var(--color-hairline)" }}
            >
              <div className="px-3 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Attained</p>
                <p className="text-[18px] font-black tabular-nums text-ink-strong">{model.weighted}%</p>
              </div>
              <div className="px-3 text-center" style={{ borderColor: "var(--color-hairline)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Expected</p>
                <p className="text-[18px] font-black tabular-nums text-ink-soft">{model.avgExpected}%</p>
              </div>
              <div className="px-3 text-center" style={{ borderColor: "var(--color-hairline)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">Gap</p>
                <p className="text-[18px] font-black tabular-nums" style={{ color: gapColor }}>
                  {gap >= 0 ? "+" : "−"}{Math.abs(gap)}
                </p>
              </div>
            </div>

            {/* Attention callout */}
            <div
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{
                background: attention > 0
                  ? `color-mix(in srgb, ${RED} 7%, transparent)`
                  : `color-mix(in srgb, ${GREEN} 8%, transparent)`,
              }}
            >
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: attention > 0 ? `color-mix(in srgb, ${RED} 14%, transparent)` : `color-mix(in srgb, ${GREEN} 14%, transparent)`,
                  color: attention > 0 ? RED : GREEN,
                }}
              >
                {attention > 0 ? <AlertTriangle size={15} strokeWidth={2.6} /> : <CheckCircle2 size={16} strokeWidth={2.4} />}
              </span>
              <p className="text-[12.5px] font-semibold leading-snug text-ink-soft">
                {attention > 0 ? (
                  <>
                    <span className="font-black text-ink-strong tabular-nums">{attention}</span>{" "}
                    goal{attention === 1 ? "" : "s"} need attention
                    {model.overdue > 0 && <> · <span className="font-black tabular-nums" style={{ color: RED_DEEP }}>{model.overdue}</span> overdue</>}
                  </>
                ) : (
                  <>All {total} goals are tracking to schedule — nothing behind pace.</>
                )}
              </p>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

/* ====================================================================== */
/* 4 · At-risk & overdue action list                                     */
/* ====================================================================== */

function AtRiskList({ rows, total }: { rows: Row[]; total: number }) {
  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-[12.5px] font-black uppercase tracking-[0.1em]" style={{ color: RED }}>
          <AlertTriangle size={15} strokeWidth={2.6} />
          Needs attention
        </h3>
        <span className="rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums text-white" style={{ background: RED }}>
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <span
            className="inline-flex size-11 items-center justify-center rounded-full"
            style={{ background: `color-mix(in srgb, ${GREEN} 12%, transparent)`, color: GREEN }}
          >
            <CheckCircle2 size={22} strokeWidth={2.4} />
          </span>
          <p className="text-[13.5px] font-bold text-ink-strong">Everything on pace</p>
          <p className="text-[12px] font-semibold text-ink-subtle">
            All {total} goal{total === 1 ? "" : "s"} are ahead of or tracking to schedule.
          </p>
        </div>
      ) : (
        <ul className="flex max-h-[420px] flex-col divide-y overflow-y-auto" style={{ borderColor: "var(--color-hairline)" }}>
          {rows.map((r) => (
            <AtRiskRow key={r.g.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AtRiskRow({ row }: { row: Row }) {
  const { g, eff, h, band, daysLate } = row;
  const meta = BAND_META[band];
  const expected = h.expected;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-ink-strong" title={g.title}>
          {g.title}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {/* effective vs expected mini bar */}
          <span className="relative h-1.5 w-28 shrink-0 overflow-hidden rounded-full max-sm:w-20" style={{ background: "var(--color-surface-soft)" }}>
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, eff)}%`, background: meta.color }}
            />
            <span
              className="absolute inset-y-[-2px] w-[2px]"
              style={{ left: `${Math.min(100, expected)}%`, background: "var(--color-ink-strong)", opacity: 0.5 }}
              aria-hidden
            />
          </span>
          <span className="text-[11.5px] font-bold tabular-nums" style={{ color: meta.color }}>
            {eff}%
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-ink-subtle">vs {expected}% pace</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.04em]"
          style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
        >
          {daysLate > 0 ? `${daysLate}d late` : meta.short}
        </span>
        <span className="text-[10.5px] font-semibold tabular-nums text-ink-subtle">~{h.confidence}% forecast</span>
      </div>
    </li>
  );
}

/* ====================================================================== */
/* 5 · Cascade coverage                                                   */
/* ====================================================================== */

function CoveragePanel({
  coverage,
  total,
  level,
  reduce,
}: {
  coverage: NonNullable<Model["coverage"]>;
  total: number;
  level: GoalPeriod;
  reduce: boolean;
}) {
  const child = CHILD_NOUN[level] || "child";
  const [reveal, setReveal] = React.useState(reduce);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const tone = coverage.pct >= 80 ? GREEN : coverage.pct >= 50 ? AMBER : RED;

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">
          <GitBranch size={15} strokeWidth={2.4} style={{ color: BLUE }} />
          Cascade coverage
        </h3>
        <span className="text-[11px] font-semibold text-ink-subtle">
          broken down into {child} goals
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-5 max-sm:grid-cols-1">
        <div className="flex items-baseline gap-2">
          <span
            className="tabular-nums leading-none"
            style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 42, letterSpacing: "-0.03em", color: tone }}
          >
            {coverage.pct}%
          </span>
          <div className="text-[11.5px] font-semibold text-ink-subtle">
            <div className="tabular-nums">
              <span className="font-black text-ink-soft">{coverage.withChildren}</span> of {total}
            </div>
            <div>have a breakdown</div>
          </div>
        </div>

        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
            <span
              className="h-full"
              style={{
                width: reveal ? `${coverage.pct}%` : "0%",
                background: `linear-gradient(90deg, ${BLUE}, color-mix(in srgb, ${BLUE} 70%, #fff))`,
                transition: reduce ? undefined : "width 680ms cubic-bezier(0.2,0,0,1)",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-ink-subtle tabular-nums">
            <span>{coverage.withChildren} cascaded</span>
            <span style={{ color: coverage.orphans.length > 0 ? RED : GREEN }}>
              {coverage.orphans.length} orphaned
            </span>
          </div>
        </div>
      </div>

      {coverage.orphans.length > 0 && (
        <div className="mt-3.5 border-t pt-3" style={{ borderColor: "var(--color-hairline)" }}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
            Needs breakdown · biggest first
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {coverage.orphans.slice(0, 8).map((r) => (
              <li
                key={r.g.id}
                className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold text-ink-soft"
                style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
                title={r.g.title}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: RED }} />
                <span className="truncate">{r.g.title}</span>
                {r.g.weight > 0 && (
                  <span className="shrink-0 text-[10.5px] tabular-nums text-ink-subtle">w{r.g.weight}</span>
                )}
              </li>
            ))}
            {coverage.orphans.length > 8 && (
              <li className="inline-flex items-center px-2 py-1 text-[12px] font-bold tabular-nums text-ink-subtle">
                +{coverage.orphans.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ====================================================================== */
/* 6 · Group panel (pillar / area)                                       */
/* ====================================================================== */

function GroupPanel({
  title,
  subtitle,
  icon,
  groups,
  reduce,
  activeLabel,
  onPick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  groups: Group[];
  reduce: boolean;
  activeLabel: string | null;
  onPick: (label: string) => void;
}) {
  const [reveal, setReveal] = React.useState(reduce);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md" style={{ color: "var(--color-altus-red-deep)" }}>
          {icon}
        </span>
        <h3 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">{title}</h3>
        <span className="ml-auto text-[11px] font-semibold text-ink-subtle">{subtitle}</span>
      </div>

      {groups.length === 0 ? (
        <p className="py-3 text-[13px] font-semibold text-ink-subtle">No goals to group.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {groups.slice(0, 8).map((grp) => {
            const active = activeLabel === grp.label;
            const tone = grp.pct >= 100 ? GREEN : grp.pct >= 60 ? AMBER : "var(--color-altus-red-deep)";
            return (
              <li key={grp.label}>
                <button
                  type="button"
                  onClick={() => onPick(grp.label)}
                  aria-pressed={active}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-1.5 py-1 text-left transition-colors cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,transparent)] ${FOCUS_RING}`}
                  style={active ? { background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" } : undefined}
                >
                  <span className="min-w-0 truncate text-[13px] font-bold text-ink-strong" title={grp.label}>
                    {grp.label}
                  </span>
                  <span className="flex items-baseline gap-2 justify-self-end">
                    <span className="text-[14px] font-black tabular-nums" style={{ fontFamily: DISPLAY, color: tone }}>
                      {grp.pct}%
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10.5px] font-black tabular-nums text-ink-subtle"
                      style={{ background: "var(--color-surface-soft)" }}
                    >
                      {grp.count}
                    </span>
                  </span>
                  <span
                    className="relative col-span-2 h-2 overflow-hidden rounded-full"
                    style={{ background: "var(--color-surface-soft)" }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: reveal ? `${Math.min(100, grp.pct)}%` : "0%",
                        minWidth: grp.pct > 0 ? 6 : 0,
                        background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
                        transition: reduce ? undefined : "width 640ms cubic-bezier(0.2,0,0,1)",
                      }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ====================================================================== */
/* 7 · Accountability / delegation                                       */
/* ====================================================================== */

function AccountabilityPanel({ model }: { model: Model }) {
  const a = model.accountability;
  const total = model.total || 1;
  const reviewedPct = Math.round((a.reviewed / total) * 100);

  const splits: Array<{ label: string; value: number; color: string; hint: string }> = [
    { label: "Self", value: a.self, color: SLATE, hint: "created by owner" },
    { label: "Assigned", value: a.assigned, color: "var(--color-altus-red-deep)", hint: "given by a manager" },
    { label: "Delegated", value: a.delegated, color: BLUE, hint: "handed to a member" },
  ];

  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md" style={{ color: BLUE }}>
          <Users size={15} strokeWidth={2.4} />
        </span>
        <h3 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">Accountability</h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {splits.map((s) => (
          <div
            key={s.label}
            className="rounded-xl px-3 py-3"
            style={{ background: `color-mix(in srgb, ${s.color} 8%, transparent)` }}
          >
            <div className="tabular-nums font-black leading-none" style={{ fontFamily: DISPLAY, fontSize: 24, color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[12.5px] font-bold text-ink-strong">{s.label}</div>
            <div className="text-[10.5px] font-medium text-ink-subtle">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: "var(--color-hairline)" }}>
        <MetricPip
          icon={<HandCoins size={14} strokeWidth={2.4} />}
          label="Delegated weight"
          value={a.delegatedWeight > 0 ? String(a.delegatedWeight) : "—"}
          hint="handed off"
          color={BLUE}
        />
        <MetricPip
          icon={<Network size={14} strokeWidth={2.4} />}
          label="Team dependency"
          value={a.depCount > 0 ? `${a.avgDep}%` : "—"}
          hint={a.depCount > 0 ? `max ${a.maxDep}%` : "no exposure"}
          color={a.avgDep >= 50 ? RED : a.avgDep >= 25 ? AMBER : SLATE}
        />
        <MetricPip
          icon={<ShieldCheck size={14} strokeWidth={2.4} />}
          label="Reviewed"
          value={`${a.reviewed}`}
          hint={`${reviewedPct}% · ${a.selfOnly} self-rated`}
          color={reviewedPct >= 60 ? GREEN : reviewedPct >= 30 ? AMBER : RED}
        />
      </div>
    </section>
  );
}

function MetricPip({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="min-w-0">
      <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">
        <span style={{ color }}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 tabular-nums font-black text-ink-strong" style={{ fontSize: 18, color }}>
        {value}
      </div>
      <div className="truncate text-[10.5px] font-semibold text-ink-subtle">{hint}</div>
    </div>
  );
}

/** Fallback second-column card when there are no ₹/qty measures — keep the
 *  accountability review detail visible so the row never looks lopsided. */
function AccountabilityCallout({ model }: { model: Model }) {
  const a = model.accountability;
  return (
    <section className="wg-rise flex flex-col justify-center rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md" style={{ color: "var(--color-altus-red-deep)" }}>
          <Target size={15} strokeWidth={2.4} />
        </span>
        <h3 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">Measures</h3>
      </div>
      <p className="text-[13px] font-semibold text-ink-subtle">
        No ₹ or quantity targets set on these goals — attainment is tracked by self-rated / reviewed progress
        only.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums text-ink-soft"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
        >
          <ShieldCheck size={13} strokeWidth={2.6} style={{ color: GREEN }} />
          {a.reviewed} reviewed · {a.selfOnly} self-rated
        </span>
      </div>
    </section>
  );
}

/* ====================================================================== */
/* 8 · ₹ / quantitative attainment                                       */
/* ====================================================================== */

function MeasurePanel({
  rupee,
  qty,
  reduce,
}: {
  rupee: { target: number; actual: number } | null;
  qty: { target: number; actual: number } | null;
  reduce: boolean;
}) {
  return (
    <section className="wg-rise rounded-2xl px-5 py-4" style={PANEL}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md" style={{ color: "var(--color-altus-red-deep)" }}>
          <IndianRupee size={15} strokeWidth={2.4} />
        </span>
        <h3 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-ink-soft">Measured attainment</h3>
      </div>
      <div className="flex flex-col gap-3.5">
        {rupee && (
          <MeasureBar label="₹ value" actual={rupee.actual} target={rupee.target} format={(n) => `₹${fmtNum(n)}`} reduce={reduce} />
        )}
        {qty && (
          <MeasureBar label="Quantity" actual={qty.actual} target={qty.target} format={(n) => fmtNum(n)} reduce={reduce} />
        )}
      </div>
    </section>
  );
}

function MeasureBar({
  label,
  actual,
  target,
  format,
  reduce,
}: {
  label: string;
  actual: number;
  target: number;
  format: (n: number) => string;
  reduce: boolean;
}) {
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  const tone = pct >= 100 ? GREEN : pct >= 60 ? AMBER : "var(--color-altus-red-deep)";
  const [reveal, setReveal] = React.useState(reduce);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
        <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
          <span className="font-black" style={{ color: tone }}>
            {format(actual)}
          </span>{" "}
          of {format(target)} · <span className="font-black" style={{ color: tone }}>{pct}%</span>
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 1px 2px rgba(15,23,42,0.06)" }}>
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: reveal ? `${Math.min(100, pct)}%` : "0%",
            background: `linear-gradient(90deg, ${tone}, color-mix(in srgb, ${tone} 70%, #fff))`,
            transition: reduce ? undefined : "width 700ms cubic-bezier(0.2,0,0,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ====================================================================== */
/* 9 · Drill-down panel                                                   */
/* ====================================================================== */

function DrillPanel({ drill, rows, onClose }: { drill: Drill; rows: Row[]; onClose: () => void }) {
  return (
    <section
      className="wg-rise rounded-2xl px-5 py-4"
      style={{
        background: "var(--color-surface-card)",
        border: `1px solid color-mix(in srgb, ${drill.color} 40%, var(--color-hairline-strong))`,
        boxShadow: `0 12px 34px -22px ${drill.color}`,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: drill.color }} />
          <h3 className="text-[14px] font-bold text-ink-strong">{drill.label}</h3>
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums text-white" style={{ background: drill.color }}>
            {rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drill-down"
          className={`inline-flex items-center gap-1 rounded-full border border-hairline-strong px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong cursor-pointer ${FOCUS_RING}`}
        >
          <X size={13} strokeWidth={2.6} /> Clear
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] font-semibold text-ink-subtle">No goals in this segment.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
          {rows.map((r) => {
            const meta = BAND_META[r.band];
            return (
              <li key={r.g.id} className="flex items-center gap-3 py-2">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-black tabular-nums"
                  style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                >
                  {r.eff}%
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-ink-strong" title={r.g.title}>
                    {r.g.title}
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-subtle">
                    <span>{periodKeyLabel(r.g.periodKey)}</span>
                    {r.g.area && <span className="truncate">· {r.g.area}</span>}
                    <span style={{ color: meta.color }}>· {meta.short}</span>
                  </div>
                </div>
                <span
                  className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full max-sm:hidden"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, r.eff)}%`, background: meta.color }} />
                  <span
                    className="absolute inset-y-[-2px] w-[2px]"
                    style={{ left: `${Math.min(100, r.h.expected)}%`, background: "var(--color-ink-strong)", opacity: 0.5 }}
                    aria-hidden
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ====================================================================== */
/* Skeleton + empty                                                       */
/* ====================================================================== */

const SHIMMER: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.09) 50%, rgba(15,23,42,0.05) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeletonShimmer 1.4s ease-in-out infinite",
  border: "1px solid var(--color-hairline)",
};

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden aria-busy="true">
      <div className="h-8 w-72 rounded-full" style={SHIMMER} />
      <div className="h-[196px] rounded-2xl" style={SHIMMER} />
      <CardGrid min={190} gap="0.7rem">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[108px] rounded-2xl" style={SHIMMER} />
        ))}
      </CardGrid>
      <div className="grid grid-cols-[1.05fr_1.35fr] gap-4 max-xl:grid-cols-1">
        <div className="h-[240px] rounded-2xl" style={SHIMMER} />
        <div className="h-[240px] rounded-2xl" style={SHIMMER} />
      </div>
    </div>
  );
}

function DashboardEmpty({ level }: { level: GoalPeriod }) {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <span
        className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
      >
        <Target size={30} strokeWidth={2.2} />
      </span>
      <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
        No adopted {(LEVEL_NOUN[level] ?? "").toLowerCase()} goals yet
      </h3>
      <p className="mx-auto mt-2 max-w-[48ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Adopt {(LEVEL_NOUN[level] ?? "new").toLowerCase()} goals to light up the OKR gauge, pace distribution,
        the at-risk action list and cascade coverage analytics here.
      </p>
    </div>
  );
}
