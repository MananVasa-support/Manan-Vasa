"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
  type SortingState,
  type Updater,
  type Table as TableInstance,
} from "@tanstack/react-table";
import { format } from "date-fns";

// Classic numbered pagination: 25 rows per page with Prev / 1 2 3 … N / Next.
const PAGE_SIZE = 25;

// Build the windowed list of page numbers to render: always first + last, the
// current page with one neighbour on each side, and "ellipsis" gaps between.
// e.g. total 34 on page 17 → [1, …, 16, 17, 18, …, 34]. Short lists (≤7) show
// every page with no ellipsis.
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("ellipsis");
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

// date-fns `format()` throws RangeError on a null/invalid Date — which would
// crash the ENTIRE table render. Guard every cell so one bad row degrades to
// "—" instead of taking down the whole list.
function safeFormat(value: unknown, pattern: string): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
}
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  SlidersHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";

// Group-by options for the Tasks table. "none" = flat list (default).
type GroupKey = "none" | "client" | "subject";
const GROUP_OPTIONS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "client", label: "Client" },
  { key: "subject", label: "Subject" },
];

// The section label a row falls under for the current grouping. NULL/empty
// values collapse into a single explicit "—" bucket rather than vanishing.
function groupValue(row: TaskListRow, by: Exclude<GroupKey, "none">): string {
  const raw = by === "client" ? row.client : row.subject;
  const v = raw?.trim();
  return v && v.length > 0 ? v : by === "client" ? "— No client" : "— No subject";
}
import { CriticalBadge } from "@/components/ui/critical-badge";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import type { TaskListRow } from "@/lib/types";
import { TaskRowActions } from "./task-row-actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { InlineStatusCell } from "./inline-status-cell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";

// Friendly labels for the column show/hide menu (#11).
const COLUMN_LABELS: Record<string, string> = {
  client: "Client",
  doerName: "Doer",
  priority: "Priority",
  status: "Status",
  subject: "Subject",
  createdAt: "Created",
  dueAt: "Due",
  ageDays: "Age",
};

const COLUMN_VIS_STORAGE_KEY = "altus.tasks.columnVisibility.v1";

type StatusLabels = Record<TaskStatus, string>;
type StatusTones = Record<TaskStatus, StatusColorToken>;

// Per-column display hints. `mobileHide` collapses low-priority columns at
// ≤768px; `align` centers the date/age columns; `narrow` caps the Subject
// width so it stays compact.
type TaskCol = ColumnDef<TaskListRow> & {
  meta?: { mobileHide?: boolean; align?: "center" | "right"; narrow?: boolean };
};

