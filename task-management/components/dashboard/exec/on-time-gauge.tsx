"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import type { DoneOnTime } from "@/lib/types";
import { Gauge } from "./viz/gauge";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { PunctualityTaskList } from "./punctuality-task-list";
import type { PunctualityBucket } from "@/lib/queries/punctuality-drilldown";

/**
 * OnTimeGauge — "Delivered On Time", a 2-COLUMN interactive widget.
 *
 *   LEFT  (~35%) — the speedometer, then the KPI cards stacked beneath it:
 *                  "Total Completed" full-width, then "On Time" / "Late
 *                  Deliveries" side by side.
 *   RIGHT (~65%) — the task breakdown for whichever card is selected.
 *
 * The cards ARE the filter. They used to be three inert `<div>`s printing the
 * same numbers the gauge already showed, and the task list was an accordion
 * hidden below them that only ever showed late tasks. Now each card is a
 * `<button>` that drives the right panel, which is the question people actually
 * had of this widget: "which ones were late, and whose?"
 *
 * Default selection is "Late Deliveries" — an on-time dashboard is not the
 * thing anyone opens this to read.
 *
 * The gauge keeps its own arc-click affordance but no longer opens a drawer:
 * clicking a half now selects the matching card, so there is ONE place the
 * answer appears instead of a drawer competing with an inline list.
 */
type Basis = "original" | "revised";

/**
 * The one basis this widget measures against, no longer switchable.
 *
 * "revised" is the EFFECTIVE due date — `effectiveDueAtSql()` resolves it as
 * `revised ?? original`, so a task that was never moved is still judged on the
 * date it was given. That is the same date the tasks table's Due column, the
 * overdue flags and the aging heatmap all use, so the gauge now agrees with
 * every other surface instead of being the one place a second definition of
 * "late" could be selected.
 *
 * It was also the toggle's default, so locking it changes nothing about what
 * the widget reported on load — only that the reading can no longer be switched
 * out from under whoever reads it next. `data.original` is still computed
 * upstream; nothing here consumes it.
 */
const BASIS: Basis = "revised";

export function OnTimeGauge({ data }: { data: DoneOnTime }) {
  const [sectionOpen, setSectionOpen] = React.useState(true);
  const [bucket, setBucket] = React.useState<PunctualityBucket>("late");
  const active = data[BASIS];
  const hasData = active.dated > 0 && active.onTime + active.late > 0;

  return (
    <div className="flex min-w-0 flex-col">
      {/* Header ABOVE this card — see components/dashboard/section-header.tsx. */}
      <DashboardSectionHeader
        className="mb-3"
        icon={
          <span
            className="inline-flex size-9 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red)",
            }}
          >
            <CalendarCheck size={18} strokeWidth={2.4} />
          </span>
        }
        title="Delivered on time"
        subtitle="Completed tasks delivered on or before the due date — pick a card to break it down."
        /* Collapse only. The Original/Revised segmented toggle that used to sit
           to its left is gone — see BASIS above. */
        actions={
          <CollapseToggle
            expanded={sectionOpen}
            onToggle={() => setSectionOpen((v) => !v)}
            label="the On-time rate"
          />
        }
      />
      <CollapsibleBody expanded={sectionOpen}>
        <section
          className="wg-rise wms-card relative flex-1 rounded-2xl bg-white p-5 shadow-xs hover:shadow-sm max-md:p-4"
          aria-label="On-time delivery rate"
        >
          {!hasData ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <EmptyState />
            </div>
          ) : (
            /* 35 / 65. Stacks to one column below `lg` — at half a laptop width
               the gauge and a 3-column table cannot both be legible side by
               side. `items-stretch` is what lets the right panel match the left
               column's height instead of collapsing to its content. */
            <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[35fr_65fr]">
              {/* ── LEFT — gauge + interactive KPI cards ───────────────── */}
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-center">
                  <Gauge
                    pct={active.onTimeRate}
                    onTime={active.onTime}
                    late={active.late}
                    size={250}
                    onSelect={(seg) => setBucket(seg)}
                  />
                </div>

                <KpiCard
                  label="Total Completed"
                  value={active.dated}
                  selected={bucket === "all"}
                  onSelect={() => setBucket("all")}
                  accent="#334155"
                />

                <div className="grid grid-cols-2 gap-3">
                  <KpiCard
                    label="On Time"
                    value={active.onTime}
                    pct={pctOf(active.onTime, active.dated)}
                    selected={bucket === "onTime"}
                    onSelect={() => setBucket("onTime")}
                    accent="#059669"
                  />
                  <KpiCard
                    label="Late Deliveries"
                    value={active.late}
                    pct={pctOf(active.late, active.dated)}
                    selected={bucket === "late"}
                    onSelect={() => setBucket("late")}
                    accent="#dc2626"
                  />
                </div>
              </div>

              {/* ── RIGHT — the breakdown for the selected card ────────── */}
              <div className="flex min-h-[420px] min-w-0 flex-col">
                <PunctualityTaskList basis={BASIS} bucket={bucket} />
              </div>
            </div>
          )}
        </section>
      </CollapsibleBody>
    </div>
  );
}

/** Whole-percent share, guarding the zero-denominator case. */
function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/**
 * One interactive KPI card. Selection is carried by a 2px border in the card's
 * own accent plus a tinted ground and a matching ring — a single cue (colour
 * alone, or weight alone) reads as decoration on a card that is already
 * colour-coded by meaning.
 *
 * The percentage sits beside the count rather than replacing it: "30%" alone
 * hides whether the sample is 88 tasks or 3.
 */
function KpiCard({
  label,
  value,
  pct,
  selected,
  onSelect,
  accent,
}: {
  label: string;
  value: number;
  pct?: number | null;
  selected: boolean;
  onSelect: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="min-w-0 rounded-xl border-2 px-3.5 py-2.5 text-left transition-all"
      style={{
        borderColor: selected ? accent : "var(--color-hairline)",
        background: selected ? `color-mix(in srgb, ${accent} 7%, #fff)` : "#fff",
        boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${accent} 16%, transparent)` : "none",
      }}
    >
      <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span
        className="mt-0.5 block text-[22px] font-black tabular-nums leading-tight"
        style={{ color: accent }}
      >
        {value.toLocaleString("en-IN")}
        {pct !== null && pct !== undefined && (
          <span className="ml-1.5 text-[13px] font-bold">({pct}%)</span>
        )}
      </span>
      <span className="block text-[11.5px] font-semibold text-gray-500">
        {value === 1 ? "task" : "tasks"}
      </span>
    </button>
  );
}


function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-8 text-center">
      <span
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-ink-subtle) 12%, transparent)",
          color: "var(--color-ink-subtle)",
        }}
      >
        <CalendarCheck size={22} strokeWidth={2.2} />
      </span>
      <p className="text-[14px] font-bold text-ink-soft">
        No delivered tasks in range
      </p>
      <p className="max-w-[240px] text-[12.5px] font-semibold text-ink-subtle">
        Once tasks are completed with a date, their on-time rate appears here.
      </p>
    </div>
  );
}
