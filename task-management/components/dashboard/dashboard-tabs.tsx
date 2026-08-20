"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/page-shell";
import { useDashboardView } from "./dashboard-view";

/**
 * DashboardAnalyticsPanel — the bordered box holding whichever analytics view is
 * selected. It draws NO header of its own.
 *
 * It used to own the whole thing: a "TEAM ANALYTICS · Insights" masthead with an
 * eyebrow, title, live subtitle and the segmented switcher, plus the panel
 * beneath. That header was a second masthead stacked under the Task Summary
 * one, saying little the pills did not, so it is gone and the switcher moved
 * into the Task Summary header's control cluster — one header, one place to
 * change view. The selection now lives in <DashboardViewProvider> because the
 * control and this panel are no longer in the same subtree.
 *
 * Also gone with the header: the sticky-offset measurement and the scroll-back
 * on tab change. Both existed because the switcher sat directly above this box;
 * with it up in the page header there is nothing to snap back to.
 *
 * Only the selected view is MOUNTED, not merely hidden, so each is its own short
 * scroll and nothing is duplicated across them.
 */
export function DashboardTabs({
  overview,
  performance,
}: {
  overview: React.ReactNode;
  performance: React.ReactNode;
}) {
  const { view } = useDashboardView();
  const panel = view === "performance" ? performance : overview;

  return (
    <PageShell as="section" width="full" py={false} className="mb-10">
      <div
        className="rounded-2xl border bg-white"
        style={{
          borderColor: "var(--color-hairline-strong)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        {/* `--page-gutter: 0px` neutralises the page gutter for every PageShell
            nested inside (StatusTable and the Aging heatmap each render their
            own), which would otherwise inset the content a second time inside a
            box that is already inset. */}
        <div
          role="tabpanel"
          id={`dashboard-panel-${view}`}
          aria-labelledby={`dashboard-tab-${view}`}
          className="px-5 py-6 max-md:px-4 max-md:py-5"
          style={{ "--page-gutter": "0px" } as React.CSSProperties}
        >
          {panel}
        </div>
      </div>
    </PageShell>
  );
}
