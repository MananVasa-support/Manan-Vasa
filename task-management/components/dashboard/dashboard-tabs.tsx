"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/page-shell";

/**
 * DashboardTabs — ONE bordered analytics container holding everything below the
 * Task Report banner, with its three views selected from the header's top-right.
 *
 * The dashboard used to render all eight analytics sections in one column, in a
 * fixed order, so answering "who needs chasing?" meant scrolling past the
 * leaderboard and the status split to reach the aging lanes. The same eight
 * sections are now dealt into three purposes — Overview (team health),
 * Performance (who is delivering) and Attention (what needs action) — and only
 * the selected one is MOUNTED, not merely hidden, so each view is its own short
 * scroll. Nothing is duplicated: every section lives in exactly one tab.
 *
 * This replaces a full-width underline tab strip that sat loose on the page.
 * Structurally that was in the right place — directly after the banner — but
 * with no frame around it, three plain text labels on a white band read as page
 * chrome rather than as the header of the content beneath, and once pinned it
 * travelled down the page away from the sections it belonged to. A single
 * bordered card makes the ownership explicit: the tabs are visibly the header of
 * this box, and the box visibly contains the analytics.
 */

export type DashboardTabId = "overview" | "performance";

/**
 * TWO tabs, not three. "Attention" (Overdue · Aging · Delivered on Time) is gone
 * because its three panels were promoted onto the page above this box — they are
 * what the dashboard is opened to answer, so they are always on screen now
 * rather than behind a click. Keeping the pill with nothing behind it would have
 * shipped a tab that opens onto an empty panel.
 *
 * What remains is the deliberate second look, and Overview leads it.
 */
const TABS: { id: DashboardTabId; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Today's status and workload spread" },
  { id: "performance", label: "Performance", hint: "Who is delivering — best to worst" },
];

