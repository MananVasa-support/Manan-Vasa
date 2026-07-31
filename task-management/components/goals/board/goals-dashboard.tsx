"use client";

/**
 * GOALS DASHBOARD — executive analytics view (PHASE 1).
 *
 * A third board view (alongside List and Kanban) that turns the ALREADY-LOADED
 * `GoalDTO[]` into an at-a-glance executive read of one level (Yearly /
 * Quarterly / Monthly) or the Weekly board. Everything here is a pure,
 * CLIENT-SIDE projection of the goals the board already holds — zero new DB
 * queries, recomputed automatically whenever the goals prop changes.
 *
 * Content (Phase 1):
 *   A · Completion-bucket distribution (0–25 / 26–50 / 51–75 / 76–100) as
 *       animated horizontal bars (hero) + a compact SVG donut alternative.
 *       Click a bucket → inline drill-down of exactly those goals.
 *   B · Level-appropriate headline KPI cards (clickable-to-filter where noted).
 *   C · Goal-health summary (green ≥80 / amber ≥60 / red) as a segmented bar.
 *
 * PHASE 2 seams (NOT built here — see `// PHASE 2:` markers): time-series trend
 * charts, daily activity timeline, department/owner breakdown, workload
 * distribution, live push updates.
 */

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { Target, CheckCircle2, TrendingUp, CalendarClock, Layers, Activity, X } from "lucide-react";
import {
  type GoalDTO,
  effectiveGoalPct,
  periodKeyLabel,
  periodKeyShort,
  targetDateStatus,
  assignmentInfo,
} from "@/components/goals/cascade/util";
import { CardGrid } from "@/components/layout/card-grid";
import type { GoalPeriod } from "@/lib/goals/types";

/* ── Brand-consistent semantic hues (mirrors cascade/util's palette) ── */
const RED = "#b91c1c";
const ORANGE = "#c2410c";
const GOLD = "#a16207";
const GREEN = "#15803d";
const AMBER = "#b45309";
/* Assignment split hues — Self = neutral slate, Assigned = brand red. */
const ASSIGN_SELF = "#475569";
const ASSIGN_ASSIGNED = "#b91c1c";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/* ── Completion buckets (A) ─────────────────────────────────────────── */
type BucketKey = "0-25" | "26-50" | "51-75" | "76-100";
interface BucketDef {
  key: BucketKey;
  label: string;
  color: string;
  test: (p: number) => boolean;
}
const BUCKETS: BucketDef[] = [
  { key: "0-25", label: "0–25%", color: RED, test: (p) => p <= 25 },
  { key: "26-50", label: "26–50%", color: ORANGE, test: (p) => p > 25 && p <= 50 },
  { key: "51-75", label: "51–75%", color: GOLD, test: (p) => p > 50 && p <= 75 },
  { key: "76-100", label: "76–100%", color: GREEN, test: (p) => p > 75 },
];
function bucketOf(p: number): BucketKey {
  if (p <= 25) return "0-25";
  if (p <= 50) return "26-50";
  if (p <= 75) return "51-75";
  return "76-100";
}

/* ── Health bands (C) — green ≥80 / amber ≥60 / red ─────────────────── */
type HealthBand = "green" | "amber" | "red";
function healthOf(p: number): HealthBand {
  if (p >= 80) return "green";
  if (p >= 60) return "amber";
  return "red";
}
const HEALTH_META: Record<HealthBand, { label: string; color: string }> = {
  green: { label: "Healthy", color: GREEN },
  amber: { label: "Watch", color: AMBER },
  red: { label: "At risk", color: RED },
};

/* ── Level vocabulary ───────────────────────────────────────────────── */
const CHILD_OF: Record<string, GoalPeriod | null> = {
  year: "quarter",
  quarter: "month",
  month: "week",
  week: null,
};
const LEVEL_NOUN: Record<string, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
};
const CHILD_NOUN: Record<string, string> = {
  year: "Quarter",
  quarter: "Month",
  month: "Week",
  week: "",
};

/* ── A single drill-down filter descriptor ──────────────────────────── */
interface Drill {
  id: string;
  label: string;
  color: string;
  test: (g: GoalDTO) => boolean;
}

