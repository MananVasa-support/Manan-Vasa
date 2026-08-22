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
 *
 * ORDER IS THE PAGE'S ORDER. These eight run top to bottom exactly as
 * app/(app)/dashboard/page.tsx renders them — a bar whose sequence disagrees
 * with the scroll it drives reads as broken even when every link works.
 */
export const DASHBOARD_SECTIONS = [
  { id: "overdue-by-person", label: "Overdue by Person" },
  { id: "sent-back-work", label: "Sent-back Work" },
  { id: "aging-heatmap", label: "Aging Heatmap" },
  { id: "delivered-on-time", label: "Delivered on Time" },
  { id: "delivery-vs-due-date", label: "Delivery vs Due Date" },
  { id: "status-by-doer", label: "Status by Doer" },
  { id: "delegation-scorecard", label: "Delegation Scorecard" },
  { id: "top-performers", label: "Top Performers" },
] as const;

/**
 * How far above the section's own top edge the scroll lands, in px.
 *
 * Clears the sticky filter bar plus this nav. It is applied by the click
 * handler rather than left to each section's `scroll-mt-*` class, so all eight
 * land at the SAME clearance — the scroll-margin utilities are still on the
 * page for browser-driven landings (a `#section` URL, a back button), where no
 * handler of ours runs.
 */
const SCROLL_OFFSET = 90;

/** How long to trust the click over the observer when no `scrollend` arrives.
 *  Safari has no scrollend event; without a fallback the bar would stay pinned
 *  to the clicked pill forever after the first click in that browser. */
const SCROLL_SETTLE_MS = 1000;

export function DashboardSectionNav() {
  const [present, setPresent] = React.useState<readonly string[]>([]);
  const [active, setActive] = React.useState<string | null>(null);

  // Set while a click-driven smooth scroll is in flight. A smooth scroll
  // crosses every section between here and the target, and the observer
  // faithfully reports each one — so without this the bar strobes through four
  // pills on the way down and only then settles. The click's answer is the
  // right one; the observer resumes once the page stops moving.
  const scrollingTo = React.useRef<string | null>(null);

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
    //
    // THRESHOLD IS [0, 0.3], NOT A BARE 0.3. `threshold` measures how much of
    // the TARGET is showing, so a section taller than ~3× the detection band
    // can never reach 30% of itself and a bare 0.3 would leave its pill dead —
    // Status by Doer and the Aging Heatmap both get that tall on a full team.
    // Keeping 0 in the list means every section still reports, and 0.3 gives
    // the extra callback as a section takes over the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        // A click owns the highlight until its scroll settles.
        if (scrollingTo.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.3] },
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
    scrollingTo.current = id;

    const y = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: y, behavior: "smooth" });

    // Hand the highlight back to the observer once the page stops. `scrollend`
    // where it exists, a timer everywhere else — whichever lands first wins,
    // and the other is torn down with it.
    const release = () => {
      // Only release OUR lock. Clicking a second pill mid-scroll starts a new
      // lock, and this release — still queued from the first click — would
      // otherwise clear it and hand the highlight back to the observer while
      // the second scroll is still travelling.
      if (scrollingTo.current === id) scrollingTo.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("scrollend", release);
    };
    const timer = window.setTimeout(release, SCROLL_SETTLE_MS);
    window.addEventListener("scrollend", release, { once: true });
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
              // NO `dark:` VARIANTS. This app has no dark theme — the dashboard
              // paints an opaque white canvas and every surface under it is
              // hardcoded light. Tailwind's default `dark:` follows the OS
              // setting, so `dark:bg-slate-800` here would darken these pills
              // for anyone whose laptop is in dark mode while the bar they sit
              // on stayed white. Same call as manager-activity-table.tsx and
              // section-chrome.tsx, for the same reason.
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs ${
                isActive
                  ? "font-semibold text-white shadow-sm transition-all duration-200"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              // THE BRAND RED, not Tailwind's `red-600` (#DC2626). This app's
              // primary red is #E10600 and it already has a token — the CTA
              // buttons, the accent rail and every `text-altus-red` hover read
              // from it. A second near-identical red hardcoded here is the
              // drift that ends with nobody knowing which one is correct.
              style={isActive ? { background: "var(--color-altus-red)" } : undefined}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
