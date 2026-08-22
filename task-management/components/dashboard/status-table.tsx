"use client";
import { MultiSelect } from "@/components/ui/multi-select";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Search,
  X,
  Users,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
} from "lucide-react";
import type { EmployeeStatusRow, StatusCellBucket, ViewMode } from "@/lib/types";
import { StatusCellPopover } from "./status-cell-popover";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { useKpiFocus, setKpiFocus } from "@/lib/client/kpi-focus";
import type { KpiBucketKey } from "@/lib/dashboard/kpi-buckets";
import { DEFAULT_DEBOUNCE_MS, useDebouncedCallback } from "@/lib/client/use-debounced";
import { SectionPagination, usePagedRows, CollapseToggle, CollapsibleBody, DASHBOARD_CARD } from "./section-chrome";
import { DashboardSectionHeader } from "./section-header";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { Avatar } from "@/components/ui/avatar";
import { PageShell } from "@/components/layout/page-shell";

type Tone = "green" | "amber" | "red" | "rose";

function Pill({ value, tone }: { value: number; tone: Tone }) {
  if (value === 0) {
    return <span className="text-ink-subtle text-mono">0</span>;
  }
  return (
    <span
      className="inline-flex items-center justify-center px-3 py-1.5 rounded-pill text-[15px] font-bold tabular-nums"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 15%, transparent)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {value}
    </span>
  );
}

/** A count with no tone. `Pill` resolves --color-<tone>-deep, and the slate
 *  family has no such token, so the neutral statuses render as plain figures. */
function PlainCount({ value }: { value: number }) {
  if (value === 0) return <span className="text-ink-subtle text-mono">0</span>;
  return <span className="text-[15px] font-bold tabular-nums text-ink-soft">{value}</span>;
}

/** Wraps a count cell in its hover preview. Every count column goes through
 *  this, so the header, the mini-list and the "View all" link are defined once
 *  instead of six times. */
function withPreview(
  row: EmployeeStatusRow,
  bucket: StatusCellBucket,
  count: number,
  view: ViewMode,
  children: React.ReactNode,
) {
  return (
    <StatusCellPopover
      employeeName={row.employeeName}
      employeeId={row.employeeId}
      bucket={bucket}
      count={count}
      tasks={row.previews?.[bucket]}
      view={view}
    >
      {children}
    </StatusCellPopover>
  );
}

/** One numeric status column. Declared as DATA, not JSX, because the table
 *  renders it in two orientations — statuses across the top, or statuses down
 *  the side when transposed — and a second copy of the schema is how the two
 *  views drift apart.
 *
 *  ON HOLD is included even though it was not in the requested ten: these
 *  eleven columns PARTITION Total, and dropping it would leave paused work
 *  counted in Total and shown in no column — the "columns sum short of the
 *  total" bug the transform's exhaustiveness guard exists to prevent. Critical
 *  and Pending are gone for the mirror-image reason: a priority and a
 *  seven-status rollup both cut ACROSS the lifecycle, so neither can sit in a
 *  per-status schema without double-counting. */
type StatusCol = {
  key: keyof EmployeeStatusRow;
  label: string;
  tone?: Tone;
  /** The preview bucket that counts EXACTLY this column. Every status column
   *  now has one, so every non-zero cell in the grid hovers. It stays optional
   *  only so a future non-status column can opt out rather than borrow a
   *  bucket that counts something else. */
  preview?: StatusCellBucket;
};

const STATUS_COLUMNS: StatusCol[] = [
  { key: "approved", label: "Approved", tone: "green", preview: "approved" },
  { key: "notApproved", label: "Not Approved", tone: "red", preview: "notApproved" },
  { key: "done", label: "Done", tone: "green", preview: "done" },
  { key: "followUp", label: "Follow Up", tone: "amber", preview: "followUp" },
  { key: "needHelp", label: "Need Info", tone: "amber", preview: "needHelp" },
  { key: "initiated", label: "Initiated", tone: "amber", preview: "initiated" },
  { key: "notStarted", label: "Not Started", preview: "notStarted" },
  { key: "dontKnow", label: "Not Read", preview: "dontKnow" },
  { key: "onHold", label: "On Hold", tone: "amber", preview: "onHold" },
  { key: "transferred", label: "Transferred", preview: "transferred" },
  { key: "cancelled", label: "Cancelled", tone: "rose", preview: "cancelled" },
];

