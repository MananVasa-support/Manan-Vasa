"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PRIORITY_LABELS } from "@/db/enums";
import { AlertTriangle, Flame, ArrowDownUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { AGE_BUCKETS, type AgeBucketId } from "@/db/enums";
import type { AgingRow, HeatmapCellTask } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { Avatar } from "@/components/ui/avatar";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { AgingTaskDrawer } from "@/components/dashboard/aging-task-drawer";

// RISK-BANDED palette — four bands rather than a continuous hue ramp, so a lane
// reads as its risk level at a glance instead of "somewhere along a gradient":
//
//   On track   0-3 · 4-7    green-400 / emerald-400
//   Low        8-14         yellow-400
//   Medium     15-20 · 21-30 amber-500 / orange-500
//   High       31-45 · 46-60 · 60+  red-500 → red-600 → red-700
//
// `fill` is the Tailwind swatch named above; `deep` is the saturated label
// colour (kept 2–3 steps darker so text stays legible on `tint`), `light` is the
// gradient partner and `tint` the wash behind counts. The three High lanes step
/**
 * SEVEN SOLID TIERS. `fill` is the flat ground for the bar segment, the legend
 * pill and the popover's age chip; `ink` is the text that sits on it.
 *
 * Replaces a three-tier scheme (emerald / amber / rose) which collapsed eight
 * brackets into three colours — 31-45d and 60+d rendered identically, so the
 * bar could not show that one lane's backlog was twice as old as another's.
 *
 * `0-3` and `4-7` intentionally share emerald: the palette specifies a single
 * "0-7d" tier, while the underlying AGE_BUCKETS keep the two apart for counting.
 *
 * `deep` survives only as the focus-ring / popover-border colour. `light` is
 * gone with the vertical gradient it fed — solid fills read more honestly
 * against the white cards, and a gradient made two adjacent tiers blur into
 * each other at the seam.
 */
const BUCKET_COLOR: Record<AgeBucketId, { fill: string; ink: string; deep: string }> = {
  "0-3":   { fill: "#059669", ink: "#ffffff", deep: "#047857" }, // emerald-600 — fresh
  "4-7":   { fill: "#059669", ink: "#ffffff", deep: "#047857" }, // emerald-600 — fresh
  "8-14":  { fill: "#38bdf8", ink: "#111827", deep: "#0284c7" }, // sky-400    — low
  "15-20": { fill: "#fbbf24", ink: "#111827", deep: "#b45309" }, // amber-400  — moderate
  "21-30": { fill: "#f97316", ink: "#ffffff", deep: "#c2410c" }, // orange-500 — elevated
  "31-45": { fill: "#dc2626", ink: "#ffffff", deep: "#991b1b" }, // red-600    — high
  "46-60": { fill: "#991b1b", ink: "#ffffff", deep: "#7f1d1d" }, // red-800    — critical
  "60+":   { fill: "#6b21a8", ink: "#ffffff", deep: "#581c87" }, // purple-700 — extreme
};

const BUCKET_WEIGHT: Record<AgeBucketId, number> = {
  "0-3": 1, "4-7": 2, "8-14": 3, "15-20": 5,
  "21-30": 7, "31-45": 10, "46-60": 14, "60+": 20,
};

const CRITICAL_BUCKETS: AgeBucketId[] = ["31-45", "46-60", "60+"];

// Horizontal display order for THIS section only — oldest first, left → right:
// 60+ · 46-60 · 31-45 · 21-30 · 15-20 · 8-14 · 4-7 · 0-3.
// The canonical AGE_BUCKETS (db/enums.ts) deliberately stays youngest-first:
// `computeAgingByDate` maps over it to build the ordered `agingByDate` payload,
// so reversing it there would silently reorder other consumers. Colors, counts
// and task lists are all keyed by `b.id`, so they follow this order for free.
const DISPLAY_BUCKETS = [...AGE_BUCKETS].reverse();

function riskScore(row: AgingRow): number {
  if (row.total === 0) return 0;
  const weighted = AGE_BUCKETS.reduce(
    (s, b) => s + row.buckets[b.id] * BUCKET_WEIGHT[b.id],
    0,
  );
  const raw = weighted / row.total;
  return Math.round(((raw - 1) / 19) * 100);
}

type SortMode = "risk" | "total" | "oldest";

export function AgingHeatmap({
  rows,
  cellTasks,
  avatarById = {},
  me,
}: {
  rows: AgingRow[];
  cellTasks: Record<string, Record<string, HeatmapCellTask[]>>;
  avatarById?: Record<string, string | null>;
  /** Needed by the drill-down drawer's inline status cell. */
  me: { id: string; isAdmin: boolean };
}) {
  const [open, setOpen] = React.useState(true);
  const [sortMode, setSortMode] = React.useState<SortMode>("risk");
  // "Critical Only" — keep just the people carrying 31d+ work. Reuses
  // CRITICAL_BUCKETS, the same definition the risk score and the red banner
  // already use, so "critical" means one thing across the widget.
  const [criticalOnly, setCriticalOnly] = React.useState(false);

  // Drill-down target. `employeeId: null` = "this bracket, everyone" (an age
  // badge); `bucketId: null` = "this person, every bracket" (a lane); both set
  // = one cell.
  const [drill, setDrill] = React.useState<{
    employeeId: string | null;
    bucketId: AgeBucketId | null;
  } | null>(null);
  const openDrill = React.useCallback(
    (employeeId: string | null, bucketId: AgeBucketId | null) =>
      setDrill({ employeeId, bucketId }),
    [],
  );

  // Pulled straight from `cellTasks` — the very rows the lanes counted, so the
  // drawer can never disagree with the bar that opened it. Oldest first: a
  // drill-down is a triage list.
  const drillTasks = React.useMemo(() => {
    if (!drill) return [] as HeatmapCellTask[];
    const out: HeatmapCellTask[] = [];
    for (const [empId, buckets] of Object.entries(cellTasks)) {
      if (drill.employeeId && empId !== drill.employeeId) continue;
      for (const [bId, list] of Object.entries(buckets)) {
        if (drill.bucketId && bId !== drill.bucketId) continue;
        out.push(...list);
      }
    }
    return out.sort((a, b) => b.ageDays - a.ageDays);
  }, [drill, cellTasks]);

  const drillTitle = React.useMemo(() => {
    if (!drill) return "";
    const label = drill.bucketId
      ? AGE_BUCKETS.find((b) => b.id === drill.bucketId)?.label ?? drill.bucketId
      : null;
    const who = drill.employeeId
      ? rows.find((r) => r.employeeId === drill.employeeId)?.employeeName ?? "Unknown"
      : null;
    if (who && label) return `Pending Tasks for ${who} — ${label}`;
    if (who) return `All Pending Tasks for ${who}`;
    return `All ${label} Overdue Tasks`;
  }, [drill, rows]);

  // FilterBar section search — narrows the lanes to matching people. Applied
  // before enrichment so the risk ranking, the header counts and the critical
  // banner all describe the lanes actually on screen.
  const sectionQuery = useSectionSearch();
  const searched = React.useMemo(
    () =>
      sectionQuery
        ? rows.filter((r) => matchesSearch(sectionQuery, r.employeeName))
        : rows,
    [rows, sectionQuery],
  );

  const enrichedAll = React.useMemo(
    () => searched.map((r) => ({ ...r, risk: riskScore(r) })),
    [searched],
  );

  // Applied BEFORE the counts below, so the header describes what is actually
  // on screen — the same reason the section search is applied before enrichment.
  // A lane's BARS keep their full age split: the toggle picks which PEOPLE are
  // listed, and hiding their under-31d work would misstate each person's load.
  const enriched = React.useMemo(
    () =>
      criticalOnly
        ? enrichedAll.filter(
            (r) => CRITICAL_BUCKETS.reduce((s, k) => s + r.buckets[k], 0) > 0,
          )
        : enrichedAll,
    [enrichedAll, criticalOnly],
  );

  const sorted = React.useMemo(() => {
    const copy = [...enriched];
    if (sortMode === "total") copy.sort((a, b) => b.total - a.total);
    else if (sortMode === "risk") copy.sort((a, b) => b.risk - a.risk);
    else
      copy.sort(
        (a, b) =>
          CRITICAL_BUCKETS.reduce((s, k) => s + b.buckets[k], 0) -
          CRITICAL_BUCKETS.reduce((s, k) => s + a.buckets[k], 0),
      );
    return copy;
  }, [enriched, sortMode]);

  const top12 = sorted.slice(0, 12);
  const maxTotal = Math.max(...top12.map((r) => r.total), 1);

  const totalAging = enriched.reduce((s, r) => s + r.total, 0);
  const criticalTotal = enriched.reduce(
    (s, r) => s + CRITICAL_BUCKETS.reduce((acc, k) => acc + r.buckets[k], 0),
    0,
  );

  return (
    <PageShell
      as="section"
      width="full"
      py={false}
      /* No page margins of its own any more: this section now sits inside the
         dashboard's tab container, which owns the padding and the rhythm
         between sections. `mb-16` in particular left 64px of dead space at the
         bottom of the Attention tab. */
      style={{
        opacity: 0,
        // 900ms suited being the FOURTH section of a long scroll — you had
        // scrolled to it by the time it faded in. Inside a tab it mounts the
        // instant you click Attention, so a near-second of blank read as a
        // failure to load.
        animation: "fadeUp 400ms ease-out 100ms forwards",
      }}
    >
      {/* Section header, OUTSIDE the card — see components/dashboard/
          section-header.tsx. The sort control comes with it so the whole
          header line reads as one bar above the heat lanes. */}
      <DashboardSectionHeader
        eyebrow="Tasks · Aging"
        icon={
          <Flame className="size-8" style={{ color: "#dc2626" }} strokeWidth={2.25} />
        }
        title="Aging Heatmap"
        subtitle={
          <>
            {enriched.length} {enriched.length === 1 ? "person" : "people"}
            {" · "}
            <span className="tabular-nums font-semibold text-gray-900">
              {totalAging}
            </span>{" "}
            pending {totalAging === 1 ? "task" : "tasks"} aging — click any lane to
            see them
          </>
        }
        actions={
          <>
            <CriticalToggle value={criticalOnly} onChange={setCriticalOnly} />
            <SortControl value={sortMode} onChange={setSortMode} />
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="the Aging heatmap"
            />
          </>
        }
      />
      {/* Header stays visible; the heat lanes below fold. */}
      <CollapsibleBody expanded={open}>

      <div
        /* Vertical padding trimmed below the horizontal: the gutter still needs
           to clear the card edge, but the stack inside is what was tall. */
        className="wms-card aging-shell relative overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 md:p-8 hover:shadow-sm"
      >
        {/* The red/green "heat wash" backdrop was removed — it was the other
            half of the peach tint. The heat colours still live where they carry
            meaning: the cells, the legend and the severity chips below. */}

        <div className="relative">
          {criticalTotal > 0 && <AlertBanner count={criticalTotal} />}

          <Legend onPick={(b) => openDrill(null, b)} />

          {top12.length === 0 ? (
            <p className="mt-6 font-semibold" style={{ fontSize: 17, color: "var(--color-ink-muted)" }}>
              {/* "Critical only" makes this reachable on healthy data, where a
                  bare "no tasks" would read as a loading failure. */}
              {criticalOnly
                ? "Nobody is carrying work aged 31 days or more."
                : "No pending tasks for the current filter."}
            </p>
          ) : (
            /* No gap between lanes and no card per lane: the rows are separated
               by a hairline rule instead, which is what lets twice as many
               people fit on screen at once. */
            <div className="mt-3">
              <LaneHeader />
              {top12.map((r, i) => (
                <Lane
                  key={r.employeeId}
                  row={r}
                  maxTotal={maxTotal}
                  index={i}
                  employeeTasks={cellTasks[r.employeeId] ?? {}}
                  onDrill={openDrill}
                  avatarUrl={avatarById[r.employeeId] ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      </CollapsibleBody>

      <AgingTaskDrawer
        open={drill !== null}
        title={drillTitle}
        tasks={drillTasks}
        me={me}
        avatarById={avatarById}
        onClose={() => setDrill(null)}
      />
    </PageShell>
  );
}

/**
 * "All / Critical" quick filter. Built as a two-option segmented control
 * matching `SortControl` beside it rather than a checkbox or a switch — the two
 * sit in the same header slot, and a third control shape there would read as
 * three unrelated widgets.
 */
function CriticalToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const options: { id: boolean; label: string; hint: string }[] = [
    { id: false, label: "All", hint: "Every person with pending work." },
    {
      id: true,
      label: "Critical only",
      hint: "Only people carrying tasks aged 31 days or more.",
    },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1"
      role="tablist"
      aria-label="Filter aging lanes"
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            title={o.hint}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              active ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
            style={active && o.id ? { color: "var(--color-altus-red-deep)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (m: SortMode) => void;
}) {
  // Each mode gets an explicit description: "Risk / Total / Oldest" alone gives
  // no clue that they rank by three genuinely different things, and users read
  // the same list in a different order under each without knowing why.
  const options: { id: SortMode; label: string; hint: string }[] = [
    {
      id: "risk",
      label: "Risk",
      hint: "Sorts by weighted risk score calculated from high-aging categories.",
    },
    {
      id: "total",
      label: "Total",
      hint: "Sorts by total volume of pending aging tasks.",
    },
    {
      id: "oldest",
      label: "Oldest",
      hint: "Sorts by age of the single oldest active task.",
    },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1"
      role="tablist"
      aria-label="Sort aging table"
    >
      <ArrowDownUp className="ml-1 size-3.5 text-gray-400" />
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            title={`${o.label} — ${o.hint}`}
            aria-label={`Sort by ${o.label}. ${o.hint}`}
            className={`rounded-md px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
              active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AlertBanner({ count }: { count: number }) {
  // Same warning, a third of the height: the shadow is gone, the rule is 3px
  // rather than 4, and the count sits inline with its sentence instead of
  // towering over it at 22px.
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-chip px-3 py-1"
      style={{
        background: "rgba(225, 6, 0, 0.07)",
        borderLeft: "3px solid #dc2626",
      }}
    >
      <AlertTriangle className="size-4 shrink-0" style={{ color: "#A80400" }} />
      <p style={{ fontSize: 12.5, color: "var(--color-ink-strong)" }}>
        <span className="tabular-nums font-black" style={{ fontSize: 14 }}>
          {count}
        </span>
        <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
          {" "}
          {count === 1 ? "task is" : "tasks are"} aging more than 30 days —
          escalate or close
        </span>
      </p>
    </div>
  );
}

function Legend({ onPick }: { onPick: (b: AgeBucketId) => void }) {
  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap">
      <span
        className="uppercase font-bold tracking-[0.10em] mr-1"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 10.5,
          color: "var(--color-ink-muted)",
        }}
      >
        Age
      </span>
      {DISPLAY_BUCKETS.map((b) => {
        const c = BUCKET_COLOR[b.id];
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b.id)}
            title={`Show every pending task aged ${b.label}`}
            aria-label={`Show all pending tasks aged ${b.label}`}
            /* Solid pill in the bucket's own tier colour, so the legend is a
               direct colour key for the bars rather than a pastel echo of them. */
            className="inline-flex items-center rounded-full px-2 py-[3px] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            style={{ background: c.fill, color: c.ink }}
          >
            <span className="font-black tabular-nums" style={{ fontSize: 10.5 }}>
              {b.id}d
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Column track shared by the header and every lane — one constant so the two
 *  can never drift out of alignment. */
const LANE_COLUMNS = "minmax(0, 210px) 58px 1fr 40px 18px";

function LaneHeader() {
  const cap = {
    fontFamily: "var(--font-mono-display), ui-monospace, monospace",
    fontSize: 10,
    color: "var(--color-ink-muted)",
  } as const;
  return (
    <div
      className="grid items-center gap-3 border-b border-hairline px-3 pb-1 max-md:hidden"
      style={{ gridTemplateColumns: LANE_COLUMNS }}
    >
      <span className="uppercase font-bold tracking-[0.10em]" style={cap}>
        Employee
      </span>
      <span className="text-center uppercase font-bold tracking-[0.10em]" style={cap}>
        Risk
      </span>
      <span className="uppercase font-bold tracking-[0.10em]" style={cap}>
        Pending by age (← oldest)
      </span>
      <span className="text-right uppercase font-bold tracking-[0.10em]" style={cap}>
        Total
      </span>
      <span aria-hidden />
    </div>
  );
}

function Lane({
  row,
  maxTotal,
  index,
  employeeTasks,
  avatarUrl,
  onDrill,
}: {
  row: AgingRow & { risk: number };
  maxTotal: number;
  index: number;
  employeeTasks: Record<string, HeatmapCellTask[]>;
  avatarUrl?: string | null;
  onDrill: (employeeId: string | null, bucketId: AgeBucketId | null) => void;
}) {
  const router = useRouter();
  const lengthPct = (row.total / maxTotal) * 100;
  const target = `/tasks?emp=${row.employeeId}` as Route;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${row.employeeName}'s aging tasks (risk ${row.risk}, ${row.total} pending)`}
      onClick={() => onDrill(row.employeeId, null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDrill(row.employeeId, null);
        }
      }}
      // A 44px TABLE ROW, not a card: no per-lane background, no radius, no
      // shadow — just a hairline rule underneath. That is where the vertical
      // space came from; roughly twice as many people now fit on one screen.
      //
      // 44px is the floor, not a target to beat: the 26px avatar leaves 9px of
      // air above and below it, which is what keeps the row compact rather than
      // cramped. Going lower would start clipping the avatar.
      //
      // Tier-3 mobile fix — at 390px the desktop grid overflows the section, so
      // `aging-lane-mobile` (globals.css) collapses it to 2 stacked rows on
      // max-md, where the height has to go back to auto.
      className="aging-lane aging-lane-mobile grid h-[44px] items-center gap-3 border-b border-hairline px-3 transition-colors last:border-b-0 max-md:h-auto max-md:gap-2 max-md:px-2 max-md:py-2"
      style={{
        gridTemplateColumns: LANE_COLUMNS,
        opacity: 0,
        // Tightened from `index * 50 + 200`: at 12 lanes the old stagger took
        // 0.8s to finish, which reads as the section loading slowly.
        animation: `fadeUp 320ms ease-out ${index * 16 + 120}ms forwards`,
        cursor: "pointer",
      }}
    >
      {/* Employee — avatar + name */}
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={row.employeeName} avatarUrl={avatarUrl ?? null} size={26} />
        <span
          className="text-ink-strong truncate font-semibold"
          style={{ fontSize: 13.5 }}
        >
          {row.employeeName}
        </span>
      </div>

      {/* Risk score */}
      <RiskChip score={row.risk} />

      {/* Heat bar — a thin lane. Segments are flush (no per-segment radius) and
          the container clips them, so the eight tiers read as one continuous
          measure rather than eight little pills. */}
      <div
        className="relative rounded-full bg-surface-soft overflow-hidden"
        style={{
          height: 16,
          border: "1px solid var(--color-hairline)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{
            width: `${lengthPct}%`,
            transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {DISPLAY_BUCKETS.map((b) => {
            const v = row.buckets[b.id];
            if (v === 0) return null;
            const segPct = (v / row.total) * 100;
            return (
              <Segment
                key={b.id}
                bucketId={b.id}
                bucketLabel={b.label}
                count={v}
                widthPct={segPct}
                employeeName={row.employeeName}
                tasks={employeeTasks[b.id] ?? []}
                onOpen={() => onDrill(row.employeeId, b.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Total */}
      <span
        className="text-right tabular-nums text-ink-strong font-black"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 15,
          letterSpacing: "-0.02em",
        }}
      >
        {row.total}
      </span>

      {/* Chevron — telegraphs click target */}
      <span
        className="aging-lane-chevron inline-flex items-center justify-center"
        aria-hidden
        style={{ color: "var(--color-ink-subtle)" }}
      >
        <ChevronRight size={14} strokeWidth={2.4} />
      </span>
    </div>
  );
}

/**
 * Risk badge — a flat tinted pill.
 *
 * The three-band red / amber / green semantic is unchanged; what went is the
 * decoration around it: the 135° gradient, the coloured drop-glow, the white
 * inner border, the 8px status dot and the 76px minimum width. At 17px inside a
 * 76px pill this was the second-largest thing in the row after the bar, for a
 * two-digit number. The tint alone carries the band.
 */
function RiskChip({ score }: { score: number }) {
  const tone = score >= 60 ? "red" : score >= 35 ? "amber" : "green";
  const palette = {
    red: { bg: "#fee2e2", fg: "#991b1b" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    green: { bg: "#d1fae5", fg: "#065f46" },
  }[tone];
  return (
    <span
      className="mx-auto inline-flex items-center justify-center rounded-pill px-1.5 py-0.5 font-black tabular-nums"
      style={{
        background: palette.bg,
        color: palette.fg,
        minWidth: 34,
        fontSize: 11.5,
        letterSpacing: "-0.01em",
      }}
      title={`Aging risk score: ${score}/100`}
    >
      {score}
    </span>
  );
}

function Segment({
  bucketId,
  bucketLabel,
  count,
  widthPct,
  employeeName,
  tasks,
  onOpen,
}: {
  bucketId: AgeBucketId;
  bucketLabel: string;
  count: number;
  widthPct: number;
  employeeName: string;
  tasks: HeatmapCellTask[];
  /** Open the full drill-down for this employee + bucket. */
  onOpen: () => void;
}) {
  const c = BUCKET_COLOR[bucketId];
  // Threshold nudged up with the smaller type: an 11px count needs a little
  // more of the lane behind it than a 17px one did to avoid touching the seams.
  const showLabel = widthPct > 11;
  // `isCritical` lived here to drive the heatPulse animation. The animation is
  // gone; CRITICAL_BUCKETS is still used by the risk score and the risk sort.

  // Up to four, per spec — a hover preview is a glance, not the drill-down.
  const preview = tasks.slice(0, 4);

  return (
    // HOVER, not click. This was a Popover, which opens on click — and the same
    // click also fired `onOpen()`, so one press produced the preview card AND
    // the full drill-down drawer at once. Splitting them by input fixes that:
    // hover previews, click drills down. Radix tooltip content is hoverable, so
    // the rows inside stay reachable.
    <Tooltip.Provider delayDuration={100} skipDelayDuration={200}>
      <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          // Crucial: keep the segment click from bubbling up to the lane's
          // navigation handler so the drill-down opens instead of redirecting.
          onClick={(e) => {
            // Stop the lane's own handler: a segment click is MORE specific
            // (this person AND this bracket), so it must not be swallowed by
            // the row-level "all their brackets" drill-down.
            e.stopPropagation();
            onOpen();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          /* Flat fill, rounded-md, no gradient / glow / scale.
             What was removed and why:
               • the 180° gradient — adjacent tiers blurred into each other at
                 the seam, so the bar read as a wash rather than seven steps;
               • `heatPulse` on the three critical buckets — a permanently
                 animating bar is noise once more than one lane is overdue;
               • `hover:brightness-110 hover:scale-y-110` — brightening shifts
                 the tier off its own token, and scaling made rows jitter;
               • the text-shadow — unnecessary now the ink is chosen per tier,
                 and it muddied dark text on amber and sky. */
          /* `rounded-md` went with the taller bar — at 18px the radius ate the
             narrow segments, and the parent already clips the lane to a pill.
             Flush segments also make the eight tiers read as one measure. */
          /* `leading-none`: the lane's inner box is 14px and 11px text carries a
             ~13px line box by default, so the count sat off-centre against the
             segment. */
          className="aging-segment flex h-full items-center justify-center leading-none transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{
            width: `${widthPct}%`,
            // Ink comes from the tier: amber-400 and sky-400 need dark text,
            // the other five need white. A blanket `text-white` made the two
            // light tiers' counts unreadable.
            color: c.ink,
            background: c.fill,
            minWidth: 0,
            outlineColor: c.deep,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 11,
          }}
          aria-label={`${employeeName}, ${bucketLabel}: ${count} pending`}
        >
          {showLabel && <span className="tabular-nums">{count}</span>}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          /* COMPACT. This was a 420px card with a full-bleed tier header and
             15.5px rows — a panel, not a hover. At 280px it sits over the lane
             without covering the neighbouring rows you are comparing against.
             The tier colour survives as the bucket pill rather than a band. */
          className="z-50 w-[280px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <p className="text-[11.5px] font-black leading-tight text-slate-900">
            {employeeName}
            <span className="mx-1.5 text-slate-400">·</span>
            <span
              className="rounded-pill px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: c.fill, color: c.ink }}
            >
              {bucketLabel}
            </span>
            <span className="ml-1.5 tabular-nums text-slate-500">
              ({count} {count === 1 ? "Task" : "Tasks"})
            </span>
          </p>

          <ul className="mt-2 flex flex-col gap-1">
            {preview.length === 0 && (
              <li className="py-2 text-[11.5px] font-semibold text-slate-500">No tasks.</li>
            )}
            {preview.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}` as Route}
                  className="block rounded-lg border border-slate-100 p-2 transition-colors hover:bg-slate-50"
                >
                  {/* DESCRIPTION, not `title`. `title` in this schema is the
                      CLIENT NAME, so this list used to read "Altus Corp / AA
                      Tech / JMT Drive Solutions" — three rows that say nothing
                      about the work. */}
                  <span className="block line-clamp-2 break-words text-xs font-semibold leading-snug text-slate-900">
                    {t.description?.trim() || "No description provided"}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        t.priority === "imp_urgent"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
                      {t.ageDays}d
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {tasks.length > preview.length && (
            <p className="mt-2 text-[10.5px] font-semibold text-slate-500">
              +{tasks.length - preview.length} more — click the segment to see all
            </p>
          )}
          <Tooltip.Arrow style={{ fill: "#ffffff" }} width={14} height={7} />
        </Tooltip.Content>
      </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
