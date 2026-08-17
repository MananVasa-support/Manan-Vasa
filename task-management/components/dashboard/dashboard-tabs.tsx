"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/page-shell";

/**
 * DashboardTabs — the three-view switcher that sits directly under the Task
 * Report banner and owns everything below it.
 *
 * The dashboard used to render all eight analytics sections in one column, so
 * answering "who needs chasing?" meant scrolling past the leaderboard and the
 * status split to reach the aging lanes. The same eight sections are now dealt
 * into three purposes — Overview (team health), Performance (who is delivering)
 * and Attention (what needs action) — and only the selected one is MOUNTED, not
 * merely hidden, so each view is its own short scroll.
 *
 * Nothing is duplicated across the three: every section lives in exactly one.
 *
 * The bar sticks under whatever chrome is already pinned above it. That offset
 * is MEASURED rather than hard-coded, because the thing above it (the filter
 * bar) changes height whenever active-filter chips wrap to a second row — a
 * fixed `top-[57px]` would leave a gap on one page and clip on another.
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

  /* How far down the page is this bar allowed to pin? Walk up from the bar and
     look at each ancestor's PRECEDING siblings for anything already pinned
     (the sticky filter bar, the mobile rail's fixed top strip). The offset is
     the tallest of them — `height + its own top` — so the tab bar lands flush
     underneath instead of sliding beneath it or floating below a gap.

     Re-measured on resize AND through a ResizeObserver, since the filter bar
     grows a row the moment a filter chip is added.

     `useEffect`, not `useLayoutEffect`: this component still renders on the
     server, where useLayoutEffect warns. Nothing flashes — until the offset is
     known the bar has not been scrolled to yet, so it is sitting at its natural
     position and `top` is unused. */
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
    if (pinned.length === 0) return; // nothing above → stays flush at the top

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
     drop you into the middle of the new one. Snap back to the bar — but only
     when it has actually been scrolled past, so a switch made at the top of the
     page doesn't jump. */
  function selectTab(id: DashboardTabId) {
    setActive(id);
    const anchor = anchorRef.current;
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top;
    if (top < stickyTop) {
      window.scrollTo({ top: window.scrollY + top - stickyTop, behavior: "smooth" });
    }
  }

  const panel = active === "overview" ? overview : active === "performance" ? performance : attention;

  return (
    <>
      {/* Measuring point for "have we scrolled past the bar?" — the bar itself
          can't answer that, because once pinned its own top IS `stickyTop`. */}
      <div ref={anchorRef} aria-hidden className="mt-10" />

      <div
        className="z-30 border-b border-hairline"
        style={{ position: "sticky", top: stickyTop, background: "#ffffff" }}
      >
        <PageShell as="div" width="full" py={false}>
          {/* Underline tabs rather than a filled segmented control: the page
              already carries a red segmented toggle inside two of the sections
              below, and a second one at page level competed with them. */}
          <div role="tablist" aria-label="Dashboard views" className="-mb-px flex items-end gap-1">
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
                  className="relative px-4 py-3 text-[14.5px] font-bold transition-colors max-md:flex-1 max-md:px-2 max-md:text-[13.5px]"
                  style={{ color: isActive ? "var(--color-ink-strong)" : "var(--color-ink-muted)" }}
                >
                  {t.label}
                  <span
                    aria-hidden
                    className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full transition-opacity"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      opacity: isActive ? 1 : 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </PageShell>
      </div>

      <div
        role="tabpanel"
        id={`dashboard-panel-${active}`}
        aria-labelledby={`dashboard-tab-${active}`}
      >
        {panel}
      </div>
    </>
  );
}
