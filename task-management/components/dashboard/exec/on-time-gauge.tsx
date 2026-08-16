"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import type { DoneOnTime } from "@/lib/types";
import { Gauge, type GaugeSegment } from "./viz/gauge";
import { PunctualityDrawer } from "./on-time-detail";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { LateTasksBreakdown } from "./late-tasks-breakdown";

/**
 * OnTimeGauge — V2 executive card (top-left). Shows the on-time delivery
 * rate as a semicircle Gauge, with an `Original ⇄ Revised` segmented toggle
 * that switches the measuring basis (against the original due date vs the
 * revised/effective due date). Defaults to "revised".
 *
 * Empty state: when the active basis has no dated deliveries, we show a calm
 * message instead of a 0% gauge.
 *
 * Glassmorphic surface + soft elevation + aurora wash; brand-red accents.
 */
type Basis = "original" | "revised";

export function OnTimeGauge({ data }: { data: DoneOnTime }) {
  const [sectionOpen, setSectionOpen] = React.useState(true);
  const [basis, setBasis] = React.useState<Basis>("revised");
  // Which half of the gauge the drawer is showing; null = closed. The drawer
  // fetches its task list on open, so this is the only state the card holds.
  const [drilldown, setDrilldown] = React.useState<GaugeSegment | null>(null);
  const active = data[basis];
  const hasData = active.dated > 0 && active.onTime + active.late > 0;

  return (
    <div className="flex min-w-0 flex-col">
    {/* Header ABOVE this card — see components/dashboard/section-header.tsx. */}
    <DashboardSectionHeader
      className="mb-3"
      eyebrow="Delivery · On Time"
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
      subtitle="Tracks completed tasks delivered on or before the due date against late deliveries."
      actions={
        <>
          <BasisToggle value={basis} onChange={setBasis} />
          <CollapseToggle
            expanded={sectionOpen}
            onToggle={() => setSectionOpen((v) => !v)}
            label="the On-time rate"
          />
        </>
      }
    />
    <CollapsibleBody expanded={sectionOpen}>
    {/* Crisp white surface. The peach aurora wash + red-tinted elevation that
        used to live here tinted the gauge's own red/green arcs, which are the
        card's only meaningful colour. */}
    <section
      className="wg-rise wms-card relative flex-1 rounded-2xl bg-white p-6 shadow-xs hover:shadow-sm max-md:p-5"
      aria-label="On-time delivery rate"
    >
      {/* Gauge / empty state. Everything else stacks BELOW it — the metrics
          used to sit beside the arc, which squeezed both on a half-width
          column. */}
      <div className="flex min-h-[240px] items-center justify-center">
        {hasData ? (
          <Gauge
            key={basis}
            pct={active.onTimeRate}
            onTime={active.onTime}
            late={active.late}
            size={340}
            onSelect={setDrilldown}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {hasData && (
        <>
          {/* ── Row 1 — summary strip ─────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
            <SummaryStat
              label="Total Completed"
              value={active.dated}
              tone="text-gray-900"
            />
            <SummaryStat
              label="On Time"
              value={active.onTime}
              pct={pctOf(active.onTime, active.dated)}
              tone="text-emerald-600"
            />
            <SummaryStat
              label="Late Deliveries"
              value={active.late}
              pct={pctOf(active.late, active.dated)}
              tone="text-red-600"
            />
          </div>

          {/* ── Row 2 — expandable late-task table ────────────────────── */}
          <LateTasksBreakdown basis={basis} lateCount={active.late} />
        </>
      )}

      {/* Task list behind the clicked half — mounted only while open so the
          server action fires on demand, never on dashboard load. */}
      {drilldown && (
        <PunctualityDrawer
          open
          basis={basis}
          bucket={drilldown}
          onClose={() => setDrilldown(null)}
        />
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
 * One cell of the summary strip. The percentage is rendered beside the count
 * rather than instead of it — "17%" alone hides whether the sample is 89 tasks
 * or 3, which is the difference between a signal and noise.
 */
function SummaryStat({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct?: number | null;
  tone: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>
        {value.toLocaleString("en-IN")}
        <span className="ml-1 text-sm font-semibold">
          {value === 1 ? "task" : "tasks"}
        </span>
        {pct !== null && pct !== undefined && (
          <span className="ml-1.5 text-sm font-bold">({pct}%)</span>
        )}
      </p>
    </div>
  );
}

function BasisToggle({
  value,
  onChange,
}: {
  value: Basis;
  onChange: (b: Basis) => void;
}) {
  const options: { id: Basis; label: string }[] = [
    { id: "original", label: "Original" },
    { id: "revised", label: "Revised" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-chip border border-hairline bg-surface-card p-1"
      role="tablist"
      aria-label="On-time measuring basis"
    >
      {options.map((o) => {
        const isActive = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.id)}
            className="rounded-pill px-4 py-2 font-bold transition-all duration-200"
            style={{
              fontSize: 13.5,
              background: isActive ? "var(--color-ink-strong)" : "transparent",
              color: isActive ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: isActive ? "0 4px 10px rgba(15,23,42,0.18)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
