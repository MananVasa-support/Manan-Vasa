"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  STATUS_COLORS,
  statusCardStyle,
  STATUS_CARD_BADGE,
  STATUS_CARD_BADGE_ACTIVE,
  type StatusColorKey,
} from "@/lib/status-palette";
import { ArrowUpRight } from "lucide-react";
import type { NeonKey } from "./kpi-card";
import { KpiDetailPanel } from "./kpi-detail-panel";
import type { KpiSet, WmsSummary } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";
import { DashboardSectionHeader } from "./section-header";
import { DashboardViewTabs } from "./dashboard-view";

interface Entry {
  key: keyof KpiSet;
  label: string;
  sublabel: string;
  neonKey: NeonKey;
  href: Route;
  /** Which entry in the shared status palette paints this card. A KEY, not a
   *  colour: the hex lives in lib/status-palette.ts so this strip and the
   *  Status Distribution tiles cannot drift apart again. */
  color: StatusColorKey;
}

// One compact card per KPI, in a single row. The first (Total) reads as the
// anchor; the rest follow in the operational reading order.
//
// NEED INFO / NOT APPROVED WERE INVERTED HERE. This strip painted Need Info
// bright red (red-600) and Not Approved dark red (red-900); the Status
// Distribution tiles on the same screen painted them the other way round. Both
// now read `needInfo` and `notApproved` from the palette, so the pair can only
// ever be one way round.
const ITEMS: Entry[] = [
  { key: "total", label: "Total", sublabel: "All Tasks", neonKey: "total", href: "/tasks", color: "total" },
  { key: "needHelp", label: "Need Info", sublabel: "Awaiting info", neonKey: "need-help", href: "/tasks?status=need_info", color: "needInfo" },
  { key: "notApproved", label: "Not Approved", sublabel: "Sent Back", neonKey: "not-approved", href: "/tasks?status=not_approved", color: "notApproved" },
  { key: "done", label: "Done", sublabel: "Done + Approved", neonKey: "done", href: "/tasks?status=done,approved", color: "done" },
  { key: "pending", label: "Pending", sublabel: "In Progress", neonKey: "pending", href: "/tasks?status=initiated,follow_up", color: "pending" },
  { key: "notStarted", label: "Not Started", sublabel: "Awaiting Pickup", neonKey: "not-started", href: "/tasks?status=not_started", color: "notStarted" },
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
  children,
}: {
  kpis: KpiSet;
  summary: WmsSummary;
  /** Days in the active date filter — drives the "vs last …" label. */
  rangeDays?: number;
  /** Folded away with the cards — the Task Analytics banner is passed in from
   *  the page so ONE toggle governs the whole summary block. */
  children?: React.ReactNode;
}) {
  const vsLabel = React.useMemo(() => `vs ${comparisonLabel(rangeDays)}`, [rangeDays]);
  const [expanded, setExpanded] = React.useState<keyof KpiSet | null>(null);
  // Whole-panel maximize/minimize. Open by default: minimized now hides the
  // cards ENTIRELY (it used to just drop to three compact ones), so defaulting
  // to closed would land the user on a dashboard with an empty summary bar.
  const [isKpiExpanded, setIsKpiExpanded] = React.useState(true);

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

  // Minimized hides the cards outright, so the whole set is always what WOULD
  // be shown — and the headline count is summed over it rather than over the
  // visible cards. Folding the section must not change the number in the
  // header; that count is the one thing the collapsed bar still reports.
  const shown = items;
  const headline = items.reduce((sum, i) => sum + kpis[i.key].current, 0);

  // Resolved against SHOWN, not all items: a card hidden by the search must not
  // leave its detail panel stranded below the strip with no card to point at.
  const active = expanded ? shown.find((i) => i.key === expanded) ?? null : null;

  return (
    <section className="mt-10" aria-label="Task summary">
     <PageShell as="div" width="full" py={false}>
      {/* Section header — the same block every dashboard widget uses. It was
          already outside the cards here; this just puts it on the shared
          typography so it reads as a peer of the headings below. */}
      <DashboardSectionHeader
        eyebrow="Tasks"
        eyebrowTone="muted"
        title="Task Summary"
        subtitle={
          <>
            <span className="font-semibold tabular-nums text-gray-900">
              {headline.toLocaleString()}
            </span>{" "}
            {headline === 1 ? "task" : "tasks"} in the current filter
          </>
        }
        /* Overview/Performance switcher, then collapse. The pills used to live
           on a "TEAM ANALYTICS · Insights" masthead of their own further down
           the page; that was a second header saying little the pills did not,
           so the control moved up here and the masthead was deleted. The fold
           control stays rightmost, as it is everywhere else.

           The red + that also used to sit here moved to the global top bar
           (<NewTaskQuickAction>, left of the notification bell): creating a task
           is an app-wide action, but here it was reachable from one section of
           one page and disappeared with the section whenever the summary was
           folded away. */
        actions={
          <>
            <DashboardViewTabs />
            <CollapseToggle
              expanded={isKpiExpanded}
              onToggle={() => setIsKpiExpanded((v) => !v)}
              label="the Task summary"
            />
          </>
        }
      />

      {/* Everything below the header line folds together: the KPI cards, any
          open card-detail panel, and the Task Analytics banner passed in as
          children. Collapsed, only the "Tasks <n>" line and the toggle remain. */}
      <CollapsibleBody expanded={isKpiExpanded}>
      {/* 14px between tiles. NOT the 10-12px the brief named: the grid was
          already at 0.7rem = 11.2px, so gap-2.5 (10px) would have TIGHTENED it
          and gap-3 (12px) would have moved it 0.8px. The gap reads smaller than
          it measures now that the cards are solid blocks of colour — 11px of
          near-white between two saturated tiles carries less visual separation
          than the same 11px did between two white outlined boxes, because the
          old cards had their own hairline border doing part of the work.
          `min` stays 165px, so auto-fit still reflows 6 -> 4 -> 3 -> 2 -> 1 and
          the tiles keep sharing the row width at 1fr each. */}
      <CardGrid min={165} gap="0.875rem">
        {shown.map((item) => {
          const kpi = kpis[item.key];
          const delta = kpi.current - kpi.previous;
          const up = delta > 0;
          const flat = delta === 0;
          const arrow = up ? "▲" : flat ? "→" : "▼";
          const isOpen = expanded === item.key;
          // The --kpi-neon-* / --kpi-soft-* tokens no longer drive the card: they
          // existed to tint a white surface (accent rail, border, badge fill),
          // and the surface is now the status colour itself. KpiDetailPanel below
          // still resolves them from `active.neonKey` for the expanded panel.

          return (
            <div key={item.key}>
              {/* Solid block of status colour, white type on top. The 3px accent
                  rail that used to run along the top is gone — it was how a white
                  card carried its status, and a card that IS the status has no
                  use for it. Open state reads as a white ring rather than a
                  coloured border, which would vanish against its own fill. */}
              <div
                className={`group relative h-full overflow-hidden rounded-xl p-4 text-white shadow-xs transition-all duration-200 hover:shadow-sm ${
                  isOpen ? "ring-2 ring-white/70 ring-inset" : ""
                }`}
                /* Gradient, not a flat block: a fully saturated card-sized
                   fill has no shading for the eye to rest against, so it reads
                   louder than it is. The white hairline comes with it -- these
                   sit on a near-white page, where a dark edge would read as a
                   shadow gluing the card to the background. */
                style={statusCardStyle(STATUS_COLORS[item.color])}
              >
                <div>
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
                      className="flex items-start gap-1 uppercase font-bold tracking-[0.07em] leading-[1.15] text-white"
                      style={{ fontSize: 11.5, minHeight: 24 }}
                    >
                      <span className="min-w-0">{item.label}</span>
                      <ArrowUpRight
                        size={13}
                        strokeWidth={3}
                        className="mt-px shrink-0 opacity-0 -translate-x-0.5 transition-all group-hover/link:opacity-100 group-hover/link:translate-x-0"
                      />
                    </span>
                    <span
                      className="block tabular-nums leading-none mt-2 text-white"
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
                    // Translucent white rather than a solid colour: one badge
                    // recipe that keeps its contrast on all six fills, from
                    // slate-900 to emerald-600, with no per-status tuning. Open
                    // state just raises the opacity — a coloured fill would be
                    // invisible against the card it sits on.
                    className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 font-medium uppercase tracking-[0.04em] ${
                      isOpen ? STATUS_CARD_BADGE_ACTIVE : STATUS_CARD_BADGE
                    }`}
                    style={{ fontSize: 11 }}
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                 </div>

                  {/* Comparison line. Its OWN full-width row, deliberately not
                      inside the <Link> above. In that column it shared the row
                      with the View pill and had ~85px of a 165px card, so
                      "vs last 2 weeks" wrapped and the card's overflow-hidden
                      clipped it to a bare "vs last". Full width plus
                      `whitespace-nowrap` keeps arrow + number + label on one
                      line; the label is a step smaller than the number so the
                      longest wording still clears the narrowest card. No inner
                      collapse any more — the card only exists when the whole
                      section is expanded. */}
                  {/* NOTE: the up/down colour is gone. This line used to be
                      green when the number rose and red when it fell, which
                      cannot survive on a red or emerald card — the delta would
                      either vanish into the fill or fight it. Direction now
                      rides entirely on the ▲/▼/→ glyph. */}
                  <span
                    className="mt-2 flex items-baseline gap-1 whitespace-nowrap tabular-nums font-extrabold text-white/80"
                    style={{ fontSize: 12.5 }}
                  >
                    <span>
                      {arrow} {Math.abs(delta)}
                    </span>
                    <span className="font-semibold text-white/70" style={{ fontSize: 11 }}>
                      {vsLabel}
                    </span>
                  </span>
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

      {/* Task Analytics banner (passed in by the dashboard page). */}
      {children}
      </CollapsibleBody>
     </PageShell>
    </section>
  );
}