/**
 * Which of the columns above each Task Summary card covers — the table's half
 * of the [ VIEW ] toggle. Expanding NOT APPROVED up in the strip narrows this
 * grid to the Not Approved column and to the people who actually have some.
 *
 * The keys are this table's own column keys, not task statuses, because the
 * two vocabularies are not the same shape: the strip's Done card covers both
 * the `done` and `approved` columns, and its Pending card is the residual over
 * four of them (see lib/dashboard/kpi-buckets.ts).
 *
 * Transferred / Cancelled belong to NO card. They are excluded from the Task
 * Summary entirely, so no focus can select them — which is the intended
 * reading, not an omission.
 */
const KPI_FOCUS_COLUMNS: Record<
  Exclude<KpiBucketKey, "total">,
  readonly (keyof EmployeeStatusRow)[]
> = {
  needHelp: ["needHelp"],
  notApproved: ["notApproved"],
  done: ["approved", "done"],
  pending: ["initiated", "followUp", "onHold", "dontKnow"],
  notStarted: ["notStarted"],
};

/** Human name of the focused card, for the "Focused on …" chip. */
const KPI_FOCUS_LABELS: Record<Exclude<KpiBucketKey, "total">, string> = {
  needHelp: "Need Info",
  notApproved: "Not Approved",
  done: "Done",
  pending: "Pending",
  notStarted: "Not Started",
};

function buildColumns(
  avatarById: Record<string, string | null>,
  view: ViewMode,
  /** The status columns to render — all of them, or just the focused card's. */
  statusColumns: StatusCol[],
  /** True while a KPI card is focused: Total then no longer partitions the
   *  visible columns, so it is relabelled rather than left to look wrong. */
  focused: boolean,
): ColumnDef<EmployeeStatusRow>[] {
  return [
    {
      accessorKey: "employeeName",
      header: "Employee",
      // Sortable A–Z / Z–A. `text` is TanStack's case-insensitive string
      // compare, so "aisha" does not sort below "Zane" the way a raw
      // codepoint comparison would.
      enableSorting: true,
      sortingFn: "text",
      // Overrides the numeric default: a name column opens A→Z. Without this
      // the shared `sortDescFirst: true` would make the first click on Employee
      // sort Z→A, which nobody expects from a name.
      sortDescFirst: false,
      cell: (info) => (
        <span className="inline-flex items-center gap-3">
          <Avatar
            name={info.row.original.employeeName}
            avatarUrl={avatarById[info.row.original.employeeId] ?? null}
            size={32}
          />
          <span
            className="text-ink-strong font-bold"
            style={{ fontSize: 16 }}
          >
            {info.row.original.employeeName}
          </span>
        </span>
      ),
    },
    ...statusColumns.map<ColumnDef<EmployeeStatusRow>>((c) => ({
      accessorKey: c.key,
      header: c.label,
      cell: (info) => {
        const n = info.getValue<number>();
        const node = c.tone ? <Pill value={n} tone={c.tone} /> : <PlainCount value={n} />;
        // A preview is attached ONLY where a bucket counts exactly this
        // column. That used to leave eight columns dead on hover, because only
        // done / notApproved / cancelled had a bucket of their own; each status
        // now has one, so the rule holds AND every column is live.
        // `pendingTotal` is still not usable here — it holds every pending
        // task, so hanging it off Follow Up or Initiated would preview a
        // superset of the number being pointed at.
        return c.preview && n > 0 ? withPreview(info.row.original, c.preview, n, view, node) : node;
      },
    })),
    // TOTAL = every task in the filter for this person, and the eleven status
    // columns above partition it exactly — UNLESS a KPI card is focused, in
    // which case only that card's columns are on screen and the header says
    // "All" so nobody reads the visible columns as summing to it.
    {
      accessorKey: "total",
      header: focused ? "All" : "Total",
      cell: (info) =>
        withPreview(info.row.original, "total", info.getValue<number>(), view,
          <span className="text-display-3xs text-ink-strong">
            {info.getValue<number>()}
          </span>),
    },
  ];
}