function buildColumns(
  employees: { id: string; name: string }[],
  me: { id: string; isAdmin: boolean },
  statusLabels: StatusLabels,
  statusTones: StatusTones,
): TaskCol[] {
  return [
    {
      accessorKey: "client",
      header: "Client",
      meta: { narrow: true },
      // Sort nulls last and case-insensitively so "altus" and "Altus" cluster.
      sortingFn: (a, b) =>
        (a.original.client ?? "￿").localeCompare(b.original.client ?? "￿", undefined, {
          sensitivity: "base",
        }),
      cell: (info) => {
        const v = info.getValue<string | null>();
        return v ? (
          <span className="text-ink-strong font-semibold" style={{ fontSize: 15 }}>
            {v}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        );
      },
    },
    {
      accessorKey: "subject",
      header: "Subject",
      meta: { narrow: true },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted">
          {info.getValue<string>() ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "title",
      header: "Task",
      cell: ({ row }) => <TaskTitleCell row={row.original} />,
    },
    {
      accessorKey: "doerName",
      header: "Doer",
      cell: (info) => {
        const name = info.getValue<string>();
        if (!name) return <span className="text-ink-subtle">—</span>;
        return (
          <span className="inline-flex items-center gap-2.5">
            <EmployeeAvatar name={name} size="sm" />
            <span
              className="text-ink-strong font-bold"
              style={{ fontSize: 15 }}
            >
              {name}
            </span>
          </span>
        );
      },
    },
    {
      accessorKey: "priority",
      header: "Priority",
      meta: { mobileHide: true },
      cell: (info) => {
        const p = info.getValue<keyof typeof PRIORITY_LABELS>();
        return p === "imp_urgent" ? (
          <CriticalBadge />
        ) : (
          <span className="text-body-lg text-ink-muted">{PRIORITY_LABELS[p]}</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => {
        const row = info.row.original;
        return (
          <InlineStatusCell
            taskId={row.id}
            status={row.status}
            updatedAt={row.updatedAt}
            labels={statusLabels}
            tones={statusTones}
            isAdmin={me.isAdmin}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      meta: { mobileHide: true, align: "center" },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted tabular-nums">
          {safeFormat(info.getValue<Date>(), "MMM d")}
        </span>
      ),
    },
    {
      accessorKey: "dueAt",
      header: "Due",
      meta: { align: "center" },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted tabular-nums">
          {safeFormat(info.getValue<Date>(), "MMM d")}
        </span>
      ),
    },
    {
      accessorKey: "ageDays",
      header: "Age",
      meta: { mobileHide: true, align: "center" },
      cell: (info) => (
        <span className="text-body-lg text-ink tabular-nums">
          {info.getValue<number>()}d
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <TaskRowActions row={row.original} employees={employees} me={me} />,
      enableSorting: false,
    },
  ];
}

export function TaskTable({
  rows,
  employees,
  me,
  statusLabels,
  statusTones,
}: {
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: StatusLabels;
  statusTones?: StatusTones;
}) {
  const resolvedLabels = statusLabels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = statusTones ?? STATUS_TONES_FALLBACK;
  const columns = React.useMemo(
    () => buildColumns(employees, me, resolvedLabels, resolvedTones),
    [employees, me, resolvedLabels, resolvedTones],
  );

  // #11 — per-user column visibility, persisted in localStorage. Start
  // empty (all visible) on both server + first client render to avoid a
  // hydration mismatch, then hydrate the saved choice after mount.
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_VIS_STORAGE_KEY);
      if (raw) setColumnVisibility(JSON.parse(raw) as VisibilityState);
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_VIS_STORAGE_KEY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [columnVisibility]);

  // Click-to-sort state (the user's chosen column) + group-by selection.
  // When grouped, the group column becomes the PRIMARY sort key so rows
  // cluster, and the user's sort applies within each group — see
  // `effectiveSorting`. We strip the group key out of `sorting` so toggling
  // grouping off restores exactly the user's manual sort.
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [groupBy, setGroupBy] = React.useState<GroupKey>("none");

  const groupColId = groupBy === "client" ? "client" : groupBy === "subject" ? "subject" : null;

  const effectiveSorting = React.useMemo<SortingState>(() => {
    if (!groupColId) return sorting;
    return [{ id: groupColId, desc: false }, ...sorting.filter((s) => s.id !== groupColId)];
  }, [groupColId, sorting]);

  function handleSortingChange(updater: Updater<SortingState>) {
    const next = typeof updater === "function" ? updater(effectiveSorting) : updater;
    // Persist only the user's part; the group key is re-applied each render.
    setSorting(groupColId ? next.filter((s) => s.id !== groupColId) : next);
  }

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility, sorting: effectiveSorting },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Fixed PAGE_SIZE pages; sorting/visibility apply across the full set
    // before the page slice. Page index is driven by the numbered pager below.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
    autoResetPageIndex: false,
  });

  // Total rows per group across the full (unpaginated) set, for the count
  // shown in each group header. Keyed by the same label `groupValue` renders.
  const groupCounts = React.useMemo(() => {
    if (groupBy === "none") return null;
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = groupValue(r, groupBy);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [groupBy, rows]);

  // Jump back to the first page whenever the grouping changes, so you start at
  // the top of the newly-ordered list rather than a now-meaningless page.
  React.useEffect(() => {
    table.setPageIndex(0);
  }, [groupBy, table]);

  // Keep the current page valid when the underlying rows change (new filter /
  // refresh). Clamp to the last page rather than always snapping to page 1, so
  // an inline status edit doesn't yank you back to the top — you only move if
  // your page no longer exists (e.g. a filter shrank the result set).
  React.useEffect(() => {
    const maxIndex = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    if (table.getState().pagination.pageIndex > maxIndex) {
      table.setPageIndex(maxIndex);
    }
  }, [rows, table]);

  // Scroll the table back into view when the page changes, so the new rows are
  // visible without a manual scroll up.
  const listTopRef = React.useRef<HTMLDivElement>(null);
  function goToPage(index: number) {
    table.setPageIndex(index);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalFiltered = table.getPrePaginationRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const rangeStart = totalFiltered === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalFiltered, (pageIndex + 1) * PAGE_SIZE);
  const pages = pageWindow(pageIndex + 1, pageCount);

  function alignClass(c: TaskCol): string {
    const a = c.meta?.align;
    return a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
  }

  return (
    <div ref={listTopRef} className="scroll-mt-6">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <MobileSortControl table={table} className="hidden max-md:flex" />
        <GroupByControl value={groupBy} onChange={setGroupBy} />
        <ColumnsMenu table={table} />
      </div>
      <div
        className="bg-surface-card rounded-section border border-hairline overflow-x-auto max-md:hidden"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
      <table className="min-w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-hairline-strong">
              {hg.headers.map((h) => {
                const col = h.column.columnDef as TaskCol;
                const hide = col.meta?.mobileHide;
                const isActions = h.column.id === "actions";
                const canSort = h.column.getCanSort();
                const sorted = h.column.getIsSorted(); // false | "asc" | "desc"
                const headerNode = flexRender(h.column.columnDef.header, h.getContext());
                return (
                  <th
                    key={h.id}
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : undefined
                    }
                    className={`px-5 py-4 text-table-head whitespace-nowrap max-md:px-3 max-md:py-3 ${alignClass(col)} ${hide ? "max-md:hidden" : ""} ${isActions ? "sticky right-0 z-20" : ""}`}
                    style={{
                      // Highlighted header bar — a tinted strip with darker
                      // label text that sets the column row apart from the
                      // white body rows below.
                      background: "var(--color-surface-track)",
                      color: "var(--color-ink-soft)",
                      ...(isActions
                        ? { boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" }
                        : {}),
                    }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={`group/sort inline-flex items-center gap-1.5 select-none transition-colors hover:text-ink-strong ${
                          col.meta?.align === "center" ? "mx-auto" : ""
                        } ${sorted ? "text-ink-strong" : ""}`}
                        title={`Sort by ${typeof headerNode === "string" ? headerNode : h.column.id}`}
                      >
                        {headerNode}
                        {sorted === "asc" ? (
                          <ArrowUp size={13} strokeWidth={2.6} />
                        ) : sorted === "desc" ? (
                          <ArrowDown size={13} strokeWidth={2.6} />
                        ) : (
                          // Always show a dim ⇅ so every column reads as
                          // clickable-to-sort; it brightens on hover. (Was
                          // opacity-0, which hid the affordance entirely.)
                          <ChevronsUpDown
                            size={13}
                            strokeWidth={2.4}
                            className="opacity-45 text-ink-subtle transition-opacity group-hover/sort:opacity-100"
                          />
                        )}
                      </button>
                    ) : (
                      headerNode
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i, arr) => {
          // Group mode: render a section header whenever the group label
          // changes from the previous row — and always at the top of a page
          // (i === 0) so you can see which group you're in mid-scroll.
          const label = groupBy === "none" ? null : groupValue(row.original, groupBy);
          const prev = i > 0 ? arr[i - 1] : undefined;
          const prevLabel =
            groupBy === "none" || !prev ? null : groupValue(prev.original, groupBy);
          const showHeader = label !== null && (i === 0 || label !== prevLabel);
          const visibleCols = table.getVisibleLeafColumns().length;
          return (
            <React.Fragment key={row.id}>
              {showHeader && (
                <tr className="bg-surface-subtle/60">
                  <td
                    colSpan={visibleCols}
                    className="px-5 py-2.5 max-md:px-3 border-b border-hairline"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="font-black tracking-[-0.01em] text-ink-strong"
                        style={{
                          fontFamily: "var(--font-display), system-ui, sans-serif",
                          fontSize: 16,
                        }}
                      >
                        {label}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-altus-red/10 text-altus-red font-bold tabular-nums text-[12px]">
                        {groupCounts?.get(label!) ?? 0}
                      </span>
                    </span>
                  </td>
                </tr>
              )}
            <tr
              className="task-row border-b border-hairline last:border-b-0 transition-colors"
            >
              {row.getVisibleCells().map((cell) => {
                const col = cell.column.columnDef as TaskCol;
                const hide = col.meta?.mobileHide;
                const isActions = cell.column.id === "actions";
                // max-w + ellipsis caps long values (title, names) so they
                // don't push the actions kebab off-screen. Subject is capped
                // tighter (narrow). Centered columns get text-center. The
                // actions cell pins to the right edge (#6) so the ⋯ menu is
                // always reachable during horizontal scroll.
                const maxW = isActions
                  ? ""
                  : col.meta?.narrow
                    ? "max-w-[16ch]"
                    : "max-w-[32ch] max-md:max-w-[20ch]";
                return (
                  <td
                    key={cell.id}
                    className={`px-5 py-4 whitespace-nowrap overflow-hidden text-ellipsis max-md:px-3 max-md:py-3 ${maxW} ${alignClass(col)} ${hide ? "max-md:hidden" : ""} ${isActions ? "sticky right-0 z-10 bg-surface-card" : ""}`}
                    style={isActions ? { boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" } : undefined}
                  >
                    {flexRender(
                      cell.column.columnDef.cell ?? ((c) => c.getValue()),
                      cell.getContext(),
                    )}
                  </td>
                );
              })}
            </tr>
            </React.Fragment>
          );
          })}
        </tbody>
      </table>
      </div>

      {/* Phone card layout (< sm). Same rows as the table above so sort,
          group-by, and pagination apply identically. Shows every desktop
          field — parity. */}
      <div className="hidden max-md:flex max-md:flex-col max-md:gap-3">
        {table.getRowModel().rows.map((row, i, arr) => {
          const t = row.original;
          const label = groupBy === "none" ? null : groupValue(t, groupBy);
          const prevRow = i > 0 ? arr[i - 1] : undefined;
          const prevLabel =
            groupBy === "none" || !prevRow
              ? null
              : groupValue(prevRow.original, groupBy);
          const showHeader = label !== null && (i === 0 || label !== prevLabel);
          return (
            <React.Fragment key={row.id}>
              {showHeader && (
                <div className="flex items-center gap-2 pt-2">
                  <span
                    className="font-black tracking-[-0.01em] text-ink-strong"
                    style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 16 }}
                  >
                    {label}
                  </span>
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-altus-red/10 text-altus-red font-bold tabular-nums text-[12px]">
                    {groupCounts?.get(label!) ?? 0}
                  </span>
                </div>
              )}
              <TaskCard
                row={t}
                employees={employees}
                me={me}
                statusLabels={resolvedLabels}
                statusTones={resolvedTones}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Numbered pagination — 25 rows per page: Prev · 1 2 3 … N · Next,
          with the current page highlighted and a "Page X of Y" readout. */}
      <div className="mt-5 flex flex-col items-center gap-3">
        {pageCount > 1 && (
          <nav
            className="flex items-center gap-1.5 flex-wrap justify-center"
            aria-label="Task list pages"
          >
            <PagerNavButton
              onClick={() => goToPage(pageIndex - 1)}
              disabled={!table.getCanPreviousPage()}
              ariaLabel="Previous page"
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
              <span className="max-sm:hidden">Prev</span>
            </PagerNavButton>

            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <span
                  key={`ellipsis-${i}`}
                  className="px-1.5 text-ink-subtle font-bold select-none"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p - 1)}
                  aria-current={p - 1 === pageIndex ? "page" : undefined}
                  className={`inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-xl text-[14px] font-bold tabular-nums border transition-all ${
                    p - 1 === pageIndex
                      ? "bg-altus-red text-white border-altus-red"
                      : "bg-surface-card text-ink-strong border-hairline hover:border-altus-red hover:text-altus-red"
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <PagerNavButton
              onClick={() => goToPage(pageIndex + 1)}
              disabled={!table.getCanNextPage()}
              ariaLabel="Next page"
            >
              <span className="max-sm:hidden">Next</span>
              <ChevronRight size={16} strokeWidth={2.4} />
            </PagerNavButton>
          </nav>
        )}
        <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          {totalFiltered === 0
            ? "No tasks"
            : pageCount > 1
              ? `Page ${pageIndex + 1} of ${pageCount} · showing ${rangeStart}–${rangeEnd} of ${totalFiltered}`
              : `Showing all ${totalFiltered} ${totalFiltered === 1 ? "task" : "tasks"}`}
        </p>
      </div>
    </div>
  );
}

// Prev / Next control — a pill button that dims + blocks clicks at the ends of
// the range. Shares the table's red-on-hover language.
function PagerNavButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-strong transition-all enabled:hover:border-altus-red enabled:hover:text-altus-red disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

// "Group by" segmented control — None · Client · Subject. Grouping clusters
// the rows under that field and shows a count per section; the 25/page paging
// still applies across the grouped order.
function GroupByControl({
  value,
  onChange,
}: {
  value: GroupKey;
  onChange: (v: GroupKey) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[13px] font-bold text-ink-soft">Group by</span>
      <div className="inline-flex items-center rounded-pill border border-hairline bg-surface-card p-0.5">
        {GROUP_OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              aria-pressed={active}
              className={`px-3.5 h-8 rounded-pill text-[13px] font-bold transition-all ${
                active
                  ? "bg-altus-red text-white"
                  : "text-ink-soft hover:text-ink-strong"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// #12 — task title with a hover-to-preview popover. After ~1s of hovering
// the title, a card shows the full title + description (the cell truncates
// at 32ch). Uses Radix Tooltip (portals out of the table's overflow,
// positions + delays for free). Shown whenever there's a description OR the
// title is long enough to be truncated — so hovering always reveals more
// than the few visible words. A truly short, description-less title (nothing
// extra to show) skips the popover.
function TaskTitleCell({ row }: { row: TaskListRow }) {
  const link = (
    <Link
      href={`/tasks/${row.id}` as Route}
      className="task-title-link text-body text-ink-strong underline-offset-2 transition-colors"
      style={{ fontWeight: 700 }}
    >
      {row.title}
    </Link>
  );
  const desc = row.description?.trim();
  const subject = row.subject?.trim();
  // The title cell caps at ~32ch (max-md ~20ch); anything longer is clipped,
  // so a long title alone is worth expanding even without a description.
  const titleTruncated = row.title.trim().length > 30;
  const hasMore = Boolean(desc) || titleTruncated;
  if (!hasMore) return link;
  return (
    <Tooltip.Provider delayDuration={1000}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="z-[70]"
            style={{
              maxWidth: 440,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 14,
              boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
              padding: 16,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1.3,
                color: "var(--color-ink-strong)",
                marginBottom: desc ? 8 : 0,
              }}
            >
              {row.title}
            </div>
            {desc ? (
              <p
                className="whitespace-pre-wrap"
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--color-ink-soft)",
                }}
              >
                {desc}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--color-ink-subtle)" }}>
                {subject ? `Subject — ${subject}` : "No description added yet."}
              </p>
            )}
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// Phone-only sort dropdown — appears below sm breakpoint where the clickable
// column headers are hidden. Iterates all sortable columns and lets the user
// toggle asc/desc for each.
function MobileSortControl({
  table,
  className = "",
}: {
  table: TableInstance<TaskListRow>;
  className?: string;
}) {
  const sortable = table.getAllLeafColumns().filter((c) => c.getCanSort());
  const labelFor = (id: string) =>
    id === "title" ? "Task" : COLUMN_LABELS[id] ?? id;
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft"
          >
            <ChevronsUpDown size={14} strokeWidth={2.2} />
            Sort
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {sortable.map((c) => {
            const sorted = c.getIsSorted();
            return (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  c.toggleSorting(sorted === "asc");
                }}
              >
                <span className="inline-flex w-4 justify-center">
                  {sorted === "asc" ? (
                    <ArrowUp size={14} strokeWidth={2.6} />
                  ) : sorted === "desc" ? (
                    <ArrowDown size={14} strokeWidth={2.6} />
                  ) : null}
                </span>
                {labelFor(c.id)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// #11 — column show/hide menu. Lists the optional columns (everything
// except the always-on Task + Actions) with a check for visible ones.
// `onSelect → preventDefault` keeps the menu open for multiple toggles.
function ColumnsMenu({ table }: { table: TableInstance<TaskListRow> }) {
  const cols = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id in COLUMN_LABELS);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong transition-all"
        >
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          Columns
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {cols.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={(e) => {
              e.preventDefault();
              c.toggleVisibility();
            }}
          >
            <span className="inline-flex w-4 justify-center">
              {c.getIsVisible() ? <Check size={14} strokeWidth={2.6} /> : null}
            </span>
            {COLUMN_LABELS[c.id]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Full-parity task card for phones (< sm). Every field shown in the desktop
// table is present here so the two views stay in sync.
function TaskCard({
  row,
  employees,
  me,
  statusLabels,
  statusTones,
}: {
  row: TaskListRow;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels: StatusLabels;
  statusTones: StatusTones;
}) {
  const p = row.priority as keyof typeof PRIORITY_LABELS;
  return (
    <div
      className="bg-surface-card rounded-section border border-hairline p-4"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink-strong font-semibold" style={{ fontSize: 15 }}>
          {row.client?.trim() ? row.client : "— No client"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <InlineStatusCell
            taskId={row.id}
            status={row.status}
            updatedAt={row.updatedAt}
            labels={statusLabels}
            tones={statusTones}
            isAdmin={me.isAdmin}
          />
          <TaskRowActions row={row} employees={employees} me={me} />
        </div>
      </div>

      <Link
        href={`/tasks/${row.id}` as Route}
        className="task-title-link mt-2 block text-body text-ink-strong"
        style={{ fontWeight: 700, lineHeight: 1.3 }}
      >
        {row.title}
      </Link>

      <div className="mt-3 flex items-center gap-2">
        {row.doerName ? (
          <>
            <EmployeeAvatar name={row.doerName} size="sm" />
            <span className="text-ink-strong font-bold" style={{ fontSize: 14 }}>
              {row.doerName}
            </span>
          </>
        ) : (
          <span className="text-ink-subtle">Unassigned</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted" style={{ fontSize: 13 }}>
        <span>{row.subject?.trim() ? row.subject : "—"}</span>
        <span aria-hidden>·</span>
        {p === "imp_urgent" ? <CriticalBadge /> : <span>{PRIORITY_LABELS[p]}</span>}
        <span aria-hidden>·</span>
        <span className="tabular-nums">Due {safeFormat(row.dueAt, "MMM d")}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">Created {safeFormat(row.createdAt, "MMM d")}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{row.ageDays}d old</span>
      </div>
    </div>
  );
}