export function DashboardTabs({
  overview,
  performance,
}: {
  overview: React.ReactNode;
  performance: React.ReactNode;
}) {
  const [active, setActive] = React.useState<DashboardTabId>("overview");
  const [stickyTop, setStickyTop] = React.useState(0);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  /* How much of the viewport top is already covered by pinned chrome? Walk up
     from the anchor and look at each ancestor's PRECEDING siblings for anything
     pinned (the app top bar, the sticky filter bar, the mobile rail's fixed top
     strip). The offset is the tallest of them — `height + its own top`.

     This USED to position the header's own `sticky top:`. The header is no
     longer sticky — it is a plain block, so it can never overlay what follows —
     and the measurement now serves only `selectTab` below: it is the y a
     scroll-back must stop at so the container lands just under the pinned
     chrome rather than beneath it.

     Measured rather than hard-coded: the filter bar grows a row the moment an
     active-filter chip wraps, so a fixed `57px` would be wrong on one page and
     clip on another. A ResizeObserver catches that reflow.

     `useEffect`, not `useLayoutEffect`: this still renders on the server, where
     useLayoutEffect warns. Nothing flashes — the value is only read inside a
     click handler, never during paint. */
  React.useEffect(() => {
    const node = anchorRef.current;
    if (!node) return;

    const pinned: HTMLElement[] = [];
    for (let cur = node.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
      for (let sib = cur.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (!(sib instanceof HTMLElement)) continue;
        const pos = getComputedStyle(sib).position;
        if (pos === "sticky" || pos === "fixed") pinned.push(sib);
      }
    }
    if (pinned.length === 0) return; // nothing above → pins flush at the top

    const measure = () => {
      let offset = 0;
      for (const el of pinned) {
        const cs = getComputedStyle(el);
        const top = Number.parseFloat(cs.top);
        offset = Math.max(
          offset,
          el.getBoundingClientRect().height + (Number.isFinite(top) ? top : 0),
        );
      }
      setStickyTop(Math.round(offset));
    };

    measure();
    const ro = new ResizeObserver(measure);
    for (const el of pinned) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /* Switching view while scrolled deep into the previous one would otherwise
     drop you into the middle of the new one. Snap back to the container — but
     only when its header has actually been scrolled past, so a switch made with
     the box already in view doesn't jump. */
  function selectTab(id: DashboardTabId) {
    setActive(id);
    const anchor = anchorRef.current;
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top;
    if (top < stickyTop) {
      window.scrollTo({ top: window.scrollY + top - stickyTop, behavior: "smooth" });
    }
  }

  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0]!;
  const panel = active === "performance" ? performance : overview;

  return (
    <>
      {/* Measuring point for "have we scrolled past the container?", read by
          selectTab. A zero-height marker rather than the header element itself,
          so it keeps reporting the container's true top no matter how the header
          is laid out. */}
      <div ref={anchorRef} aria-hidden />

      {/* No top margin of its own. This box is now the LAST block in the
          dashboard's gap-6 column, so the column already spaces it from the
          Delivered-on-Time section above; an `mt-3` here would stack on top of
          that gap and break the even 24px rhythm. `mb-10` stays — that is page
          bottom, not a gap between siblings. */}
      <PageShell as="section" width="full" py={false} className="mb-10">
        {/* PANEL — now the FIRST of the two standalone blocks; the header that
            labels it follows below. `--page-gutter: 0px` neutralises
            the page gutter for every PageShell nested inside (StatusTable and
            the Aging heatmap each render their own), which would otherwise inset
            the content a second time inside a box that is already inset. */}
        <div
          className="rounded-2xl border bg-white"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            role="tabpanel"
            id={`dashboard-panel-${active}`}
            aria-labelledby={`dashboard-tab-${active}`}
            className="px-5 py-6 max-md:px-4 max-md:py-5"
            style={{ "--page-gutter": "0px" } as React.CSSProperties}
          >
            {panel}
          </div>
        </div>
        {/* HEADER — its own standalone block, and now the LAST thing in the
            section: the title, subtitle and the Attention/Overview/Performance
            switcher all sit BELOW the panel they describe, at the very bottom.

            It used to be `sticky z-20` inside that card, which is what made it
            overlay adjacent content: `position: sticky` plus a z-index creates
            a stacking context that paints above later siblings, so while pinned
            the bar sat on top of whatever scrolled under it. Both are gone —
            this is now an ordinary block that occupies its own space in flow and
            can't cover anything. No absolute/fixed, no negative margins, no
            z-index.

            The switcher does not follow you down a long panel — it is parked at
            the end of it. That works out for the reading order it creates:
            because the control now sits below the container's top, `selectTab`
            always finds the anchor scrolled past and snaps you back up to the
            start of whichever view you just picked. */}
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border bg-white px-6 py-4 max-md:px-4"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div className="min-w-0">
            <span
              className="block uppercase font-bold tracking-[0.12em]"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 10.5,
                color: "var(--color-altus-red)",
              }}
            >
              Team Analytics
            </span>
            <h2
              className="mt-0.5 font-black leading-tight text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: 21,
                letterSpacing: "-0.02em",
              }}
            >
              Insights
            </h2>
            {/* Reads the ACTIVE tab, so the header always says what you are
                looking at rather than describing the box in general. */}
            <p className="mt-0.5 text-[13px] font-semibold text-ink-muted">
              {activeTab.hint}
            </p>
          </div>

          {/* Segmented switcher — the same shape as the sort control inside
              the Aging section below, so the surface keeps one vocabulary for
              "pick one of these". */}
          <div
            role="tablist"
            aria-label="Dashboard views"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1 max-md:w-full"
          >
            {TABS.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`dashboard-tab-${t.id}`}
                  aria-selected={isActive}
                  aria-controls={`dashboard-panel-${t.id}`}
                  title={t.hint}
                  onClick={() => selectTab(t.id)}
                  className={`px-3 py-1 text-xs transition-colors max-md:flex-1 max-md:px-2 ${
                    isActive
                      ? "rounded-md bg-white font-semibold text-red-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

      </PageShell>
    </>
  );
}