/* ── Small count-up for headline numbers (reduced-motion → instant) ──── */
function useCountUp(target: number, enabled: boolean): number {
  const [val, setVal] = React.useState(enabled ? 0 : target);
  React.useEffect(() => {
    if (!enabled) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 620;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return val;
}

export interface GoalsDashboardProps {
  /** The FULL loaded cascade set (all levels) for the viewed person + FY. On the
   *  weekly board this is the adopted week rows mapped to GoalDTO. */
  allGoals: GoalDTO[];
  /** The level this dashboard summarises. */
  level: GoalPeriod;
  fyStartYear: number;
}

export function GoalsDashboard({ allGoals, level, fyStartYear }: GoalsDashboardProps) {
  const reduce = useReducedMotion() ?? false;

  // Skeleton on the very first client mount → a premium reveal even though the
  // data is synchronous (props). Flips true one frame in.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Derived sets (recompute whenever goals change) ────────────────
  const levelGoals = React.useMemo(
    () => allGoals.filter((g) => g.period === level),
    [allGoals, level],
  );
  const childPeriod = CHILD_OF[level] ?? null;
  const childGoals = React.useMemo(
    () => (childPeriod ? allGoals.filter((g) => g.period === childPeriod) : []),
    [allGoals, childPeriod],
  );

  const pctOf = React.useCallback((g: GoalDTO) => Math.round(effectiveGoalPct(g)), []);

  const stats = React.useMemo(() => {
    const total = levelGoals.length;
    let done = 0;
    let notStarted = 0;
    let inProgress = 0;
    let onTrackActive = 0; // incomplete + on pace
    let offTrack = 0; // incomplete + (overdue OR < 60%)
    let sum = 0;
    let overdue = 0;
    let hasTargetDates = false;
    const health: Record<HealthBand, number> = { green: 0, amber: 0, red: 0 };
    const bucketCount: Record<BucketKey, number> = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0 };
    for (const g of levelGoals) {
      const p = pctOf(g);
      sum += p;
      bucketCount[bucketOf(p)] += 1;
      health[healthOf(p)] += 1;
      const isOverdue = g.targetDate ? (targetDateStatus(g.targetDate).daysLeft ?? 0) < 0 : false;
      if (g.targetDate) hasTargetDates = true;
      if (p >= 100) {
        done += 1;
      } else {
        if (p === 0) notStarted += 1;
        else inProgress += 1;
        // On/off track applies only to unfinished goals (confirmed rule):
        // off = past its target date OR effective % < 60; else on track.
        if (isOverdue || p < 60) offTrack += 1;
        else onTrackActive += 1;
        if (isOverdue) overdue += 1;
      }
    }
    const avg = total ? Math.round(sum / total) : 0;
    const onTrack = health.green + health.amber; // p ≥ 60 (all goals — used by the KPI card)
    const atRisk = health.red;
    return { total, done, notStarted, inProgress, onTrackActive, offTrack, avg, overdue, hasTargetDates, health, bucketCount, onTrack, atRisk };
  }, [levelGoals, pctOf]);

  // Child count — "—" when the child rows aren't in the loaded set (esp.
  // Monthly → Week: weekly-execution rows live on `weekly_goals`, not here).
  const childCountDisplay = childPeriod && childGoals.length > 0 ? childGoals.length : "—";

  // Assignment split — Self (owner-created) vs Assigned (created by someone else).
  const assignSplit = React.useMemo(() => {
    let self = 0;
    let assigned = 0;
    let delegated = 0; // handed to a team member (delegatedTo) — can overlap self/assigned
    for (const g of levelGoals) {
      if (assignmentInfo(g).type === "assigned") assigned += 1;
      else self += 1;
      if ((g.delegatedTo?.length ?? 0) > 0) delegated += 1;
    }
    return { self, assigned, delegated };
  }, [levelGoals]);

  // Area-wise distribution — goals per focus Area (biggest first).
  const byArea = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const g of levelGoals) {
      const a = g.area?.trim() ? g.area.trim() : "Unassigned";
      m.set(a, (m.get(a) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [levelGoals]);

  // ── KPI cards (level-appropriate) ─────────────────────────────────
  const donePctText = stats.total ? `${Math.round((stats.done / stats.total) * 100)}%` : "—";

  interface Kpi {
    key: string;
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
    accent: string;
    drill?: Drill;
  }
  const kpis: Kpi[] = React.useMemo(() => {
    const childNoun = CHILD_NOUN[level];
    const doneDrill: Drill = { id: "done", label: "Completed goals", color: GREEN, test: (g) => pctOf(g) >= 100 };
    const notDoneDrill: Drill = { id: "notdone", label: "Not-done goals", color: AMBER, test: (g) => pctOf(g) < 100 };
    const onTrackDrill: Drill = { id: "ontrack", label: "On-track goals", color: GREEN, test: (g) => pctOf(g) >= 60 };
    const atRiskDrill: Drill = { id: "atrisk", label: "At-risk goals", color: RED, test: (g) => pctOf(g) < 60 };
    const overdueDrill: Drill = {
      id: "overdue",
      label: "Overdue goals",
      color: RED,
      test: (g) => !!g.targetDate && pctOf(g) < 100 && (targetDateStatus(g.targetDate).daysLeft ?? 0) < 0,
    };
    const overdueDisplay = stats.hasTargetDates ? stats.overdue : "—";

    if (level === "week") {
      return [
        { key: "done", icon: <CheckCircle2 size={17} strokeWidth={2.4} />, label: "Done", value: stats.done, sub: `${donePctText} of ${stats.total}`, accent: GREEN, drill: doneDrill },
        { key: "notdone", icon: <Layers size={17} strokeWidth={2.4} />, label: "Not done", value: stats.total - stats.done, sub: "pending this week", accent: AMBER, drill: notDoneDrill },
        { key: "rate", icon: <TrendingUp size={17} strokeWidth={2.4} />, label: "Completion rate", value: donePctText, sub: `avg ${stats.avg}%`, accent: "var(--color-altus-red-deep)" },
        { key: "overdue", icon: <CalendarClock size={17} strokeWidth={2.4} />, label: "Overdue", value: overdueDisplay, sub: "past target date", accent: RED, drill: stats.hasTargetDates ? overdueDrill : undefined },
      ];
    }
    if (level === "year") {
      // Health-first (audit #26): lead with goal health, not a quarterly count.
      return [
        { key: "total", icon: <Layers size={17} strokeWidth={2.4} />, label: "Total goals", value: stats.total, sub: "tracked this year", accent: "var(--color-altus-red-deep)" },
        { key: "done", icon: <CheckCircle2 size={17} strokeWidth={2.4} />, label: "Completed", value: stats.done, sub: `${donePctText} at 100%`, accent: GREEN, drill: doneDrill },
        { key: "avg", icon: <TrendingUp size={17} strokeWidth={2.4} />, label: "Avg progress", value: `${stats.avg}%`, sub: "across yearly goals", accent: "var(--color-altus-red-deep)" },
        { key: "ontrack", icon: <Activity size={17} strokeWidth={2.4} />, label: "On-track", value: stats.onTrack, sub: `${stats.atRisk} at risk`, accent: stats.atRisk > stats.onTrack ? RED : GREEN, drill: onTrackDrill },
      ];
    }
    if (level === "quarter") {
      return [
        { key: "child", icon: <Layers size={17} strokeWidth={2.4} />, label: `${childNoun} goals`, value: childCountDisplay, sub: "one level down", accent: "var(--color-altus-red-deep)" },
        { key: "done", icon: <CheckCircle2 size={17} strokeWidth={2.4} />, label: "Completion", value: donePctText, sub: `${stats.done} of ${stats.total} done`, accent: GREEN, drill: doneDrill },
        { key: "avg", icon: <TrendingUp size={17} strokeWidth={2.4} />, label: "Avg progress", value: `${stats.avg}%`, sub: "across quarter goals", accent: "var(--color-altus-red-deep)" },
        { key: "overdue", icon: <CalendarClock size={17} strokeWidth={2.4} />, label: "Delayed", value: overdueDisplay, sub: "overdue by target date", accent: RED, drill: stats.hasTargetDates ? overdueDrill : undefined },
      ];
    }
    // month
    return [
      { key: "child", icon: <Layers size={17} strokeWidth={2.4} />, label: `${childNoun} goals`, value: childCountDisplay, sub: childCountDisplay === "—" ? "tracked in Weekly" : "one level down", accent: "var(--color-altus-red-deep)" },
      { key: "done", icon: <CheckCircle2 size={17} strokeWidth={2.4} />, label: "Done", value: `${stats.done} / ${stats.total}`, sub: `${donePctText} complete`, accent: GREEN, drill: doneDrill },
      { key: "avg", icon: <TrendingUp size={17} strokeWidth={2.4} />, label: "Avg completion", value: `${stats.avg}%`, sub: "across monthly goals", accent: "var(--color-altus-red-deep)" },
      { key: "overdue", icon: <CalendarClock size={17} strokeWidth={2.4} />, label: "Overdue", value: overdueDisplay, sub: "past target date", accent: RED, drill: stats.hasTargetDates ? overdueDrill : undefined },
    ];
  }, [level, stats, donePctText, childCountDisplay, pctOf]);

  // ── Drill-down state (click a bucket / KPI / health chip) ─────────
  const [drill, setDrill] = React.useState<Drill | null>(null);
  const toggleDrill = React.useCallback((d: Drill) => {
    setDrill((cur) => (cur?.id === d.id ? null : d));
  }, []);
  const drilled = React.useMemo(
    () => (drill ? levelGoals.filter(drill.test).sort((a, b) => pctOf(b) - pctOf(a)) : []),
    [drill, levelGoals, pctOf],
  );

  // Every goal ranked by score (audit #26: a score per individual goal).
  const scoredGoals = React.useMemo(
    () => [...levelGoals].sort((a, b) => pctOf(b) - pctOf(a)),
    [levelGoals, pctOf],
  );

  // ── Empty + skeleton states ───────────────────────────────────────
  if (!mounted) return <DashboardSkeleton />;
  if (levelGoals.length === 0) return <DashboardEmpty level={level} />;

  return (
    <div className="flex flex-col gap-5">
      {/* Eyebrow strip */}
      <div className="wg-rise flex items-baseline gap-2.5">
        <h2
          className="font-bold text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 19, letterSpacing: "-0.02em" }}
        >
          {LEVEL_NOUN[level]} Overview
        </h2>
        <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          {stats.total} goal{stats.total === 1 ? "" : "s"} · {periodKeyShort(String(fyStartYear))}
        </span>
      </div>

      {/* Status — completed · in progress · not started · on/off track */}
      <CardGrid min={148} gap="0.625rem">
        {([
          { label: "Completed", value: stats.done, tone: GREEN, sub: stats.total ? `${Math.round((stats.done / stats.total) * 100)}% of ${stats.total}` : "—" },
          { label: "In progress", value: stats.inProgress, tone: "var(--color-altus-red-deep)", sub: "started, < 100%" },
          { label: "Not started", value: stats.notStarted, tone: "var(--color-ink-subtle)", sub: "at 0%" },
          { label: "On track", value: stats.onTrackActive, tone: GREEN, sub: "on pace" },
          { label: "Off track", value: stats.offTrack, tone: RED, sub: "overdue / behind" },
        ] as const).map((s) => (
          <div
            key={s.label}
            className="wg-rise rounded-2xl bg-surface-card p-3.5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <div className="text-[10.5px] font-black uppercase tracking-[0.06em]" style={{ color: s.tone }}>{s.label}</div>
            <div className="mt-1 tabular-nums font-black text-ink-strong" style={{ fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-ink-subtle">{s.sub}</div>
          </div>
        ))}
      </CardGrid>

      {/* B · KPI cards */}
      <CardGrid min={200} gap="0.75rem">
        {kpis.map((k, i) => (
          <KpiCard
            key={k.key}
            kpi={k}
            index={i}
            reduce={reduce}
            active={drill?.id === k.drill?.id && !!k.drill}
            onSelect={k.drill ? () => toggleDrill(k.drill!) : undefined}
          />
        ))}
      </CardGrid>

      {/* A · Distribution bars (hero) + donut alternative */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <BucketBars
          counts={stats.bucketCount}
          total={stats.total}
          activeKey={drill?.id?.startsWith("bucket:") ? (drill.id.slice(7) as BucketKey) : null}
          reduce={reduce}
          onPick={(b) =>
            toggleDrill({
              id: `bucket:${b.key}`,
              label: `Goals at ${b.label}`,
              color: b.color,
              test: (g) => b.test(pctOf(g)),
            })
          }
        />
        <div className="flex flex-col gap-4">
          <BucketDonut counts={stats.bucketCount} total={stats.total} reduce={reduce} />
          {/* C · Goal-health summary */}
          <HealthBar
            health={stats.health}
            total={stats.total}
            reduce={reduce}
            activeBand={drill?.id?.startsWith("health:") ? (drill.id.slice(7) as HealthBand) : null}
            onPick={(band) =>
              toggleDrill({
                id: `health:${band}`,
                label: `${HEALTH_META[band].label} goals`,
                color: HEALTH_META[band].color,
                test: (g) => healthOf(pctOf(g)) === band,
              })
            }
          />
          {/* Self vs Assigned split — click a side to drill into those goals. */}
          <AssignmentSplit
            split={assignSplit}
            activeKind={drill?.id?.startsWith("assign:") ? (drill.id.slice(7) as "self" | "assigned") : null}
            onPick={(kind) =>
              toggleDrill({
                id: `assign:${kind}`,
                label: kind === "self" ? "Self-created goals" : "Assigned goals",
                color: kind === "self" ? ASSIGN_SELF : ASSIGN_ASSIGNED,
                test: (g) => assignmentInfo(g).type === kind,
              })
            }
          />
        </div>
      </div>

      {/* Breakdown — assignment (self / assigned / delegated) + area distribution */}
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div className="wg-rise rounded-2xl bg-surface-card p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <h3 className="mb-3 text-[12.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">Assignment</h3>
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: "Self", value: assignSplit.self, tone: ASSIGN_SELF, hint: "created by you" },
              { label: "Assigned", value: assignSplit.assigned, tone: ASSIGN_ASSIGNED, hint: "given to you" },
              { label: "Delegated", value: assignSplit.delegated, tone: "var(--color-blue-deep)", hint: "handed to a member" },
            ] as const).map((a) => (
              <div key={a.label} className="rounded-xl px-3 py-3" style={{ background: `color-mix(in srgb, ${a.tone} 8%, transparent)` }}>
                <div className="tabular-nums font-black" style={{ fontSize: 24, color: a.tone, lineHeight: 1 }}>{a.value}</div>
                <div className="mt-1 text-[12.5px] font-bold text-ink-strong">{a.label}</div>
                <div className="text-[10.5px] font-medium text-ink-subtle">{a.hint}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="wg-rise rounded-2xl bg-surface-card p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <h3 className="mb-3 text-[12.5px] font-black uppercase tracking-[0.08em] text-ink-subtle">By area</h3>
          {byArea.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">No goals yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {byArea.slice(0, 8).map(([area, n]) => {
                const max = byArea[0]?.[1] ?? 1;
                return (
                  <li key={area} className="flex items-center gap-2.5">
                    <span className="w-[38%] min-w-0 truncate text-[13px] font-bold text-ink-strong" title={area}>{area}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round((n / max) * 100)}%`, background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
                    </span>
                    <span className="w-7 shrink-0 text-right text-[13px] font-black tabular-nums text-ink-strong">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Per-goal scores — health of every individual goal at this level */}
      <GoalScores goals={scoredGoals} pctOf={pctOf} level={level} />

      {/* Drill-down — inline list of the goals behind the clicked segment */}
      {drill && <DrillPanel drill={drill} goals={drilled} pctOf={pctOf} onClose={() => setDrill(null)} />}

      {/* PHASE 2: quarter/month/week progress-over-time trend charts go here. */}
      {/* PHASE 2: daily activity timeline. */}
      {/* PHASE 2: department / owner breakdown + workload distribution charts. */}
      {/* PHASE 2: live push updates (currently recomputes from props on change). */}
    </div>
  );
}

/* ================================================================== */
/* KPI card                                                            */
/* ================================================================== */

function KpiCard({
  kpi,
  index,
  reduce,
  active,
  onSelect,
}: {
  kpi: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
    accent: string;
  };
  index: number;
  reduce: boolean;
  active: boolean;
  onSelect?: () => void;
}) {
  // Count-up only when the value is a bare number.
  const numeric = typeof kpi.value === "number";
  const animated = useCountUp(numeric ? (kpi.value as number) : 0, !reduce && numeric);
  const shown = numeric ? Math.round(animated).toString() : String(kpi.value);

  const clickable = !!onSelect;
  const Tag: React.ElementType = clickable ? "button" : "div";

  return (
    <Tag
      {...(clickable ? { type: "button", onClick: onSelect, "aria-pressed": active } : {})}
      className={`wg-rise group relative overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-all ${clickable ? `cursor-pointer hover:-translate-y-0.5 ${FOCUS_RING}` : ""}`}
      style={{
        animationDelay: `${index * 45}ms`,
        background: active
          ? `color-mix(in srgb, ${kpi.accent} 9%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        border: `1px solid ${active ? `color-mix(in srgb, ${kpi.accent} 45%, transparent)` : "var(--color-hairline-strong)"}`,
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 26px -16px ${kpi.accent}`
          : "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-60 transition-opacity group-hover:opacity-90"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${kpi.accent} 12%, transparent), transparent 68%)` }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${kpi.accent} 12%, transparent)`, color: kpi.accent }}
        >
          {kpi.icon}
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">{kpi.label}</span>
      </div>
      <div
        className="relative mt-2 font-black tabular-nums leading-none text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 30, letterSpacing: "-0.02em" }}
      >
        {shown}
      </div>
      {kpi.sub && <div className="relative mt-1.5 text-[12px] font-semibold text-ink-subtle">{kpi.sub}</div>}
    </Tag>
  );
}

/* ================================================================== */
/* A · Distribution bars (hero)                                        */
/* ================================================================== */

function BucketBars({
  counts,
  total,
  activeKey,
  reduce,
  onPick,
}: {
  counts: Record<BucketKey, number>;
  total: number;
  activeKey: BucketKey | null;
  reduce: boolean;
  onPick: (b: BucketDef) => void;
}) {
  const max = Math.max(1, ...BUCKETS.map((b) => counts[b.key]));
  // Reveal: render at width 0 on first paint, flip to full one frame later so
  // the CSS width-transition animates in (skipped under reduced motion).
  const [reveal, setReveal] = React.useState(reduce);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <section
      className="wg-rise rounded-2xl px-5 py-4"
      style={{ animationDelay: "120ms", background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-black uppercase tracking-[0.1em] text-ink-soft">Completion spread</h3>
        <span className="text-[11.5px] font-semibold text-ink-subtle">click a band to drill in</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {BUCKETS.map((b) => {
          const c = counts[b.key];
          const pctTotal = total ? Math.round((c / total) * 100) : 0;
          const w = reveal ? (c / max) * 100 : 0;
          const active = activeKey === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onPick(b)}
              aria-pressed={active}
              aria-label={`${b.label}: ${c} goal${c === 1 ? "" : "s"}, ${pctTotal}% of total`}
              title={`${c} goal${c === 1 ? "" : "s"} · ${pctTotal}% of ${total}`}
              className={`group grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,transparent)] cursor-pointer ${FOCUS_RING}`}
              style={active ? { background: `color-mix(in srgb, ${b.color} 8%, transparent)` } : undefined}
            >
              <span className="text-[12px] font-bold tabular-nums text-ink-soft text-right">{b.label}</span>
              <span className="relative h-6 overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 1px 2px rgba(15,23,42,0.06)" }}>
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${w}%`,
                    minWidth: c > 0 ? 8 : 0,
                    background: `linear-gradient(90deg, ${b.color}, color-mix(in srgb, ${b.color} 72%, #fff))`,
                    boxShadow: active ? `0 0 0 1.5px color-mix(in srgb, ${b.color} 55%, transparent)` : "inset 0 1px 0 rgba(255,255,255,0.3)",
                    transition: reduce ? undefined : "width 720ms cubic-bezier(0.2,0,0,1)",
                  }}
                />
              </span>
              <span className="flex items-baseline gap-1.5 justify-end min-w-[64px]">
                <span className="text-[15px] font-black tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{c}</span>
                <span className="text-[11.5px] font-bold tabular-nums text-ink-subtle">{pctTotal}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* A · Distribution donut (compact alternative)                        */
/* ================================================================== */

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, rO: number, rI: number, start: number, end: number): string {
  const large = end - start > 180 ? 1 : 0;
  const a = polar(cx, cy, rO, end);
  const b = polar(cx, cy, rO, start);
  const c = polar(cx, cy, rI, start);
  const d = polar(cx, cy, rI, end);
  return `M ${a.x} ${a.y} A ${rO} ${rO} 0 ${large} 0 ${b.x} ${b.y} L ${c.x} ${c.y} A ${rI} ${rI} 0 ${large} 1 ${d.x} ${d.y} Z`;
}

function BucketDonut({ counts, total, reduce }: { counts: Record<BucketKey, number>; total: number; reduce: boolean }) {
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const rO = size / 2 - 2;
  const rI = Math.round(rO * 0.6);
  const segs = BUCKETS.map((b) => ({ ...b, value: counts[b.key] })).filter((s) => s.value > 0);
  let cursor = 0;
  return (
    <section
      className="wg-rise rounded-2xl px-4 py-4"
      style={{ animationDelay: "160ms", background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h3 className="mb-2 text-[13px] font-black uppercase tracking-[0.1em] text-ink-soft">By band</h3>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} role="img" aria-label="Completion distribution donut">
            {segs.length === 0 ? (
              <circle cx={cx} cy={cy} r={(rO + rI) / 2} fill="none" stroke="var(--color-surface-soft)" strokeWidth={rO - rI} />
            ) : (
              segs.map((s) => {
                const sweep = (s.value / total) * 360;
                const start = cursor;
                const end = cursor + sweep;
                cursor = end;
                // Full-circle guard (single non-zero band).
                if (sweep >= 359.99) {
                  return <circle key={s.key} cx={cx} cy={cy} r={(rO + rI) / 2} fill="none" stroke={s.color} strokeWidth={rO - rI} />;
                }
                return (
                  <path
                    key={s.key}
                    d={arcPath(cx, cy, rO, rI, start, end)}
                    fill={s.color}
                    stroke="var(--color-surface-card)"
                    strokeWidth={1.5}
                    style={reduce ? undefined : { animation: "fadeUp 480ms both" }}
                  >
                    <title>{`${s.label}: ${s.value} · ${Math.round((s.value / total) * 100)}%`}</title>
                  </path>
                );
              })
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-black tabular-nums leading-none text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 22 }}>{total}</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-subtle">goals</span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {BUCKETS.map((b) => (
            <li key={b.key} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
              <span className="font-semibold text-ink-soft">{b.label}</span>
              <span className="ml-auto font-bold tabular-nums text-ink-strong">{counts[b.key]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ================================================================== */
/* C · Goal-health segmented bar                                       */
/* ================================================================== */

function HealthBar({
  health,
  total,
  reduce,
  activeBand,
  onPick,
}: {
  health: Record<HealthBand, number>;
  total: number;
  reduce: boolean;
  activeBand: HealthBand | null;
  onPick: (b: HealthBand) => void;
}) {
  const order: HealthBand[] = ["green", "amber", "red"];
  return (
    <section
      className="wg-rise rounded-2xl px-4 py-4"
      style={{ animationDelay: "200ms", background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h3 className="mb-2.5 text-[13px] font-black uppercase tracking-[0.1em] text-ink-soft">Goal health</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
        {order.map((band) => {
          const c = health[band];
          const w = total ? (c / total) * 100 : 0;
          if (w === 0) return null;
          return (
            <span
              key={band}
              className="h-full"
              style={{
                width: `${w}%`,
                background: HEALTH_META[band].color,
                transition: reduce ? undefined : "width 640ms cubic-bezier(0.2,0,0,1)",
                opacity: activeBand && activeBand !== band ? 0.4 : 1,
              }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {order.map((band) => {
          const c = health[band];
          const active = activeBand === band;
          return (
            <button
              key={band}
              type="button"
              onClick={() => onPick(band)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums transition-colors cursor-pointer ${FOCUS_RING}`}
              style={{
                borderColor: active ? HEALTH_META[band].color : "var(--color-hairline-strong)",
                background: active ? `color-mix(in srgb, ${HEALTH_META[band].color} 12%, transparent)` : "transparent",
                color: "var(--color-ink-soft)",
              }}
            >
              <span className="size-2.5 rounded-full" style={{ background: HEALTH_META[band].color }} />
              {HEALTH_META[band].label}
              <span className="text-ink-strong">{c}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* Assignment split — Self vs Assigned (counts + click-to-drill)       */
/* ================================================================== */

function AssignmentSplit({
  split,
  activeKind,
  onPick,
}: {
  split: { self: number; assigned: number };
  activeKind: "self" | "assigned" | null;
  onPick: (kind: "self" | "assigned") => void;
}) {
  const total = split.self + split.assigned;
  const rows: Array<{ kind: "self" | "assigned"; label: string; count: number; color: string }> = [
    { kind: "self", label: "Self", count: split.self, color: ASSIGN_SELF },
    { kind: "assigned", label: "Assigned", count: split.assigned, color: ASSIGN_ASSIGNED },
  ];
  return (
    <section
      className="wg-rise rounded-2xl px-4 py-4"
      style={{ animationDelay: "240ms", background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <h3 className="mb-2.5 text-[13px] font-black uppercase tracking-[0.1em] text-ink-soft">Assignment</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
        {rows.map((r) => {
          const w = total ? (r.count / total) * 100 : 0;
          if (w === 0) return null;
          return (
            <span
              key={r.kind}
              className="h-full"
              style={{ width: `${w}%`, background: r.color, opacity: activeKind && activeKind !== r.kind ? 0.4 : 1 }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((r) => {
          const active = activeKind === r.kind;
          return (
            <button
              key={r.kind}
              type="button"
              onClick={() => onPick(r.kind)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold tabular-nums transition-colors cursor-pointer ${FOCUS_RING}`}
              style={{
                borderColor: active ? r.color : "var(--color-hairline-strong)",
                background: active ? `color-mix(in srgb, ${r.color} 12%, transparent)` : "transparent",
                color: "var(--color-ink-soft)",
              }}
            >
              <span className="size-2.5 rounded-full" style={{ background: r.color }} />
              {r.label}
              <span className="text-ink-strong">{r.count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* Per-goal scores — health of every individual goal                   */
/* ================================================================== */

function GoalScores({
  goals,
  pctOf,
  level,
}: {
  goals: GoalDTO[];
  pctOf: (g: GoalDTO) => number;
  level: GoalPeriod;
}) {
  if (goals.length === 0) return null;
  return (
    <section
      className="wg-rise rounded-2xl px-5 py-4"
      style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-black uppercase tracking-[0.1em] text-ink-soft">
          {LEVEL_NOUN[level]} goal scores
        </h3>
        <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">
          {goals.length} goal{goals.length === 1 ? "" : "s"} · highest first
        </span>
      </div>
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
        {goals.map((g) => {
          const p = pctOf(g);
          const band = healthOf(p);
          return (
            <li key={g.id} className="flex items-center gap-3 py-2">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-black tabular-nums"
                style={{ background: `color-mix(in srgb, ${HEALTH_META[band].color} 12%, transparent)`, color: HEALTH_META[band].color }}
              >
                {p}%
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-ink-strong" title={g.title}>{g.title}</div>
                <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-subtle">
                  <span>{periodKeyLabel(g.periodKey)}</span>
                  {g.area && <span className="truncate">· {g.area}</span>}
                </div>
              </div>
              <span className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full max-sm:hidden" style={{ background: "var(--color-surface-soft)" }}>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, p)}%`, background: HEALTH_META[band].color }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ================================================================== */
/* Drill-down panel                                                    */
/* ================================================================== */

function DrillPanel({
  drill,
  goals,
  pctOf,
  onClose,
}: {
  drill: Drill;
  goals: GoalDTO[];
  pctOf: (g: GoalDTO) => number;
  onClose: () => void;
}) {
  return (
    <section
      className="wg-rise rounded-2xl px-5 py-4"
      style={{ background: "var(--color-surface-card)", border: `1px solid color-mix(in srgb, ${drill.color} 40%, var(--color-hairline-strong))`, boxShadow: `0 10px 30px -20px ${drill.color}` }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: drill.color }} />
          <h3 className="text-[14px] font-bold text-ink-strong">{drill.label}</h3>
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums text-white" style={{ background: drill.color }}>{goals.length}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drill-down"
          className={`inline-flex items-center gap-1 rounded-full border border-hairline-strong px-2.5 py-1 text-[12px] font-bold text-ink-soft hover:text-ink-strong transition-colors cursor-pointer ${FOCUS_RING}`}
        >
          <X size={13} strokeWidth={2.6} /> Clear
        </button>
      </div>
      {goals.length === 0 ? (
        <p className="py-4 text-center text-[13px] font-semibold text-ink-subtle">No goals in this segment.</p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--color-hairline)" }}>
          {goals.map((g) => {
            const p = pctOf(g);
            const band = healthOf(p);
            return (
              <li key={g.id} className="flex items-center gap-3 py-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-black tabular-nums" style={{ background: `color-mix(in srgb, ${HEALTH_META[band].color} 12%, transparent)`, color: HEALTH_META[band].color }}>
                  {p}%
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-ink-strong">{g.title}</div>
                  <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-subtle">
                    <span>{periodKeyLabel(g.periodKey)}</span>
                    {g.area && <span className="truncate">· {g.area}</span>}
                  </div>
                </div>
                <span className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full max-sm:hidden" style={{ background: "var(--color-surface-soft)" }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, p)}%`, background: HEALTH_META[band].color }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* Skeleton + empty                                                    */
/* ================================================================== */

const SHIMMER: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.09) 50%, rgba(15,23,42,0.05) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeletonShimmer 1.4s ease-in-out infinite",
  border: "1px solid var(--color-hairline)",
};

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden aria-busy="true">
      <div className="h-6 w-52 rounded-lg" style={SHIMMER} />
      <CardGrid min={200} gap="0.75rem">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-2xl" style={SHIMMER} />
        ))}
      </CardGrid>
      <div className="grid grid-cols-[1.6fr_1fr] gap-4 max-lg:grid-cols-1">
        <div className="h-[220px] rounded-2xl" style={SHIMMER} />
        <div className="h-[220px] rounded-2xl" style={SHIMMER} />
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
        No goals yet at this level
      </h3>
      <p className="mx-auto mt-2 max-w-[46ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Add {(LEVEL_NOUN[level] ?? "new").toLowerCase()} goals to light up completion spread, headline KPIs and goal-health analytics here.
      </p>
    </div>
  );
}
