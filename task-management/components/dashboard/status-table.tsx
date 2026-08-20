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
} from "lucide-react";
import type { EmployeeStatusRow, StatusCellBucket, ViewMode } from "@/lib/types";
import { StatusCellPopover } from "./status-cell-popover";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { DEFAULT_DEBOUNCE_MS, useDebouncedCallback } from "@/lib/client/use-debounced";
import { SectionPagination, usePagedRows, CollapseToggle, CollapsibleBody } from "./section-chrome";
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

function buildColumns(
  avatarById: Record<string, string | null>,
  view: ViewMode,
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
    // NO Department column. A person can belong to several departments, so
    // this cell rendered a wrapping stack of chips that set the row height for
    // the whole table and pushed the count columns into a horizontal squeeze.
    // Department is now a FILTER in the header, which is what it was actually
    // being used as — nobody reads a department column, they narrow by it.
    {
      accessorKey: "criticalCount",
      header: "Critical",
      // Sortable by volume. `sortDescFirst` because the first question anyone
      // asks of this column is "who has the most critical work" — the first
      // click should answer it (16 → 0), not bury it on the last page.
      enableSorting: true,
      sortingFn: "basic",
      sortDescFirst: true,
      cell: (info) => {
        const n = info.getValue<number>();
        return n > 0 ? (
          withPreview(
            info.row.original,
            "criticalCount",
            n,
            view,
            <span className="inline-flex items-center gap-1.5">
              <CriticalBadge />
              <span className="text-display-3xs tabular-nums">{n}</span>
            </span>,
          )
        ) : (
          <span className="text-ink-subtle text-mono">0</span>
        );
      },
    },
    // Done COUNTS APPROVED TOO. `approved` was tallied by the transform and
    // then never rendered, so those tasks were invisible in every column while
    // still counting toward Total — one of the two reasons the row did not add
    // up. Folding them here matches the Task Summary's DONE card, which already
    // links to `?status=done,approved`.
    {
      id: "done",
      accessorFn: (r) => r.done + r.approved,
      header: "Done",
      cell: (info) =>
        withPreview(info.row.original, "done", info.getValue<number>(), view,
          <Pill value={info.getValue<number>()} tone="green" />),
    },
    {
      accessorKey: "pendingTotal",
      header: "Pending",
      cell: (info) =>
        withPreview(info.row.original, "pendingTotal", info.getValue<number>(), view,
          <Pill value={info.getValue<number>()} tone="amber" />),
    },
    {
      accessorKey: "notApproved",
      header: "Not Approved",
      cell: (info) =>
        withPreview(info.row.original, "notApproved", info.getValue<number>(), view,
          <Pill value={info.getValue<number>()} tone="red" />),
    },
    {
      accessorKey: "cancelled",
      header: "Cancelled",
      cell: (info) =>
        withPreview(info.row.original, "cancelled", info.getValue<number>(), view,
          <Pill value={info.getValue<number>()} tone="rose" />),
    },
    // Transferred was the other invisible bucket. Small, but without it the
    // columns cannot partition Total for anyone who has handed work on.
    {
      accessorKey: "transferred",
      header: "Transferred",
      // Plain count, no hover preview and no Pill: the transform never calls
      // addTo() for transferred, so there are no preview tasks to show, and
      // Pill's tones resolve to --color-<tone> tokens that have no slate
      // member. A fake-empty popover would be worse than none.
      cell: (info) => {
        const n = info.getValue<number>();
        return n === 0 ? (
          <span className="text-ink-subtle text-mono">0</span>
        ) : (
          <span className="text-[15px] font-bold tabular-nums text-ink-soft">{n}</span>
        );
      },
    },
    // TOTAL = every task in the filter for this person. It now equals
    //   Done(+Approved) + Pending + Not Approved + Cancelled + Transferred
    // because those five buckets are a partition of the lifecycle: the
    // transform's exhaustiveness guard makes the compiler prove every status
    // lands in exactly one of them.
    //
    // CRITICAL IS NOT IN THAT SUM and must not be added to it. It counts
    // `priority = imp_urgent`, which cuts ACROSS the lifecycle — an urgent task
    // is also Done or Pending — so adding it would double-count the same rows.
    {
      accessorKey: "total",
      header: "Total",
      cell: (info) =>
        withPreview(info.row.original, "total", info.getValue<number>(), view,
          <span className="text-display-3xs text-ink-strong">
            {info.getValue<number>()}
          </span>),
    },
  ];
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
      return true;
    });
  }, [rows, query, selectedDepts, sectionQuery]);

  const columns = React.useMemo(() => buildColumns(avatarById, view), [avatarById, view]);

  // Sorting was already wired to a row model but never given state, so it
  // could not actually change. Only Employee and Critical opt in (see
  // buildColumns) — `defaultColumn` closes the rest so the count columns do
  // not sprout affordances nobody asked for.
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data: filtered,
    columns,
    defaultColumn: { enableSorting: false },
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const hasActiveFilter =
    query.trim().length > 0 || selectedDepts.length > 0 || sectionQuery.length > 0;

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
      className="mt-12"
      style={{
        opacity: 0,
        // Was a 700ms delay, staggered against its position in one long scroll.
        // Inside a dashboard tab this mounts the moment the tab is clicked.
        animation: "fadeUp 400ms ease-out 100ms forwards",
      }}
    >
      <DashboardSectionHeader
        eyebrow="People · Status Breakdown"
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
                onClick={() => {
                  setQuery("");
                  setSelectedDepts([]);
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
          className="bg-surface-card rounded-section border border-hairline p-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-body-lg text-ink-subtle">
            {rows.length === 0
              ? "No data for the current filter."
              : "No employees match your search."}
          </p>
          {hasActiveFilter && rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedDepts([]);
              }}
              className="bg-surface-card mt-3 text-cta text-altus-red hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div
          className="bg-surface-card rounded-section border border-hairline"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          {/* NOTE: no `overflow-x-auto` here. It was originally left off because
              an overflow ancestor changes what a sticky <thead> sticks TO; the
              <thead> is no longer sticky (see below), so that reason is spent —
              but the table still has `min-w-[640px]`, so adding an overflow
              container now would be a real layout change, not a tidy-up. Left
              as-is deliberately. */}
          {/* min-w drops 720 -> 640 with the Department column. `w-full` already
              spreads the remaining eight across the container; the floor only
              exists to stop the count columns collapsing, and leaving it at the
              nine-column figure would force a horizontal squeeze that no longer
              has a reason to exist. */}
          <table className="w-full min-w-[640px]">
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
                          i <= 1 ? "text-left" : "text-right"
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
                            : i === 1
                              ? "text-ink-muted"
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
