"use client";

import * as React from "react";

/**
 * SECTION NAV — a single row of pills that scrolls the page to each dashboard
 * section, and highlights whichever one you are looking at.
 *
 * It replaces the Overview | Performance switcher. That control SWAPPED panels,
 * so half the dashboard was always hidden behind a tab; this one navigates a
 * single continuous page, which is why every section is now mounted at once.
 *
 * The ids are declared here rather than passed in: the bar and the sections it
 * points at have to agree, and a typo in one of them is a dead pill. Anything
 * whose id is not on the page is dropped from the bar at mount, so a section
 * that is admin-only or filtered away never leaves a tab pointing at nothing.
 */
export const DASHBOARD_SECTIONS = [
  { id: "overdue-by-person", label: "Overdue by Person" },
  { id: "sent-back-work", label: "Sent-back Work" },
  { id: "aging-heatmap", label: "Aging Heatmap" },
  { id: "delivered-on-time", label: "Delivered on Time" },
  { id: "delivery-vs-due", label: "Delivery vs Due Date" },
  { id: "status-by-doer", label: "Status by Doer" },
  { id: "delegation-scorecard", label: "Delegation Scorecard" },
] as const;

export function DashboardSectionNav() {
  const [present, setPresent] = React.useState<readonly string[]>([]);
  const [active, setActive] = React.useState<string | null>(null);

  // Which sections actually rendered. Read once on mount rather than assumed,
  // so a tab can never point at an element that is not there.
  React.useEffect(() => {
    setPresent(
      DASHBOARD_SECTIONS.map((s) => s.id).filter((id) => document.getElementById(id)),
    );
  }, []);

  React.useEffect(() => {
    if (present.length === 0) return;

    // `rootMargin` pulls the detection band up to just under the sticky bar and
    // down to the middle of the viewport, so the highlighted pill is the
    // section you are READING — not whichever one happens to touch the bottom
    // edge, which is what a bare 0-margin observer would report.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );

    for (const id of present) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [present]);

  const go = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Set the pill immediately. The observer will confirm it a moment later,
    // but waiting for the scroll to settle makes the click feel unacknowledged.
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (present.length === 0) return null;

  const tabs = DASHBOARD_SECTIONS.filter((s) => present.includes(s.id));

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-30 -mx-1 border-b border-slate-200 bg-white/95 backdrop-blur-sm"
    >
      {/* One row, always. `overflow-x-auto` + `whitespace-nowrap` let a narrow
          viewport scroll the pills sideways instead of wrapping them onto a
          second line, which would shift every section below on resize. */}
      <div className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap px-1 py-3">
        {tabs.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "bg-slate-900 font-semibold text-white"
                  : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
