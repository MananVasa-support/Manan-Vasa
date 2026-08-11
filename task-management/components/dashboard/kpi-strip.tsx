"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import type { NeonKey } from "./kpi-card";
import { KpiDetailPanel } from "./kpi-detail-panel";
import type { KpiSet, WmsSummary } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";

interface Entry {
  key: keyof KpiSet;
  label: string;
  sublabel: string;
  neonKey: NeonKey;
  href: Route;
}

// One compact card per KPI, in a single row. The first (Total) reads as the
// anchor; the rest follow in the operational reading order.
const ITEMS: Entry[] = [
  { key: "total", label: "Total", sublabel: "All Tasks", neonKey: "total", href: "/tasks" },
  { key: "needHelp", label: "Need Info", sublabel: "Awaiting info", neonKey: "need-help", href: "/tasks?status=need_info" },
  { key: "notApproved", label: "Not Approved", sublabel: "Sent Back", neonKey: "not-approved", href: "/tasks?status=not_approved" },
  { key: "done", label: "Done", sublabel: "Done + Approved", neonKey: "done", href: "/tasks?status=done,approved" },
  { key: "pending", label: "Pending", sublabel: "In Progress", neonKey: "pending", href: "/tasks?status=initiated,follow_up" },
  { key: "notStarted", label: "Not Started", sublabel: "Awaiting Pickup", neonKey: "not-started", href: "/tasks?status=not_started" },
];

/**
 * The "vs …" half of each card's comparison line, derived from the selected
 * date range. The delta itself compares the range against the SAME number of
 * days immediately before it (lib/queries/dashboard.ts), so this label always
 * describes the window actually being measured.
 *
 *   ≤ 7 days ............... "last week"
 *   8–14 days .............. "last 2 weeks"
 *   > 14 and a whole number
 *     of weeks ............. "last N weeks"
 *   anything else .......... "last N days"   (e.g. the default 31-day range)
 */
export function comparisonLabel(rangeDays: number): string {
  const days = Math.max(1, Math.round(rangeDays));
  if (days <= 7) return "last week";
  if (days <= 14) return "last 2 weeks";
  if (days % 7 === 0) return `last ${days / 7} weeks`;
  return `last ${days} days`;
}

