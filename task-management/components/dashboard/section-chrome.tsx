"use client";

import * as React from "react";
import { ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DashboardSectionHeader,
  type DashboardSectionHeaderProps,
} from "./section-header";

/**
 * Shared chrome for the analytics dashboard's panels — ONE collapse control and
 * ONE pager, so every section folds and pages identically.
 *
 * Deliberately two small primitives rather than a wrapper component: the panels
 * have very different headers (icon + title + subtitle + their own controls),
 * and a one-size wrapper would have meant rewriting all of them. These drop
 * into the headers that already exist.
 */

/* ───────────────────────── Collapse / expand ───────────────────────── */

/**
 * Maximize ⇄ Minimize toggle. Pair with <CollapsibleBody> and drive both from
 * the same boolean.
 *
 * ICON-ONLY, following the window-chrome convention rather than words: when the
 * section is open the button shows the OVERLAPPING double square ("restore
 * down"), and when it is folded it shows a single square ("maximize"). That
 * reads instantly at the corner of a header, where a 9-character "MINIMIZE"
 * pill competed with the section title for attention. The meaning is still
 * carried for assistive tech by aria-expanded + aria-label.
 */
export function CollapseToggle({
  expanded,
  onToggle,
  label,
  tone = "var(--color-altus-red)",
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Section name, used to build the accessible label ("Expand Task summary"). */
  label: string;
  tone?: string;
}) {
  // CHEVRON, not the Minimize2/Maximize2 window-chrome pair this used to show.
  // Those icons say "resize" — they are what a fullscreen control looks like —
  // so a button that actually folds the section away read as one that would
  // blow it up. A chevron points at what happens: up folds it, down unfolds it.
  //
  // One <ChevronUp> that rotates, rather than swapping two icon components:
  // swapping remounts the SVG and kills the transition, so the flip would be
  // instant while the body animated.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      title={expanded ? "Collapse" : "Expand"}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
    >
      <ChevronUp
        size={15}
        strokeWidth={2.6}
        aria-hidden
        className={`transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
          expanded ? "" : "rotate-180"
        }`}
      />
    </button>
  );
}

/**
 * Smoothly-animating collapse container. Uses the `grid-template-rows: 0fr → 1fr`
 * technique (the same one the KPI detail panel already uses) rather than
 * animating `height`, because it transitions to the content's NATURAL height
 * with no measurement and no layout thrash.
 *
 * `aria-hidden` + `inert` while collapsed so screen readers and Tab skip the
 * folded content instead of landing on invisible controls.
 */
export function CollapsibleBody({
  expanded,
  children,
  className = "",
}: {
  expanded: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
    >
      <div
        className={`overflow-hidden ${className}`}
        aria-hidden={!expanded}
        // `inert` keeps collapsed content out of the tab order. Cast because the
        // React types in this version don't yet expose it.
        {...(!expanded ? ({ inert: "" } as Record<string, string>) : {})}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Header + collapsible card, wired together.
 *
 * Every section had its own masthead and only two of the nine could fold. This
 * pairs `DashboardSectionHeader` with `CollapsibleBody` and owns the one
 * boolean between them, so adding the control to a widget is a wrapper rather
 * than a fresh piece of state per file — and the toggle always lands in the
 * same place, to the right of whatever pager that section already had.
 *
 * The header stays OUTSIDE the collapsible body on purpose: folding a section
 * must leave its title on screen, or the page becomes a column of anonymous
 * strips with no way to tell what you are re-opening.
 */
export function CollapsibleSection({
  children,
  defaultExpanded = true,
  actions,
  label,
  bodyClassName,
  ...header
}: Omit<DashboardSectionHeaderProps, "actions"> & {
  children: React.ReactNode;
  /** Start folded. Defaults to open. */
  defaultExpanded?: boolean;
  /** Section-owned controls (pagers, window toggles) — placed LEFT of the
   *  minimize button so the fold control is always the rightmost thing. */
  actions?: React.ReactNode;
  /** Accessible name for the toggle, e.g. "the Aging heatmap". */
  label: string;
  bodyClassName?: string;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  return (
    <>
      <DashboardSectionHeader
        {...header}
        actions={
          <>
            {actions}
            <CollapseToggle
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              label={label}
            />
          </>
        }
      />
      <CollapsibleBody expanded={expanded} className={bodyClassName}>
        {children}
      </CollapsibleBody>
    </>
  );
}

/* ───────────────────────────── Pagination ──────────────────────────── */

/** Up to 5 numbered buttons around the current page, with ellipses at the ends. */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, Math.min(current - 1, total - 3));
  const to = Math.min(total - 1, Math.max(current + 1, 4));
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}

/**
 * Top-right pager shared by every paginated dashboard section: ‹ Prev · 1 2 3 ·
 * Next ›, with a "5–8 of 23" readout. Renders nothing on a single page, so a
 * short list stays clean.
 */
export function SectionPagination({
  page,
  pageCount,
  onPage,
  total,
  pageSize,
  label,
}: {
  /** 1-based. */
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  total: number;
  pageSize: number;
  /** Section name for the nav's accessible label. */
  label: string;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const btn =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-1.5 text-[12px] font-bold tabular-nums transition-colors disabled:opacity-35 disabled:cursor-not-allowed";

  return (
    <nav className="flex items-center gap-1.5 shrink-0" aria-label={`${label} pages`}>
      <span className="mr-1 text-[11.5px] font-semibold tabular-nums text-ink-subtle max-md:hidden">
        {first}–{last} of {total}
      </span>
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={`${btn} border-hairline bg-surface-card text-ink-strong enabled:hover:border-altus-red enabled:hover:text-altus-red`}
      >
        <ChevronLeft size={14} strokeWidth={2.6} />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} aria-hidden className="px-0.5 text-[12px] font-bold text-ink-subtle">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${btn} ${
              p === page
                ? "border-transparent text-white"
                : "border-hairline bg-surface-card text-ink-strong hover:border-altus-red hover:text-altus-red"
            }`}
            style={
              p === page
                ? {
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    boxShadow: "0 4px 10px -4px rgba(225,6,0,0.5)",
                  }
                : undefined
            }
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
        className={`${btn} border-hairline bg-surface-card text-ink-strong enabled:hover:border-altus-red enabled:hover:text-altus-red`}
      >
        <ChevronRight size={14} strokeWidth={2.6} />
      </button>
    </nav>
  );
}

/**
 * Page state over a list. Clamps when the list shrinks (a search or filter can
 * drop the row count below the current page) so you never land on a blank page.
 */
export function usePagedRows<T>(rows: T[], pageSize: number) {
  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  React.useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(rows.length / pageSize))));
  }, [rows.length, pageSize]);

  const visible = React.useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, pageCount, visible, total: rows.length, pageSize };
}
