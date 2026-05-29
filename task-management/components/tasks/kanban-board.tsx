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
  /** Frosted-glass columns for the dark canvas page. */
  dark?: boolean;
}

/**
 * Status Kanban (Manan #25). One column per status; drag a card to another
 * column to change its status. HTML5 drag-and-drop (no extra deps). The
 * server action validates the transition + optimistic lock; on success we
 * refresh, on failure we revert and toast.
 *
 * Admins get every status as a column; everyone else gets USER_TASK_STATUSES.
 */
// Cards rendered per column before "Show more"; each tap reveals 10 more.
// Keeps the board light when a column holds dozens of tasks.
const COL_STEP = 10;

export function KanbanBoard({ tasks, labels, tones, isAdmin, dark = false }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<TaskStatus | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  // Per-column visible cap (status → count). Missing = COL_STEP.
  const [visibleByCol, setVisibleByCol] = React.useState<
    Record<string, number>
  >({});

  // Edge auto-scroll: native HTML5 drag won't scroll an overflow container
  // near its edges, so a card can't be dragged to an off-screen column. While
  // a drag is active we run a rAF loop that scrolls the board left/right when
  // the pointer enters an edge zone — letting a drag cross the full width.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const autoScroll = React.useRef({ dir: 0, speed: 0, raf: 0 });

  function updateEdgeFromPointer(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const zone = 110; // px from each edge that triggers scrolling
    const max = 26; // px per frame at the very edge
    if (clientX < rect.left + zone) {
      autoScroll.current.dir = -1;
      autoScroll.current.speed = Math.ceil(((rect.left + zone - clientX) / zone) * max);
    } else if (clientX > rect.right - zone) {
      autoScroll.current.dir = 1;
      autoScroll.current.speed = Math.ceil(((clientX - (rect.right - zone)) / zone) * max);
    } else {
      autoScroll.current.dir = 0;
    }
  }

  function beginAutoScroll() {
    if (autoScroll.current.raf) return;
    const tick = () => {
      const el = scrollRef.current;
      const { dir, speed } = autoScroll.current;
      if (el && dir !== 0) el.scrollLeft += dir * speed;
      autoScroll.current.raf = requestAnimationFrame(tick);
    };
    autoScroll.current.raf = requestAnimationFrame(tick);
  }

  function endAutoScroll() {
    if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    autoScroll.current = { dir: 0, speed: 0, raf: 0 };
  }

  // Safety net: stop the loop if the component unmounts mid-drag.
  React.useEffect(
    () => () => {
      if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    },
    [],
  );

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
    <div
      ref={scrollRef}
      className="flex gap-4 overflow-x-auto pb-4"
      onDragOver={(e) => {
        // Bubbles up from the columns; track the pointer for edge auto-scroll.
        updateEdgeFromPointer(e.clientX);
      }}
    >
      {columns.map((col) => {
        const colTasks = items.filter((t) => t.status === col);
        const limit = visibleByCol[col] ?? COL_STEP;
        const shownTasks = colTasks.slice(0, limit);
        const hiddenCount = colTasks.length - shownTasks.length;
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
              endAutoScroll();
            }}
            className="flex-shrink-0 w-[280px] rounded-section p-3 transition-colors"
            style={{
              background: isOver
                ? dark
                  ? `color-mix(in srgb, var(--color-${tone}) 28%, rgba(18,11,10,0.55))`
                  : `var(--color-${tone}-bg)`
                : dark
                  ? "rgba(255,255,255,0.055)"
                  : "var(--color-surface-soft)",
              border: `1px solid ${
                isOver
                  ? `var(--color-${tone})`
                  : dark
                    ? "rgba(255,255,255,0.12)"
                    : "var(--color-hairline)"
              }`,
              backdropFilter: dark ? "blur(12px)" : undefined,
              WebkitBackdropFilter: dark ? "blur(12px)" : undefined,
              boxShadow: dark
                ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.5)"
                : undefined,
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span
                className="inline-flex items-center gap-2 text-[13px] font-bold"
                style={{
                  color: dark
                    ? "rgba(255,255,255,0.92)"
                    : `var(--color-${tone}-deep)`,
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: `var(--color-${tone})`,
                    boxShadow: dark
                      ? `0 0 8px color-mix(in srgb, var(--color-${tone}) 70%, transparent)`
                      : undefined,
                  }}
                />
                {labels[col]}
              </span>
              <span
                className="text-[12px] font-semibold tabular-nums"
                style={{
                  color: dark ? "rgba(255,255,255,0.6)" : "var(--color-ink-subtle)",
                }}
              >
                {colTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-2 min-h-[40px]">
              {shownTasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => {
                    setDragId(t.id);
                    beginAutoScroll();
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                    endAutoScroll();
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

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleByCol((m) => ({ ...m, [col]: limit + COL_STEP }))
                  }
                  className="mt-1 w-full rounded-chip py-2 text-[12.5px] font-bold transition-colors"
                  style={{
                    border: dark
                      ? "1px dashed rgba(255,255,255,0.22)"
                      : "1px dashed var(--color-hairline-strong)",
                    color: dark ? "rgba(255,255,255,0.82)" : "var(--color-ink-soft)",
                    background: dark ? "rgba(255,255,255,0.04)" : "transparent",
                  }}
                >
                  Show {Math.min(COL_STEP, hiddenCount)} more ({hiddenCount} hidden)
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
