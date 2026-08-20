"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowRight, Inbox } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate } from "@/lib/format";
import type { StatusCellBucket, StatusCellTask, ViewMode } from "@/lib/types";

/** 200ms before opening — long enough that dragging the pointer across a row
 *  of six cells (or scrolling past them) doesn't flash a popover per cell. */
const OPEN_DELAY_MS = 200;

/** Column label + the /tasks filter that reproduces it. */
const BUCKET_META: Record<
  StatusCellBucket,
  { label: string; params: (v: ViewMode) => URLSearchParams }
> = {
  criticalCount: {
    label: "Critical",
    params: () => new URLSearchParams({ prio: "imp_urgent" }),
  },
  done: { label: "Done", params: () => new URLSearchParams({ status: "done" }) },
  pendingTotal: {
    label: "Pending",
    // The exact set computeEmployeeStatusTable counts as pending. `dont_know`
    // and `on_hold` are deliberately absent — they fall through that switch
    // into no bucket, so including them here would make the link show MORE
    // tasks than the badge counted.
    params: () =>
      new URLSearchParams({
        status: "not_started,initiated,follow_up,follow_up_1,follow_up_2,follow_up_3,need_info",
      }),
  },
  notApproved: {
    label: "Not Approved",
    params: () => new URLSearchParams({ status: "not_approved" }),
  },
  cancelled: {
    label: "Cancelled",
    params: () => new URLSearchParams({ status: "cancelled" }),
  },
  total: { label: "Total", params: () => new URLSearchParams() },
};

/**
 * Hover preview for a count badge in the Status-by-Doer table.
 *
 * The task list is NOT fetched here. It arrives with the row, built in the same
 * pass as the count (see computeEmployeeStatusTable), so the preview can never
 * disagree with the number it hangs off — and hovering costs no round-trip.
 *
 * Zero-count cells render the badge bare: there is nothing to preview, and a
 * popover saying "no tasks" is just a thing to dismiss.
 */
export function StatusCellPopover({
  children,
  employeeName,
  employeeId,
  bucket,
  count,
  tasks,
  view,
}: {
  children: React.ReactNode;
  employeeName: string;
  employeeId: string;
  bucket: StatusCellBucket;
  count: number;
  tasks: StatusCellTask[] | undefined;
  view: ViewMode;
}) {
  if (count <= 0 || !tasks || tasks.length === 0) return <>{children}</>;

  const meta = BUCKET_META[bucket];
  const params = meta.params(view);
  // Scope to the person the row is about — by DOER or INITIATOR, matching the
  // dimension the table was aggregated on, or the link would open a list that
  // counts differently.
  params.set(view === "doer" ? "emp" : "initiator", employeeId);
  const href = `/tasks?${params.toString()}` as Route;

  return (
    <Tooltip.Provider delayDuration={OPEN_DELAY_MS} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex cursor-default">{children}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 rounded-lg border shadow-lg"
            style={{
              width: 340,
              maxWidth: "calc(100vw - 32px)",
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline-strong)",
            }}
          >
            <div className="px-3.5 pt-3 pb-2">
              <p className="text-[12.5px] font-black leading-tight text-ink-strong">
                {employeeName}
                <span className="mx-1.5 text-ink-subtle">•</span>
                {meta.label} Tasks
                <span className="ml-1 tabular-nums text-ink-soft">({count})</span>
              </p>
            </div>

            <ul className="flex flex-col border-t" style={{ borderColor: "var(--color-hairline)" }}>
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 px-3.5 py-2 border-b last:border-b-0"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  <span className="mt-px shrink-0 tabular-nums text-[10.5px] font-black text-ink-subtle">
                    {t.taskNo != null ? `#${t.taskNo}` : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Description, not `title` — see StatusCellTask: `title`
                        is the client name, which is already shown as the chip
                        directly below this line. */}
                    <span
                      className="block truncate text-[12px] font-bold leading-snug text-ink-strong"
                      title={t.description?.trim() || t.title}
                    >
                      {t.description?.trim() || t.subject?.trim() || t.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {(t.client || t.subject) && (
                        <span
                          className="truncate rounded-chip px-1.5 py-px text-[10px] font-bold"
                          style={{
                            maxWidth: 150,
                            background:
                              "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                            color: "var(--color-altus-red-deep)",
                          }}
                        >
                          {t.client ?? t.subject}
                        </span>
                      )}
                      <DueChip dueAt={t.dueAt} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t px-3.5 py-2" style={{ borderColor: "var(--color-hairline)" }}>
              <Link
                href={href}
                className="group inline-flex items-center gap-1.5 text-[11.5px] font-black text-altus-red transition-colors hover:text-altus-red-deep"
              >
                View all {count} task{count === 1 ? "" : "s"}
                <ArrowRight
                  size={12}
                  strokeWidth={2.8}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              {count > tasks.length && (
                <span className="ml-2 text-[10.5px] font-semibold text-ink-subtle">
                  showing {tasks.length} most urgent
                </span>
              )}
            </div>
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** Due date, coloured by how late it is. */
function DueChip({ dueAt }: { dueAt: Date | null }) {
  if (!dueAt) return <span className="text-[10px] font-semibold text-ink-subtle">No due date</span>;
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt as unknown as string);
  if (Number.isNaN(d.getTime()))
    return <span className="text-[10px] font-semibold text-ink-subtle">—</span>;

  const days = differenceInCalendarDays(d, new Date());
  const overdue = days < 0;
  const today = days === 0;
  return (
    <span
      className="shrink-0 whitespace-nowrap text-[10px] font-bold tabular-nums"
      style={{
        color: overdue
          ? "var(--color-red-deep)"
          : today
            ? "var(--color-orange-deep)"
            : "var(--color-ink-subtle)",
      }}
    >
      {overdue
        ? `${Math.abs(days)}d overdue`
        : today
          ? "Due today"
          : formatDate(d)}
    </span>
  );
}

/** Exported for the empty case so callers don't need their own import. */
export const StatusCellEmptyIcon = Inbox;
