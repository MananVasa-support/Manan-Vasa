"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import {
  USER_TASK_STATUSES,
  TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import type { BoardTask } from "@/lib/queries/tasks";

interface Props {
  tasks: BoardTask[];
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
}

/**
 * Status Kanban (Manan #25). One column per status; drag a card to another
 * column to change its status. HTML5 drag-and-drop (no extra deps). The
 * server action validates the transition + optimistic lock; on success we
 * refresh, on failure we revert and toast.
 *
 * Admins get every status as a column; everyone else gets USER_TASK_STATUSES.
 */
export function KanbanBoard({ tasks, labels, tones, isAdmin }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<TaskStatus | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => setItems(tasks), [tasks]);

  const columns: TaskStatus[] = isAdmin
    ? [...TASK_STATUSES]
    : [...USER_TASK_STATUSES];

  async function moveTo(taskId: string, status: TaskStatus) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const prev = items;
    // Optimistic move.
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSavingId(taskId);
    const res = await setTaskStatus(taskId, status, task.updatedAt.toISOString());
    setSavingId(null);
    if (!res.ok) {
      setItems(prev); // revert
      fireToast({
        message:
          res.error === "forbidden"
            ? "You can't move this task to that status."
            : res.error === "invalid"
              ? res.message ?? "That move isn't allowed from here."
              : res.error === "stale"
                ? "Task changed elsewhere — refreshing."
                : "Couldn't update the task.",
      });
      router.refresh();
      return;
    }
    fireToast({ message: `Moved to ${labels[status]}.` });
    router.refresh();
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colTasks = items.filter((t) => t.status === col);
        const tone = tones[col];
        const isOver = overCol === col;
        return (
          <div
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col);
            }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              if (dragId) void moveTo(dragId, col);
              setDragId(null);
            }}
            className="flex-shrink-0 w-[280px] rounded-section p-3 transition-colors"
            style={{
              background: isOver ? `var(--color-${tone}-bg)` : "var(--color-surface-soft)",
              border: `1px solid ${isOver ? `var(--color-${tone})` : "var(--color-hairline)"}`,
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span
                className="inline-flex items-center gap-2 text-[13px] font-bold"
                style={{ color: `var(--color-${tone}-deep)` }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(--color-${tone})` }}
                />
                {labels[col]}
              </span>
              <span className="text-[12px] font-semibold text-ink-subtle tabular-nums">
                {colTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-2 min-h-[40px]">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  className="group rounded-chip bg-white border border-hairline p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md"
                  style={{ opacity: dragId === t.id ? 0.5 : 1 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/tasks/${t.id}/focus` as Route}
                      className="text-[14px] font-semibold text-ink-strong leading-snug hover:underline"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {t.description || t.title}
                    </Link>
                    {savingId === t.id && (
                      <Loader2 size={14} className="animate-spin text-ink-subtle shrink-0 mt-0.5" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {t.subject && (
                      <span className="text-[11px] font-semibold text-ink-subtle">
                        {t.subject}
                      </span>
                    )}
                    {t.doerName && (
                      <span className="text-[11px] text-ink-subtle">· {t.doerName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
