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
  type Table as TableInstance,
} from "@tanstack/react-table";
import { format } from "date-fns";

// Initial rows rendered; "Load more" reveals this many additional rows each
// tap. Keeps the page light — a few hundred tasks no longer paint at once.
const PAGE_STEP = 10;

// date-fns `format()` throws RangeError on a null/invalid Date — which would
// crash the ENTIRE table render. Guard every cell so one bad row degrades to
// "—" instead of taking down the whole list.
function safeFormat(value: unknown, pattern: string): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
}
import * as Tooltip from "@radix-ui/react-tooltip";
import { SlidersHorizontal, Check, ChevronDown } from "lucide-react";
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
      accessorKey: "subject",
      header: "Subject",
      meta: { mobileHide: true, narrow: true },
      cell: (info) => (
        <span className="text-body-lg text-ink-muted">
          {info.getValue<string>() ?? "—"}
        </span>
      ),
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

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Progressive reveal: render PAGE_STEP rows, "Load more" grows the page.
    // Sorting/visibility still apply across the full set before the slice.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_STEP } },
    autoResetPageIndex: false,
  });

  // Reset back to the first 10 whenever the underlying rows change (new
  // filter / refresh) so a deep "load more" doesn't persist onto a fresh,
  // shorter result set.
  React.useEffect(() => {
    table.setPageSize(PAGE_STEP);
  }, [rows, table]);

  const shown = table.getRowModel().rows.length;
  const totalFiltered = table.getPrePaginationRowModel().rows.length;
  const remaining = totalFiltered - shown;

  function alignClass(c: TaskCol): string {
    const a = c.meta?.align;
    return a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ColumnsMenu table={table} />
      </div>
      <div
        className="bg-surface-card rounded-section border border-hairline overflow-x-auto"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
      <table className="min-w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-hairline">
              {hg.headers.map((h) => {
                const col = h.column.columnDef as TaskCol;
                const hide = col.meta?.mobileHide;
                const isActions = h.column.id === "actions";
                return (
                  <th
                    key={h.id}
                    className={`px-5 py-4 text-table-head whitespace-nowrap max-md:px-3 max-md:py-3 ${alignClass(col)} ${hide ? "max-md:hidden" : ""} ${isActions ? "sticky right-0 z-20 bg-surface-card" : ""}`}
                    style={isActions ? { boxShadow: "-10px 0 14px -10px rgba(15,23,42,0.14)" } : undefined}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
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
          ))}
        </tbody>
      </table>
      </div>

      {/* Progressive reveal footer — keeps the initial page light. Shows the
          running count and a "Load more" that grows the visible set by 10. */}
      <div className="mt-4 flex flex-col items-center gap-2.5">
        <p className="text-[13px] font-semibold text-ink-subtle tabular-nums">
          Showing {shown} of {totalFiltered}
        </p>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() =>
              table.setPageSize(
                table.getState().pagination.pageSize + PAGE_STEP,
              )
            }
            className="inline-flex items-center gap-2 px-5 h-10 rounded-pill text-[14px] font-bold border border-hairline-strong bg-surface-card text-ink-strong hover:border-altus-red hover:text-altus-red transition-all"
          >
            <ChevronDown size={15} strokeWidth={2.4} />
            Load {Math.min(PAGE_STEP, remaining)} more
            <span className="text-ink-subtle font-semibold">
              ({remaining} left)
            </span>
          </button>
        )}
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
