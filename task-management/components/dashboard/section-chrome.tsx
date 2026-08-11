"use client";

import * as React from "react";
import { Maximize2, Minimize2, ChevronLeft, ChevronRight } from "lucide-react";

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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Minimize" : "Maximize"} ${label}`}
      title={expanded ? "Minimize" : "Maximize"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.05em] transition-colors"
      style={{
        color: expanded ? "#fff" : tone,
        background: expanded ? tone : `color-mix(in srgb, ${tone} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 28%, transparent)`,
      }}
    >
      {expanded ? <Minimize2 size={13} strokeWidth={2.8} /> : <Maximize2 size={13} strokeWidth={2.8} />}
      {expanded ? "Minimize" : "Maximize"}
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
