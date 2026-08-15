"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import type { DoneOnTime } from "@/lib/types";
import { Gauge, type GaugeSegment } from "./viz/gauge";
import { PunctualityDrawer } from "./on-time-detail";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";

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
      subtitle={
        <>
          Done tasks · vs the {basis === "revised" ? "revised" : "original"} due
          date
        </>
      }
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
    <section
      className="wg-rise relative flex-1 overflow-hidden rounded-section p-7 max-md:p-5"
      aria-label="On-time delivery rate"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in srgb, #ffffff 86%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 92%, transparent) 100%)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 22px 54px -30px rgba(225,6,0,0.20), inset 0 1px 0 rgba(255,255,255,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        ["--kpi-tone" as string]: "color-mix(in srgb, var(--color-altus-red) 70%, transparent)",
        ["--kpi-tone-deep" as string]:
          "color-mix(in srgb, var(--color-altus-red-deep) 55%, transparent)",
      }}
    >
      {/* Aurora wash */}
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />

      <div className="relative">
        {/* Gauge / empty state. The card is full-width now, so the arc is
            scaled up to carry it — at 280px it read as a small island floating
            in a wide well. */}
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
      </div>

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
