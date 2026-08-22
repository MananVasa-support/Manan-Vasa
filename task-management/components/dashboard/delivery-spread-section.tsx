"use client";

import * as React from "react";
import { CalendarCheck2 } from "lucide-react";
import { FineBucketBars } from "@/components/dashboard/task-report/fine-bucket-bars";
import type { DoneFineDistribution } from "@/lib/queries/task-report";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
} from "@/components/dashboard/section-chrome";
import { PageShell } from "@/components/layout/page-shell";

/**
 * DELIVERY VS DUE DATE — the 12-bucket spread.
 *
 * Moved here from the Task Analytics report (task-report-view.tsx), where it
 * was the first section. `DoneCard` and its `GlassCard` shell are carried over
 * UNCHANGED — same bucket split, same denominator, same bars, same on-time
 * percentage — because the point of the move was the placement, not a redesign.
 *
 * What could not come with it is the report's `ReportSection` chrome: that
 * component is shared with the report's other sections and stays there. The
 * dashboard's own DashboardSectionHeader + CollapseToggle wrap it instead, so
 * this section folds like every other section on this page rather than
 * importing a second set of section furniture.
 *
 * The DATA is computed the way the report computed it — every non-archived done
 * task, NOT the dashboard's filtered period — so the percentage reads the same
 * here as it did there. See `doneSpread` in lib/queries/dashboard.ts.
 */
/* Carried over verbatim from task-report-view, where DoneCard read them. */
const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-altus-red, #E10600)";

export function DeliverySpreadSection({ dist }: { dist: DoneFineDistribution }) {
  const [open, setOpen] = React.useState(true);
  // The headline figures move UP into the header's right-hand slot, beside the
  // fold control. They used to be a 46px display number and a two-line legend
  // stacked at the top of the card, which put a second, larger masthead
  // directly under the section's actual one.
  const rate = dist.dated > 0 ? Math.round((dist.onTime / dist.dated) * 100) : 0;

  return (
    <PageShell as="section" width="full" py={false} aria-label="Delivery vs due date">
      <DashboardSectionHeader
        icon={
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-xl"
            style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-strong)" }}
          >
            <CalendarCheck2 size={20} strokeWidth={2.2} />
          </span>
        }
        title="Delivery vs due date — the 12-bucket spread"
        subtitle="Completed tasks categorized by delivery timing relative to their committed due dates."
        actions={
          <>
            <span className="flex items-center gap-3 text-[12.5px] font-bold max-md:hidden">
              <span className="tabular-nums" style={{ color: GREEN }}>
                {rate}% <span className="text-ink-soft">on time</span>
              </span>
              <span aria-hidden className="text-hairline-strong">
                ·
              </span>
              <span style={{ color: GREEN }}>
                <span className="tabular-nums text-ink-strong">{dist.onTime}</span> On /
                Before
              </span>
              <span style={{ color: RED }}>
                <span className="tabular-nums text-ink-strong">{dist.late}</span> Late
              </span>
            </span>
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="the delivery spread"
            />
          </>
        }
      />
      <CollapsibleBody expanded={open}>
        <DoneCard dist={dist} label="By ORIGINAL due date" />
      </CollapsibleBody>
    </PageShell>
  );
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${DASHBOARD_CARD_PADDED} ${className ?? ""}`}>
      {children}
    </div>
  );
}

/* ──────────────────────── ① + ② DONE distribution card ─────────────────── */

function DoneCard({ dist, label }: { dist: DoneFineDistribution; label: string }) {
  // One denominator across BOTH halves, taken from the full distribution, so a
  // bar's length means the same thing on either side of the split.
  const barScale = Math.max(...dist.buckets.map((b) => b.count), 1);
  return (
    <GlassCard>
      {/* The rate / On-Before / Late summary that used to open this card now
          lives in the section header (see DeliverySpreadSection). Only the
          basis caption stays, because it says which due date the bars below
          are measured against — which the header does not. */}
      <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </p>

      {/* Side-by-side split. The buckets are already ordered most-overdue first
          through earliest-delivery last, so `fineBucketIsLate` cuts the list
          cleanly in two at the "On Due Date" boundary — no re-ordering and no
          second source of truth for which band is which.
          On Due Date sits on the RIGHT: delivering exactly on the committed day
          is hitting the deadline, not missing it. */}
      <div className="mt-4 grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <FineBucketBars
          buckets={dist.buckets.filter((b) => b.late)}
          heading="Overdue"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
        <FineBucketBars
          buckets={dist.buckets.filter((b) => !b.late)}
          heading="On time & early"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
      </div>

      {dist.undated > 0 && (
        <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
          {dist.undated} Done Without a Comparable Date — Not Counted.
        </p>
      )}
    </GlassCard>
  );
}
