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

export type DashboardTabId = "overview" | "performance" | "attention";

const TABS: { id: DashboardTabId; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Team health at a glance" },
  { id: "performance", label: "Performance", hint: "Who is delivering — best to worst" },
  { id: "attention", label: "Attention", hint: "What needs action now" },
];

export function DashboardTabs({
  overview,
  performance,
  attention,
}: {
  overview: React.ReactNode;
  performance: React.ReactNode;
  attention: React.ReactNode;
}) {
  const [active, setActive] = React.useState<DashboardTabId>("overview");
  const [stickyTop, setStickyTop] = React.useState(0);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  /* How far down may the container's header pin? Walk up from the anchor and
     look at each ancestor's PRECEDING siblings for anything already pinned (the
     sticky filter bar, the mobile rail's fixed top strip). The offset is the
     tallest of them — `height + its own top` — so the header lands flush
     underneath instead of sliding beneath it or floating below a gap.

     Measured rather than hard-coded: the filter bar grows a row the moment an
     active-filter chip wraps, so a fixed `top-[57px]` would leave a gap on one
     page and clip on another. A ResizeObserver catches that reflow.

     `useEffect`, not `useLayoutEffect`: this still renders on the server, where
     useLayoutEffect warns. Nothing flashes — until the offset is known the
     header has not been scrolled to, so `top` is unused. */
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
  const panel =
    active === "overview" ? overview : active === "performance" ? performance : attention;

  return (
    <>
      {/* Measuring point for "have we scrolled past the header?" — the header
          itself can't answer that, because once pinned its own top IS
          `stickyTop`. */}
      <div ref={anchorRef} aria-hidden />

      <PageShell as="section" width="full" py={false} className="mt-8 mb-16">
        {/* NO `overflow-hidden` on this box: it would kill the sticky header
            inside it. The children all carry their own radius, so nothing needs
            clipping at the corners. */}
        <div
          className="rounded-2xl border bg-white"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          }}
        >
          {/* Header — title left, tabs top-right. Sticks while you scroll the
              active view, so the switcher stays reachable without scrolling back
              up, then leaves with the container. */}
          <div
            className="sticky z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-t-2xl border-b bg-white px-5 py-4 max-md:px-4"
            style={{ top: stickyTop, borderColor: "var(--color-hairline)" }}
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
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gray-100 p-1 max-md:w-full"
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
                    className={`rounded-lg px-4 py-1.5 text-[13.5px] font-bold transition-colors max-md:flex-1 max-md:px-2 ${
                      isActive ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                    style={isActive ? { color: "var(--color-altus-red)" } : undefined}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body. `--page-gutter: 0px` neutralises the page gutter for every
              PageShell nested inside a section (StatusTable and the Aging
              heatmap each render their own), which would otherwise inset the
              content a second time inside a box that is already inset. */}
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
      </PageShell>
    </>
  );
}