/**
 * The transposed view: statuses become rows, people become columns.
 *
 * It is a hand-rolled table rather than a second TanStack instance because
 * TanStack's model is column-oriented — transposing it would mean generating a
 * column def per EMPLOYEE on every filter change and re-deriving the row model
 * from a matrix, which is more machinery than the twelve-by-N grid needs.
 *
 * Sorting still works, and means what it should in this orientation: clicking a
 * person's header ranks the STATUSES by that person's counts. Clicking Status
 * sorts the rows back into lifecycle order.
 */
function TransposedTable({
  rows,
  view,
  avatarById,
  statusColumns,
  sortBy,
  onSort,
}: {
  rows: EmployeeStatusRow[];
  view: ViewMode;
  avatarById: Record<string, string | null>;
  /** The status rows to render — all of them, or just the focused card's. */
  statusColumns: StatusCol[];
  /** Employee id whose column is ranking the status rows, or null for schema order. */
  sortBy: { employeeId: string; desc: boolean } | null;
  onSort: (employeeId: string) => void;
}) {
  const statusRows = React.useMemo(() => {
    const base = statusColumns.map((c) => ({
      col: c,
      counts: rows.map((r) => Number(r[c.key] ?? 0)),
      total: rows.reduce((sum, r) => sum + Number(r[c.key] ?? 0), 0),
    }));
    if (!sortBy) return base;
    const idx = rows.findIndex((r) => r.employeeId === sortBy.employeeId);
    if (idx < 0) return base;
    const at = (c: number[]) => c[idx] ?? 0;
    return [...base].sort((a, b) =>
      sortBy.desc ? at(b.counts) - at(a.counts) : at(a.counts) - at(b.counts),
    );
  }, [rows, sortBy, statusColumns]);

  const grand = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth: Math.max(640, 200 + rows.length * 120) }}>
        <thead>
          <tr className="border-b border-hairline">
            <th
              className="sticky left-0 z-10 bg-surface-card px-5 py-4 text-left text-table-head whitespace-nowrap"
              style={{ boxShadow: "inset 0 -1px 0 var(--color-hairline)" }}
            >
              Status
            </th>
            {rows.map((r) => {
              const active = sortBy?.employeeId === r.employeeId;
              return (
                <th
                  key={r.employeeId}
                  aria-sort={active ? (sortBy!.desc ? "descending" : "ascending") : "none"}
                  className="bg-surface-card px-3 py-4 text-right text-table-head whitespace-nowrap"
                  style={{ boxShadow: "inset 0 -1px 0 var(--color-hairline)" }}
                >
                  <button
                    type="button"
                    onClick={() => onSort(r.employeeId)}
                    title={`Sort statuses by ${r.employeeName}`}
                    className={`group/sort inline-flex cursor-pointer items-center gap-1.5 select-none transition-colors hover:text-ink-strong ${
                      active ? "text-ink-strong" : ""
                    }`}
                  >
                    <span className="max-w-[110px] truncate">{r.employeeName}</span>
                    {active ? (
                      sortBy!.desc ? (
                        <ArrowDown size={13} strokeWidth={2.6} />
                      ) : (
                        <ArrowUp size={13} strokeWidth={2.6} />
                      )
                    ) : (
                      <ChevronsUpDown
                        size={13}
                        strokeWidth={2.4}
                        className="text-ink-subtle opacity-45 transition-opacity group-hover/sort:opacity-100"
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {statusRows.map(({ col, counts }) => (
            <tr key={String(col.key)} className="border-b border-hairline last:border-b-0">
              <td className="sticky left-0 z-10 bg-surface-card px-5 py-3 text-left text-body-lg font-bold text-ink-strong whitespace-nowrap">
                {col.label}
              </td>
              {rows.map((r, i) => {
                const n = counts[i] ?? 0;
                const node = col.tone ? <Pill value={n} tone={col.tone} /> : <PlainCount value={n} />;
                return (
                  <td key={r.employeeId} className="px-3 py-3 text-right whitespace-nowrap">
                    {/* Previews survive the transpose — same bucket, same row,
                        just read from the other axis. */}
                    {col.preview && n > 0
                      ? withPreview(r, col.preview, n, view, node)
                      : node}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-hairline-strong">
            <td className="sticky left-0 z-10 bg-surface-card px-5 py-3 text-left text-body-lg font-black text-ink-strong">
              Total
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-3 py-3 text-right">
                {withPreview(r, "total", r.total, view,
                  <span className="text-display-3xs text-ink-strong">{r.total}</span>)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="px-5 py-2 text-[11.5px] font-semibold text-ink-subtle">
        {rows.length} {rows.length === 1 ? "person" : "people"} · {grand} tasks
      </p>
    </div>
  );
}

export function StatusTable({
  rows,
  view,
  avatarById = {},
}: {
  rows: EmployeeStatusRow[];
  view: ViewMode;
  avatarById?: Record<string, string | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);
  // Orientation. Kept OUTSIDE the TanStack instance and outside the transposed
  // table's own sort, so flipping back and forth never discards the other
  // view's sort — and popovers are per-cell, so they are unaffected either way.
  const [isTransposed, setIsTransposed] = React.useState(false);
  const [transposedSort, setTransposedSort] = React.useState<
    { employeeId: string; desc: boolean } | null
  >(null);
  const toggleTransposedSort = React.useCallback((employeeId: string) => {
    setTransposedSort((cur) =>
      cur?.employeeId === employeeId
        ? cur.desc
          ? null // third click clears, back to lifecycle order
          : { employeeId, desc: true }
        : { employeeId, desc: false },
    );
  }, []);
  const [query, setQuery] = React.useState("");
  const [selectedDepts, setSelectedDepts] = React.useState<string[]>([]);
  // Paged 10 people at a time, with the shared top-right pager (was a
  // "Show more" expander that grew the section without bound).
  const PAGE = 10;

  // Whole-row navigation — anyone can click anywhere on the row (or
  // Tab to it and hit Enter/Space) to drill into that person's tasks.
  const hrefFor = React.useCallback(
    (employeeId: string): Route => {
      const viewParam = view === "initiator" ? "&view=initiator" : "";
      return `/tasks?emp=${employeeId}${viewParam}` as Route;
    },
    [view],
  );

  const departments = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => departmentNames(r).forEach((d) => d && set.add(d)));
    return Array.from(set).sort();
  }, [rows]);

  // Two searches narrow this table and they AND together: this widget's own
  // box (below the header) and the FilterBar's section search at the top of
  // the page. Both match on the person's name.
  const sectionQuery = useSectionSearch();

  // [ VIEW ] on a Task Summary card focuses this table on that status subset:
  // its columns narrow to the ones that card counts, and people carrying none
  // of it drop out. [ HIDE ] restores the full grid. Read through a module
  // store, so this widget opts in with one hook and the page stays untouched
  // (lib/client/kpi-focus.ts).
  const kpiFocus = useKpiFocus();
  const focusColumns = kpiFocus && kpiFocus !== "total" ? KPI_FOCUS_COLUMNS[kpiFocus] : null;
  const statusColumns = React.useMemo(
    () =>
      focusColumns
        ? STATUS_COLUMNS.filter((c) => focusColumns.includes(c.key))
        : STATUS_COLUMNS,
    [focusColumns],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // A person now carries every department they belong to, so the chip
      // filter matches if ANY of them is the selected one.
      // ANY-of, not all-of: the picks are alternatives ("Sales or Apps"), and
      // since a person can hold several departments an all-of rule would still
      // be wrong — it would demand membership in every ticked one.
      if (
        selectedDepts.length > 0 &&
        !departmentNames(r).some((d) => selectedDepts.includes(d))
      )
        return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      if (!matchesSearch(sectionQuery, r.employeeName)) return false;
      // Under a KPI focus, a person with none of that status is noise — the
      // question being asked is "who is carrying the sent-back work", and a
      // screen of zeroes does not answer it.
      if (focusColumns && !focusColumns.some((k) => Number(r[k] ?? 0) > 0)) return false;
      return true;
    });
  }, [rows, query, selectedDepts, sectionQuery, focusColumns]);

  const columns = React.useMemo(
    () => buildColumns(avatarById, view, statusColumns, focusColumns !== null),
    [avatarById, view, statusColumns, focusColumns],
  );

  // EVERY column sorts now. `defaultColumn` used to close sorting so only
  // Employee and Critical opted in; that left six count columns carrying no
  // affordance, which reads as "these are not sortable" rather than "these were
  // not enabled yet" — and a status breakdown is exactly the table you want to
  // re-rank by whichever count you are chasing.
  //
  // sortingFn "basic" is the numeric comparator and the right default here:
  // seven of the eight columns are counts. Employee overrides it with "text"
  // in buildColumns, so alphabetical stays alphabetical.
  //
  // sortDescFirst matches the intent per type — a count column opens
  // biggest-first (who has the most Not Approved), a name column opens A→Z.
  // TanStack infers this per column, and the explicit default keeps the count
  // columns predictable regardless of what the first row happens to hold.
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data: filtered,
    columns,
    defaultColumn: { enableSorting: true, sortingFn: "basic", sortDescFirst: true },
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const hasActiveFilter =
    query.trim().length > 0 ||
    selectedDepts.length > 0 ||
    sectionQuery.length > 0 ||
    focusColumns !== null;

  // Page the already-sorted TanStack rows. Keyed off the row model (not
  // `filtered`) so paging follows the table's own sort order.
  const pagedRows = usePagedRows(table.getRowModel().rows, PAGE);

  // Re-sorting reshuffles who lands on which page, so a stale page 3 would
  // show an arbitrary middle slice of the new order. Send the reader back to
  // the top, where the answer to "who's highest/lowest" now lives.
  const setPage = pagedRows.setPage;
  React.useEffect(() => {
    setPage(1);
  }, [sorting, setPage]);

  return (
    <PageShell
      as="section"
      width="full"
      py={false}
      /* No top margin. This sat under the Status Distribution card and needed
         the separation; it now leads the Overview tab, whose `flex flex-col
         gap-6` already spaces the sections. Keeping mt-12 would push the first
         widget down by a gap that has nothing above it. */
      style={{
        opacity: 0,
        // Was a 700ms delay, staggered against its position in one long scroll.
        // Inside a dashboard tab this mounts the moment the tab is clicked.
        animation: "fadeUp 400ms ease-out 100ms forwards",
      }}
    >
      <DashboardSectionHeader
        icon={
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-xl"
            style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-strong)" }}
          >
            <Users size={20} strokeWidth={2.2} />
          </span>
        }
        title={`Status by ${view === "doer" ? "Doer" : "Initiator"}`}
        subtitle={
          hasActiveFilter ? (
            <>
              Showing{" "}
              <span className="font-semibold tabular-nums text-gray-900">
                {filtered.length}
              </span>{" "}
              of {rows.length} {rows.length === 1 ? "person" : "people"}
              {/* Says WHY the grid narrowed. Without it, clicking [ VIEW ] two
                  sections up silently drops most of this table's columns and
                  rows, which reads as a bug rather than as a focus. */}
              {kpiFocus && kpiFocus !== "total" && (
                <>
                  {" · focused on "}
                  <span className="font-semibold text-gray-900">
                    {KPI_FOCUS_LABELS[kpiFocus]}
                  </span>
                </>
              )}
            </>
          ) : (
            "Tasks broken down per person"
          )
        }
        /* Search and Department moved UP here from a strip beneath the header.
           They are filters on this table, and sitting them in the same row as
           the pager means the whole control surface is one line instead of two
           bands with a table sandwiched between them. `items-center gap-3` and
           a shared h-9 keep the input, the dropdown and the pager on one
           baseline. */
        actions={
          <div className="flex items-center gap-3 max-md:flex-wrap">
            <SectionSearchBox query={query} onQuery={setQuery} />
            {departments.length > 0 && (
              <DepartmentSelect
                departments={departments}
                selected={selectedDepts}
                onChange={setSelectedDepts}
              />
            )}
            {hasActiveFilter && (
              <button
                type="button"
                // Also releases the Task Summary focus. "Clear" that left the
                // grid narrowed to one status would be the most confusing
                // button on the page.
                onClick={() => {
                  setQuery("");
                  setSelectedDepts([]);
                  setKpiFocus(null);
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-ink-muted transition-colors hover:text-altus-red"
              >
                <X className="size-3.5" />
                Clear
              </button>
            )}
            <SectionPagination
              page={pagedRows.page}
              pageCount={pagedRows.pageCount}
              onPage={pagedRows.setPage}
              total={pagedRows.total}
              pageSize={PAGE}
              label="Status by doer"
            />
            {/* ⇄ Transpose. Sits with the collapse control because both change
                how the section is SHAPED rather than what it contains. */}
            <button
              type="button"
              onClick={() => setIsTransposed((v) => !v)}
              aria-pressed={isTransposed}
              title={isTransposed ? "Back to people as rows" : "Transpose: statuses as rows"}
              className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold transition-colors ${
                isTransposed ? "text-altus-red" : "text-ink-muted hover:text-ink-strong"
              }`}
            >
              <ArrowLeftRight className="size-3.5" strokeWidth={2.6} />
              Transpose
            </button>
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="Status by doer"
            />
          </div>
        }
      />

      {/* Header (with its controls) stays visible; the table folds. */}
      <CollapsibleBody expanded={open}>

      {filtered.length === 0 ? (
        <div
          className={`${DASHBOARD_CARD} p-10 text-center`}
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-body-lg text-ink-subtle">
            {rows.length === 0
              ? "No data for the current filter."
              : kpiFocus && kpiFocus !== "total"
                ? `Nobody is carrying any ${KPI_FOCUS_LABELS[kpiFocus]} work.`
                : "No employees match your search."}
          </p>
          {hasActiveFilter && rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedDepts([]);
                setKpiFocus(null);
              }}
              className="bg-surface-card mt-3 text-cta text-altus-red hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div
          /* p-6 sits INSIDE the card and OUTSIDE the scroll box, so the
             horizontal scrollbar appears at the padded boundary rather than
             hard against the card edge. */
          className={`${DASHBOARD_CARD} p-6`}
        >
          {isTransposed ? (
            /* Transposed reads the SAME filtered set, but not the paged one:
               people are columns here, and paging columns would hide a person
               mid-comparison rather than shortening a list. */
            <TransposedTable
              rows={filtered}
              view={view}
              avatarById={avatarById}
              statusColumns={statusColumns}
              sortBy={transposedSort}
              onSort={toggleTransposedSort}
            />
          ) : (
          <>
          {/* `overflow-x-auto` IS here now. It was originally left off because an
              overflow ancestor changes what a sticky <thead> sticks to — but
              the <thead> stopped being sticky (see below), so that objection is
              spent, and twelve columns genuinely do not fit a laptop viewport.
              The Employee cell stays frozen with `sticky left-0`, so names
              remain readable while the status columns scroll under them. */}
          {/* The scroll box carries its own hairline + radius, so the table
              reads as a framed object inside the card's p-6 rather than as
              loose rows that happen to slide sideways. */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
          {/* min-w carries the twelve columns: one name column plus eleven
              statuses and Total. Below this the numeric columns collapse into
              each other, so the floor is what forces the scrollbar instead of
              a squeeze. */}
          <table className="w-full min-w-[1180px]">
            {/* NOT vertically sticky — deliberately (Sir, 2026-08-20).
                The header used to be `sticky top-[64px]`, which is what put a
                tall blank band between the card's top edge and the column
                labels: once the table scrolled under the filter bar the <thead>
                detached, pinned itself 64px down the viewport, and left its own
                row-space in the table empty. The band's height was however far
                the table had scrolled past the pin — so it grew as you scrolled,
                and it was always completely blank.

                The offset was also simply wrong: the filter bar above pins at
                `--app-topbar-h` (56px on desktop, see globals.css), not 64px,
                so the labels never lined up with it either. A previous pass
                already moved this number once for the same symptom ("floated
                the header mid-table") — the number was never the problem, the
                sticky was.

                Dropping it costs almost nothing here: PAGE = 10, so the table
                is ten rows tall and the header is on screen for essentially all
                of it. The first cell keeps its own `left-0` freeze for
                horizontal scroll, which is unaffected. */}
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-hairline">
                  {hg.headers.map((h, i) => {
                    const canSort = h.column.getCanSort();
                    const sorted = h.column.getIsSorted(); // false | "asc" | "desc"
                    const headerNode = flexRender(
                      h.column.columnDef.header,
                      h.getContext(),
                    );
                    return (
                      <th
                        key={h.id}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : canSort
                                ? "none"
                                : undefined
                        }
                        className={`px-5 py-4 text-table-head whitespace-nowrap bg-surface-card ${
                          i === 0 ? "text-left" : "text-right"
                        } ${i === 0 ? "sticky left-0 z-10" : ""}`}
                        style={{
                          boxShadow: "inset 0 -1px 0 var(--color-hairline)",
                        }}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            title={`Sort by ${
                              typeof headerNode === "string" ? headerNode : h.column.id
                            }`}
                            className={`group/sort inline-flex cursor-pointer items-center gap-1.5 select-none transition-colors hover:text-ink-strong ${
                              sorted ? "text-ink-strong" : ""
                            }`}
                          >
                            {headerNode}
                            {sorted === "asc" ? (
                              <ArrowUp size={13} strokeWidth={2.6} />
                            ) : sorted === "desc" ? (
                              <ArrowDown size={13} strokeWidth={2.6} />
                            ) : (
                              // Dim ⇅ in the neutral state: the affordance has
                              // to be visible before the hover, or nobody
                              // discovers the column is clickable at all.
                              <ChevronsUpDown
                                size={13}
                                strokeWidth={2.4}
                                className="text-ink-subtle opacity-45 transition-opacity group-hover/sort:opacity-100"
                              />
                            )}
                          </button>
                        ) : (
                          headerNode
                        )}
                      </th>
                    );
                  })}
                  {/* Chevron column header — silent, just claims width */}
                  <th aria-hidden className="bg-surface-card" style={{ width: 36 }} />
                </tr>
              ))}
            </thead>
            <tbody>
              {pagedRows.visible.map((row) => {
                const empId = row.original.employeeId;
                const empName = row.original.employeeName;
                const target = hrefFor(empId);
                return (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${empName}'s tasks`}
                    onClick={() => router.push(target)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(target);
                      }
                    }}
                    className="status-row border-b border-hairline last:border-b-0"
                    style={{ cursor: "pointer" }}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <td
                        key={cell.id}
                        className={`px-5 py-4 text-body-lg whitespace-nowrap ${
                          i === 0
                            ? "text-ink-strong sticky left-0 z-10 bg-surface-card"
                            : "text-right"
                        }`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell ?? ((c) => c.getValue()),
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                    {/* Chevron — telegraphs the row is a link target */}
                    <td
                      className="status-row-chevron px-2"
                      aria-hidden
                      style={{ color: "var(--color-ink-subtle)" }}
                    >
                      <ChevronRight size={18} strokeWidth={2.2} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
          )}

        </div>
      )}
      </CollapsibleBody>
    </PageShell>
  );
}

/** Departments shown inline before the "+N more" reveal. */
const DEPT_VISIBLE = 2;

/**
 * Read a row's departments, tolerating a STALE cached payload.
 *
 * `loadDashboardData` persists its result through `unstable_cache`
 * (revalidate 60, and it survives in .next/cache), so for a window after this
 * field changed from `department: string` to `departments: string[]` the cache
 * can still hand us the old shape. Reading `.departments` blind would throw on
 * `.length` and take the whole dashboard down; this degrades to the legacy
 * single value instead. Same guard the status-distribution card already uses
 * for its `summary` field.
 */
function departmentNames(row: EmployeeStatusRow): string[] {
  if (Array.isArray(row.departments)) return row.departments;
  const legacy = (row as unknown as { department?: string | null }).department;
  return legacy ? [legacy] : [];
}

/**
 * The table's own search box. Extracted from the old FilterBar so it can sit in
 * the section header beside the pager; the debounce behaviour is unchanged.
 *
 * h-9 matches the Department trigger and the pager buttons next to it — the
 * three controls have to agree on height or the header row reads as ragged.
 */
function SectionSearchBox({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (v: string) => void;
}) {
  // Live text is local; the parent (which re-filters the rows and rebuilds the
  // TanStack row model) hears about it on a 300ms debounce. `query` is still
  // the committed value, so it doubles as the external reset signal.
  const [text, setText] = React.useState(query);
  const commit = useDebouncedCallback(onQuery, DEFAULT_DEBOUNCE_MS);
  const lastSent = React.useRef(query);
  React.useEffect(() => {
    if (query !== lastSent.current) {
      lastSent.current = query;
      commit.cancel();
      setText(query);
    }
  }, [query, commit]);

  function type(next: string) {
    setText(next);
    lastSent.current = next;
    commit(next);
  }
  function clearNow() {
    setText("");
    lastSent.current = "";
    commit.flush("");
  }

  return (
    <div
      className="relative flex h-9 w-[220px] shrink-0 items-center rounded-lg border border-hairline bg-surface-card pl-2.5 pr-1.5 transition-shadow focus-within:border-hairline-strong max-md:w-full"
      style={{
        boxShadow: text
          ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 12%, transparent), 0 1px 2px rgba(15,23,42,0.04)"
          : "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <Search className="size-3.5 shrink-0 text-ink-subtle" />
      <input
        type="text"
        value={text}
        onChange={(e) => type(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) clearNow();
        }}
        placeholder="Search employees"
        title="Local search — filters only the list on this page"
        aria-label="Local search — employees — this page only"
        className="min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
      />
      {text && (
        <button
          type="button"
          onClick={clearNow}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Department as a multi-select dropdown, replacing a wrapping strip of pills.
 *
 * The strip grew one chip per department and wrapped onto a second and third
 * line on a real roster, which is what pushed the table down the page. A
 * dropdown is fixed-width whatever the count, and multi-select is the honest
 * shape: a person can hold several departments, so picking two should mean
 * "either", not "swap the one selected".
 *
 * Built on the same MultiSelect + checkbox list every other filter in the app
 * uses, so the interaction is already familiar.
 */
function DepartmentSelect({
  departments,
  selected,
  onChange,
}: {
  departments: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const options = React.useMemo(
    () => departments.map((d) => ({ value: d, label: d })),
    [departments],
  );
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? (selected[0] ?? "")
        : `${selected.length} Selected`;

  return (
    <MultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      renderTrigger={() => (
        <span
          className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-surface-card px-2.5 text-[13px] font-semibold transition-colors ${
            selected.length > 0
              ? "border-altus-red/40 text-altus-red-deep"
              : "border-hairline text-ink-soft hover:border-hairline-strong"
          }`}
        >
          <Users className="size-3.5 shrink-0" />
          <span className="max-w-[130px] truncate">Department ({summary})</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </span>
      )}
    />
  );
}
