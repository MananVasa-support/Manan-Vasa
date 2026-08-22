"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PRIORITY_LABELS } from "@/db/enums";
import {
  AlertTriangle,
  Flame,
  ArrowDownUp,
  ChevronRight,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { AGE_BUCKETS, type AgeBucketId } from "@/db/enums";
import type { AgingRow, HeatmapCellTask } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { Avatar } from "@/components/ui/avatar";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD,
} from "@/components/dashboard/section-chrome";
import { AgingTaskDrawer } from "@/components/dashboard/aging-task-drawer";

/**
 * THE AGE RAMP — one continuous risk gradient, green through burgundy.
 *
 * One map, read by the legend pills, the stacked bar segments and the hover
 * popover, so a bucket is the same colour in all three. Re-mapped from the old
 * green -> teal -> SKY BLUE -> amber ramp: a blue tier in the middle of a heat
 * scale reads as a category, not a step, so 8-14d looked like a different KIND
 * of thing rather than "worse than 4-7d". The ramp is now monotonic in hue AND
 * in temperature: green -> lime -> yellow -> orange -> red -> deep red ->
 * burgundy, so a bar gets visibly hotter left to right with no hue that breaks
 * the sequence.
 *
 * 46-60 AND 60+ ARE NOT THE SAME BURGUNDY. The palette names one "deep dark
 * burgundy" tier for both, but byte-identical fills on adjacent buckets is the
 * exact defect this map was rewritten once before to fix — two brackets that
 * render the same cannot show that one lane's backlog is older than another's.
 * They take the two burgundies the palette offers (#7F1D1D and #450A0A), which
 * keeps the tier reading as one family while staying distinguishable.
 *
 * INK FOLLOWS CONTRAST, not a blanket colour. Everything from green through
 * orange is too light to carry white: white on #16A34A measures 3.4:1 and on
 * #F97316 just 2.8:1, under even the 3:1 large-text floor, and these counts are
 * 12px. Those four take slate-900 (6:1 or better). Red and darker take white.
 */