export function KpiStrip({
  kpis,
  summary,
  rangeDays = 7,
}: {
  kpis: KpiSet;
  summary: WmsSummary;
  /** Days in the active date filter — drives the "vs last …" label. */
  rangeDays?: number;
}) {
  const vsLabel = React.useMemo(() => `vs ${comparisonLabel(rangeDays)}`, [rangeDays]);
  const [expanded, setExpanded] = React.useState<keyof KpiSet | null>(null);
  // Whole-panel maximize/minimize. Compact by default so the dashboard opens
  // summarised rather than showing every card and every delta at once.
  const [expandedPanel, setExpandedPanel] = React.useState(false);

  // FilterBar section search — narrows which summary cards are shown, matched
  // on the card's label and its sublabel ("Not Approved" / "Sent Back"). With
  // no match the strip renders nothing rather than an empty grid frame.
  const sectionQuery = useSectionSearch();
  const items = React.useMemo(
    () =>
      sectionQuery
        ? ITEMS.filter((i) => matchesSearch(sectionQuery, i.label, i.sublabel))
        : ITEMS,
    [sectionQuery],
  );

  if (items.length === 0) return null;

  // COMPACT is the default: the three headline cards (Total · Done · Pending)
  // and no comparison lines — enough to read the state of play at a glance.
  // Maximize reveals all six cards plus each card's vs-last-period delta.
  const compactKeys: (keyof KpiSet)[] = ["total", "done", "pending"];
  const shown = expandedPanel ? items : items.filter((i) => compactKeys.includes(i.key));
  const headline = shown.reduce((sum, i) => sum + kpis[i.key].current, 0);

  // Resolved against SHOWN, not all items: a card hidden by the search or by
  // minimizing the panel must not leave its detail panel stranded below the
  // strip with no card to point at.
  const active = expanded ? shown.find((i) => i.key === expanded) ?? null : null;

  return (
    <section className="mt-10" aria-label="Task summary">
     <PageShell as="div" width="full" py={false}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-black uppercase tracking-[0.14em] text-ink-subtle">
          Tasks
          <span className="ml-2 tabular-nums text-ink-soft">
            {headline.toLocaleString()}
          </span>
          {!expandedPanel && (
            <span className="ml-2 font-semibold normal-case tracking-normal text-ink-subtle">
              · showing {shown.length} of {items.length}
            </span>
          )}
        </p>
        <CollapseToggle
          expanded={expandedPanel}
          onToggle={() => setExpandedPanel((v) => !v)}
          label="the Task summary"
        />
      </div>
      <CardGrid min={165} gap="0.7rem">
        {shown.map((item) => {
          const kpi = kpis[item.key];
          const delta = kpi.current - kpi.previous;
          const up = delta > 0;
          const flat = delta === 0;
          const arrow = up ? "▲" : flat ? "→" : "▼";
          const deltaColor = flat
            ? "var(--color-ink-subtle)"
            : up
              ? "var(--color-green-deep)"
              : "var(--color-red-deep)";
          const isOpen = expanded === item.key;
          const neon = `var(--kpi-neon-${item.neonKey})`;
          const neonDeep = `var(--kpi-neon-${item.neonKey}-deep)`;

          return (
            <div key={item.key}>
              <div
                className="group relative h-full overflow-hidden rounded-2xl transition-all duration-200"
                style={{
                  background: "var(--color-surface-card)",
                  border: `1px solid ${isOpen ? `rgb(${neonDeep})` : "var(--color-hairline-strong)"}`,
                  boxShadow: isOpen
                    ? `0 0 0 1px rgb(${neonDeep}), 0 12px 28px -16px rgb(${neon} / 0.6)`
                    : "0 1px 2px rgba(15,23,42,0.05)",
                }}
              >
                {/* top accent rail */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: `linear-gradient(90deg, rgb(${neon}), rgb(${neonDeep}))` }}
                />
                <div className="px-3.5 pt-3.5 pb-3">
                 <div className="flex items-start justify-between gap-1.5">
                  <Link
                    href={item.href}
                    className="group/link min-w-0 flex-1 outline-none"
                    aria-label={`${item.label} — view tasks`}
                  >
                    {/* Fixed 2-line height so wrapping labels ("NOT APPROVED")
                        don't push the number down — every card's number lands on
                        the same baseline. */}
                    <span
                      className="flex items-start gap-1 uppercase font-black tracking-[0.07em] leading-[1.15]"
                      style={{ fontSize: 11.5, color: `rgb(${neonDeep})`, minHeight: 24 }}
                    >
                      <span className="min-w-0">{item.label}</span>
                      <ArrowUpRight
                        size={13}
                        strokeWidth={3}
                        className="mt-px shrink-0 opacity-0 -translate-x-0.5 transition-all group-hover/link:opacity-100 group-hover/link:translate-x-0"
                      />
                    </span>
                    <span
                      className="block tabular-nums leading-none mt-2 text-ink-strong"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: 32,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {kpi.current.toLocaleString()}
                    </span>
                  </Link>

                  {/* View ⇄ Hide toggle for this card's KpiDetailPanel. The label
                      tracks the open state, backed by the fill flipping to solid
                      and by aria-expanded. "View"/"Hide" are both 4 characters, so
                      the pill's width never jumps as it toggles. */}
                  <button
                    type="button"
                    onClick={() => setExpanded((cur) => (cur === item.key ? null : item.key))}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Hide ${item.label} details` : `View ${item.label} details`}
                    className="inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 font-black uppercase tracking-[0.04em] transition-colors"
                    style={{
                      fontSize: 11,
                      color: isOpen ? "#fff" : `rgb(${neonDeep})`,
                      background: isOpen ? `rgb(${neonDeep})` : `color-mix(in srgb, rgb(${neon}) 14%, transparent)`,
                    }}
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                 </div>

                  {/* Comparison line — only in the maximized view; the compact
                      view is just the headline numbers. Its OWN full-width row,
                      deliberately not
                      inside the <Link> above. In that column it shared the row
                      with the View pill and had ~85px of a 165px card, so
                      "vs last 2 weeks" wrapped and the card's overflow-hidden
                      clipped it to a bare "vs last". Full width plus
                      `whitespace-nowrap` keeps arrow + number + label on one
                      line; the label is a step smaller than the number so the
                      longest wording still clears the narrowest card. */}
                  <CollapsibleBody expanded={expandedPanel}>
                    <span
                      className="mt-2 flex items-baseline gap-1 whitespace-nowrap tabular-nums font-extrabold"
                      style={{ fontSize: 12.5, color: deltaColor }}
                    >
                      <span>
                        {arrow} {Math.abs(delta)}
                      </span>
                      <span className="font-semibold opacity-60" style={{ fontSize: 11 }}>
                        {vsLabel}
                      </span>
                    </span>
                  </CollapsibleBody>
                </div>
              </div>
            </div>
          );
        })}
      </CardGrid>

      {/* Single per-card detail panel — animates open via the 0fr→1fr grid trick. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: active ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {active && (
            <div className="pt-4">
              <KpiDetailPanel
                label={active.label}
                sublabel={active.sublabel}
                value={kpis[active.key].current}
                kpi={kpis[active.key]}
                summary={summary}
                neon={`var(--kpi-neon-${active.neonKey})`}
                neonDeep={`var(--kpi-neon-${active.neonKey}-deep)`}
                vsLabel={vsLabel}
              />
            </div>
          )}
        </div>
      </div>
     </PageShell>
    </section>
  );
}