const BUCKET_COLOR: Record<AgeBucketId, { fill: string; ink: string; deep: string }> = {
  "0-3":   { fill: "#16A34A", ink: "#0F172A", deep: "#15803D" }, // forest green   — freshest
  "4-7":   { fill: "#65A30D", ink: "#0F172A", deep: "#4D7C0F" }, // lime           — early warning
  "8-14":  { fill: "#EAB308", ink: "#0F172A", deep: "#CA8A04" }, // amber yellow   — moderate
  "15-20": { fill: "#F97316", ink: "#0F172A", deep: "#EA580C" }, // deep orange    — late
  "21-30": { fill: "#DC2626", ink: "#FFFFFF", deep: "#B91C1C" }, // bright red     — critical
  "31-45": { fill: "#B91C1C", ink: "#FFFFFF", deep: "#991B1B" }, // deep red       — severe
  "46-60": { fill: "#7F1D1D", ink: "#FFFFFF", deep: "#601717" }, // burgundy       — very severe
  "60+":   { fill: "#450A0A", ink: "#FFFFFF", deep: "#2C0606" }, // dark burgundy  — extreme
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


/**
 * TRANSPOSED VIEW — age buckets down the side, people across the top.
 *
 * The standard view is a LANE list (a stacked bar per person), not a grid, so
 * this is a real table rather than a re-orientation of the same markup. Risk
 * Score and Total Pending ride along as two extra rows, because in this
 * orientation they are per-person figures like every bucket count above them.
 *
 * Sorting means what it should here: clicking a person's header ranks the
 * BUCKET rows by that person's counts, so you can see where one individual's
 * backlog actually sits. A third click clears back to oldest-first order.
 */
function TransposedAging({
  rows,
  onDrill,
  sortBy,
  onSort,
}: {
  rows: (AgingRow & { risk: number })[];
  onDrill: (employeeId: string | null, bucketId: AgeBucketId | null) => void;
  sortBy: { employeeId: string; desc: boolean } | null;
  onSort: (employeeId: string) => void;
}) {
  const bucketRows = React.useMemo(() => {
    const base = DISPLAY_BUCKETS.map((b) => ({
      bucket: b,
      counts: rows.map((r) => r.buckets[b.id] ?? 0),
    }));
    if (!sortBy) return base;
    const idx = rows.findIndex((r) => r.employeeId === sortBy.employeeId);
    if (idx < 0) return base;
    const at = (c: number[]) => c[idx] ?? 0;
    return [...base].sort((a, b) =>
      sortBy.desc ? at(b.counts) - at(a.counts) : at(a.counts) - at(b.counts),
    );
  }, [rows, sortBy]);

  const head =
    "px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-900";

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse"
        style={{ minWidth: Math.max(560, 180 + rows.length * 116) }}
      >
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${head} sticky left-0 z-10 bg-white text-left`}>Age bucket</th>
            {rows.map((r) => {
              const active = sortBy?.employeeId === r.employeeId;
              return (
                <th
                  key={r.employeeId}
                  aria-sort={active ? (sortBy!.desc ? "descending" : "ascending") : "none"}
                  className={`${head} text-right`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(r.employeeId)}
                    title={`Sort buckets by ${r.employeeName}`}
                    className={`group/sort inline-flex cursor-pointer items-center gap-1.5 select-none transition-colors hover:text-gray-900 ${
                      active ? "text-gray-900" : "text-gray-500"
                    }`}
                  >
                    <span className="max-w-[104px] truncate">{r.employeeName}</span>
                    {active ? (
                      sortBy!.desc ? (
                        <ArrowDown size={12} strokeWidth={2.6} />
                      ) : (
                        <ArrowUp size={12} strokeWidth={2.6} />
                      )
                    ) : (
                      <ChevronsUpDown
                        size={12}
                        strokeWidth={2.4}
                        className="opacity-45 transition-opacity group-hover/sort:opacity-100"
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {bucketRows.map(({ bucket, counts }) => {
            const c = BUCKET_COLOR[bucket.id];
            return (
              <tr key={bucket.id} className="border-b border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <span
                    className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: c.fill, color: c.ink }}
                  >
                    {bucket.label}
                  </span>
                </td>
                {rows.map((r, i) => {
                  const n = counts[i] ?? 0;
                  return (
                    <td key={r.employeeId} className="px-3 py-2 text-right">
                      {n === 0 ? (
                        <span className="text-[13px] text-gray-300">0</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDrill(r.employeeId, bucket.id)}
                          title={`Open ${r.employeeName}'s ${bucket.label} tasks`}
                          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-gray-900 transition-colors hover:bg-gray-100"
                        >
                          {n}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Risk and Total are per-person figures, so in this orientation they
              are rows like the buckets above — not a separate summary block. */}
          <tr className="border-t-2 border-gray-200">
            <td className="sticky left-0 z-10 bg-white px-3 py-2 text-[12px] font-black text-gray-900">
              Risk Score
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-gray-900">
                {r.risk}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-white px-3 py-2 text-[12px] font-black text-gray-900">
              Total Pending
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-3 py-2 text-right text-[13px] font-black tabular-nums text-gray-900">
                {r.total}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
  // Orientation, plus the transposed view's own sort. Both live here so
  // flipping back and forth never discards the other view's ordering — the
  // lane list keeps its risk/total/oldest mode, the grid keeps its column.
  const [isTransposed, setIsTransposed] = React.useState(false);
  const [transposedSort, setTransposedSort] = React.useState<
    { employeeId: string; desc: boolean } | null
  >(null);
  const toggleTransposedSort = React.useCallback((employeeId: string) => {
    setTransposedSort((cur) =>
      cur?.employeeId === employeeId
        ? cur.desc
          ? null // third click clears, back to oldest-first
          : { employeeId, desc: true }
        : { employeeId, desc: false },
    );
  }, []);
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
            {!isTransposed && <SortControl value={sortMode} onChange={setSortMode} />}
            {/* Transpose sits with the collapse control: both change the
                section's SHAPE rather than what it contains. The lane sort is
                hidden while transposed — it orders LANES, and there are none. */}
            <button
              type="button"
              onClick={() => setIsTransposed((v) => !v)}
              aria-pressed={isTransposed}
              title={isTransposed ? "Back to lanes" : "Transpose: buckets as rows"}
              className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] font-bold transition-colors ${
                isTransposed ? "text-altus-red" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <ArrowLeftRight className="size-3.5" strokeWidth={2.6} />
              Transpose
            </button>
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
        /* The shared dashboard card, not a hand-rolled copy of it. The classes
           spelled out here were already identical to DASHBOARD_CARD_PADDED —
           which is exactly how they drift apart the next time one is edited.
           `wms-card` came off with them: that utility OWNS the border, and the
           card constant sets `border-slate-200/80` alongside it, so the two
           were fighting over the same property. */
        /* DASHBOARD_CARD without its padding, then p-8/p-10 on top. NOT
           `${DASHBOARD_CARD_PADDED} p-8`: both sets are plain utilities of
           equal specificity, so which one wins is decided by their order in
           the GENERATED stylesheet, not by their order in this string — the
           override would be a coin flip. Taking the unpadded constant leaves
           exactly one padding rule.
           min-h gives the section a floor so it holds its presence on the
           page even with three lanes in it. */
        className={`aging-shell relative min-h-[600px] overflow-hidden p-8 md:p-10 ${DASHBOARD_CARD}`}
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
              {isTransposed ? (
                <TransposedAging
                  rows={top12}
                  onDrill={openDrill}
                  sortBy={transposedSort}
                  onSort={toggleTransposedSort}
                />
              ) : (
                <>
                  <LaneHeader />
                  {/* space-y-4 between people. The lanes used to be table
                      rows divided by a hairline; with the bars this much
                      thicker they need air between them instead, and a rule
                      under a floating row reads as a stray underline. */}
                  <div className="space-y-4 pt-3">
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
                </>
              )}
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
      // 56px, up from 44px: the heat bar inside is now 26px rather than 16px,
      // and 44px would have left it 9px of air top and bottom — a bar wearing
      // the row rather than sitting in it. The lanes are separated by space-y-4
      // now instead of a hairline rule, so the row carries no border of its own.
      //
      // Tier-3 mobile fix — at 390px the desktop grid overflows the section, so
      // `aging-lane-mobile` (globals.css) collapses it to 2 stacked rows on
      // max-md, where the height has to go back to auto.
      className="aging-lane aging-lane-mobile grid h-[56px] items-center gap-3 rounded-xl px-3 transition-colors max-md:h-auto max-md:gap-2 max-md:px-2 max-md:py-2"
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

      {/* Heat bar. Segments are flush (no per-segment radius) and the container
          clips them, so the eight tiers read as one continuous measure rather
          than eight little pills.
          26px outer (h-6 plus the hairline top and bottom), up from 16px: at
          the old height the tier colours were a stripe, and a count sitting in
          one was squeezed against the seams. rounded-lg rather than a pill —
          at this thickness a full radius eats the first and last segment. */}
      <div
        className="relative rounded-lg bg-surface-soft overflow-hidden"
        style={{
          height: 26,
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
            // 12px / 700, up from 11px / 900. The taller bar can carry it,
            // and 900 at 11px was dense enough that the digits ran together.
            fontWeight: 700,
            fontSize: 12,
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
