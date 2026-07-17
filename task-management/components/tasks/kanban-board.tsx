"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { format } from "date-fns";
import {
  Loader2,
  Archive,
  Flag,
  Tag,
  Building2,
  CalendarDays,
  AlignLeft,
  User,
  Check,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
  type StatusColorToken,
} from "@/db/enums";
import { ARCHIVE_COL, type ColId } from "@/lib/kanban-columns";
import { setTaskStatus, archiveTask, unarchiveTask } from "@/app/(app)/tasks/actions";
import { setBoardColumnOrder } from "@/app/(admin)/admin/settings/actions";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { LateBadge } from "@/components/ui/late-badge";
import { WeeklyGoalBadge } from "@/components/weekly-goals/weekly-goal-badge";
import { isDoneLate } from "@/lib/task-late";
import type { BoardTask } from "@/lib/queries/tasks";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";

// Priority → colour token + label for the hover-card badge.
const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

interface Props {
  tasks: BoardTask[];
  /** This week's goals (design §10), injected as badged, non-draggable
   *  link-out cards into their matching status column. Never tasks. */
  weeklyGoals?: VirtualTaskRow[];
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
  /** Ordered column ids to render (statuses + the synthetic Archive column).
   *  Admins can drag column headers to reorder; the new order is persisted. */
  columnOrder: ColId[];
}

// Cards rendered per column before "Show more"; each tap reveals 10 more.
const COL_STEP = 10;

function accentFor(col: ColId, tones: Record<TaskStatus, StatusColorToken>) {
  const isArchive = col === ARCHIVE_COL;
  const tone = isArchive ? null : tones[col as TaskStatus];
  return {
    isArchive,
    accent: isArchive ? "#94a3b8" : `var(--color-${tone})`,
    accentDeep: isArchive ? "#64748b" : `var(--color-${tone}-deep)`,
    accentBgLight: isArchive ? "#f1f5f9" : `var(--color-${tone}-bg)`,
  };
}

/**
 * Status Kanban (Manan #25), rebuilt on dnd-kit for buttery pointer-based
 * drag: drag a card between columns to change its status (or into Archived to
 * archive / out to restore), and — as an admin — drag a column header to
 * reorder the whole board (persisted globally). A DragOverlay renders the
 * floating preview; dnd-kit handles auto-scroll, keyboard a11y and animation.
 */
export function KanbanBoard({ tasks, weeklyGoals = [], labels, tones, isAdmin, columnOrder }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [visibleByCol, setVisibleByCol] = React.useState<Record<string, number>>({});
  // Column order is local state so an admin's drag-reorder is instant.
  const [columns, setColumns] = React.useState<ColId[]>(columnOrder);
  // The active drag (card or column) — drives the DragOverlay + drop targeting.
  const [active, setActive] = React.useState<{ id: string; type: "card" | "column" } | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  React.useEffect(() => setItems(tasks), [tasks]);
  React.useEffect(() => setColumns(columnOrder), [columnOrder]);

  const sensors = useSensors(
    // Mouse: a 6px move starts a drag, so clicking a card's link still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to drag, so normal swipes still scroll the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Filtering now happens server-side via the page's FilterBar; the board just
  // renders what it's given (kept as `filtered` so the column logic below is
  // unchanged). Optimistic drag still mutates `items`.
  const filtered = items;
  const activeCount = items.filter((t) => !t.archived).length;

  async function persistOrder(next: ColId[]) {
    const prev = columns;
    setColumns(next);
    const res = await setBoardColumnOrder(next as string[]);
    if (!res.ok) {
      setColumns(prev);
      fireToast({ message: res.error || "Couldn't save the column order." });
    }
  }

  async function archiveCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: true } : t)));
    setSavingId(taskId);
    const res = await archiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't archive the task." });
      router.refresh();
    } else {
      fireToast({ message: "Archived." });
      // Card already moved to Archived optimistically — reconcile counts/derived
      // fields in one coalesced background refresh (Operation Butter P1).
      scheduleReconcile(() => router.refresh());
    }
  }

  async function restoreCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || !task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: false } : t)));
    setSavingId(taskId);
    const res = await unarchiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't restore the task." });
      router.refresh();
    } else {
      fireToast({ message: "Restored." });
      scheduleReconcile(() => router.refresh());
    }
  }

  async function moveTo(taskId: string, status: TaskStatus) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSavingId(taskId);
    const res = await setTaskStatus(taskId, status, task.updatedAt.toISOString());
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
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
    } else {
      // Advance the moved card's lock token so a second drag of the SAME card
      // doesn't ship a stale `updatedAt` (Operation Butter P1).
      setItems((cur) =>
        cur.map((t) => (t.id === taskId ? { ...t, updatedAt: new Date(res.updatedAt) } : t)),
      );
      fireToast({ message: `Moved to ${labels[status]}.` });
      // Card already moved columns optimistically — coalesce the server-derived
      // reconcile (late badge, counts) into one background refresh.
      scheduleReconcile(() => router.refresh());
    }
  }

  function onDragStart(e: DragStartEvent) {
    const type = (e.active.data.current?.type as "card" | "column") ?? "card";
    setActive({ id: String(e.active.id), type });
  }

  function onDragOver(e: DragOverEvent) {
    setOverCol(e.over ? String(e.over.id) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    const a = active;
    setActive(null);
    setOverCol(null);
    const { over } = e;
    if (!over || !a) return;
    const overId = String(over.id);

    if (a.type === "column") {
      if (!isAdmin || overId === a.id) return;
      const from = columns.indexOf(a.id as ColId);
      const to = columns.indexOf(overId as ColId);
      if (from < 0 || to < 0) return;
      void persistOrder(arrayMove(columns, from, to));
      return;
    }

    // Card drop — `over` resolves to a column droppable.
    const card = items.find((t) => t.id === a.id);
    if (!card) return;
    if (overId === ARCHIVE_COL) {
      if (!card.archived) void archiveCard(card.id);
      return;
    }
    // A status column. Dropping an archived card restores it (keeps status).
    if (card.archived) {
      void restoreCard(card.id);
      return;
    }
    void moveTo(card.id, overId as TaskStatus);
  }

  const activeCard = active?.type === "card" ? items.find((t) => t.id === active.id) ?? null : null;

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={400}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setOverCol(null);
        }}
      >
        <div>
          {/* Running total — filtering lives in the top filter bar now. */}
          <div className="mb-5 flex items-center gap-2.5 flex-wrap">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3.5 py-1.5 text-[14.5px] font-bold"
              style={{
                color: "var(--color-altus-red-deep)",
                background: "color-mix(in srgb, var(--color-altus-red) 7%, white)",
                border: "1px solid color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
              }}
            >
              <span
                className="tabular-nums"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16 }}
              >
                {activeCount}
              </span>
              {activeCount === 1 ? "task" : "tasks"} on the board
            </span>
          </div>

          <div
            className="kanban-scroll flex items-stretch gap-4 overflow-x-auto overflow-y-hidden pb-3 max-sm:snap-x max-sm:snap-mandatory"
            style={{ height: "calc(100dvh - 290px)", minHeight: 460 }}
          >
            <SortableContext items={columns} strategy={horizontalListSortingStrategy}>
              {columns.map((col) => {
                const { isArchive, accent, accentDeep, accentBgLight } = accentFor(col, tones);
                const colTasks = isArchive
                  ? filtered.filter((t) => t.archived)
                  : filtered.filter((t) => !t.archived && t.status === col);
                // This week's goals whose task-status maps to this column.
                // Never shown in the Archive column.
                const colGoals = isArchive
                  ? []
                  : weeklyGoals.filter((g) => g.status === col);
                const limit = visibleByCol[col] ?? COL_STEP;
                const shownTasks = colTasks.slice(0, limit);
                const hiddenCount = colTasks.length - shownTasks.length;
                const label = isArchive ? "Archived" : labels[col as TaskStatus];
                const isCardOver = active?.type === "card" && overCol === col;
                return (
                  <KanbanColumn
                    key={col}
                    col={col}
                    isAdmin={isAdmin}
                    isArchive={isArchive}
                    label={label}
                    count={colTasks.length}
                    accent={accent}
                    accentDeep={accentDeep}
                    accentBgLight={accentBgLight}
                    isCardOver={isCardOver}
                  >
                    {isArchive && colTasks.length === 0 && (
                      <div
                        className="rounded-chip px-3 py-6 text-center"
                        style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
                      >
                        <p className="text-[14px] font-semibold leading-relaxed text-ink-subtle">
                          Drag a card here to archive it.
                        </p>
                      </div>
                    )}
                    {!isArchive && colTasks.length === 0 && colGoals.length === 0 && (
                      <div
                        className="rounded-chip px-3 py-6 text-center"
                        style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
                      >
                        <p className="text-[13.5px] font-semibold text-ink-subtle">
                          Nothing here — drop a card to move it.
                        </p>
                      </div>
                    )}
                    {/* Pinned weekly-goal cards at the top of the column —
                        badged, distinct accent, link out to the workspace. */}
                    {colGoals.map((g) => (
                      <KanbanGoalCard key={g.id} g={g} />
                    ))}
                    {shownTasks.map((t) => (
                      <KanbanCard
                        key={t.id}
                        t={t}
                        labels={labels}
                        tones={tones}
                        saving={savingId === t.id}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleByCol((m) => ({ ...m, [col]: limit + COL_STEP }))
                        }
                        className="brand-btn mt-1 w-full rounded-chip py-2.5 text-[14px] font-bold transition-colors text-ink-soft hover:bg-surface-card"
                        style={{ border: "1px dashed var(--color-hairline-strong)" }}
                      >
                        Show {Math.min(COL_STEP, hiddenCount)} more ({hiddenCount} hidden)
                      </button>
                    )}
                  </KanbanColumn>
                );
              })}
            </SortableContext>
          </div>
        </div>

        {/* Floating drag preview. */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
          {activeCard ? (
            <div
              className="relative w-[300px] rotate-2 cursor-grabbing rounded-chip border border-altus-red/40 bg-white p-3.5 pl-4 shadow-2xl"
              style={{
                boxShadow:
                  "0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 20px -8px rgba(225,6,0,0.25)",
              }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                style={{
                  background: `linear-gradient(180deg, var(--color-${tones[activeCard.status] ?? "slate"}), var(--color-${tones[activeCard.status] ?? "slate"}-deep))`,
                }}
              />
              <span
                className="block text-[15.5px] font-semibold text-ink-strong leading-snug"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {activeCard.description || activeCard.title}
              </span>
              <div className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-subtle">
                {activeCard.taskNo != null && <span className="font-bold tabular-nums">#{activeCard.taskNo}</span>}
                {activeCard.doerName && <span>· {activeCard.doerName}</span>}
              </div>
            </div>
          ) : active?.type === "column" ? (
            <div className="rounded-section border border-hairline-strong bg-surface-soft px-4 py-3 shadow-2xl">
              <span className="text-[15.5px] font-bold text-ink-strong">
                {active.id === ARCHIVE_COL ? "Archived" : labels[active.id as TaskStatus]}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Tooltip.Provider>
  );
}

// ── Column (sortable for admin reorder + drop target for cards) ─────────────
function KanbanColumn({
  col,
  isAdmin,
  isArchive,
  label,
  count,
  accent,
  accentDeep,
  accentBgLight,
  isCardOver,
  children,
}: {
  col: ColId;
  isAdmin: boolean;
  isArchive: boolean;
  label: string;
  count: number;
  accent: string;
  accentDeep: string;
  accentBgLight: string;
  isCardOver: boolean;
  children: React.ReactNode;
}) {
  // Disable only the column DRAG for non-admins — the column must stay a drop
  // target so anyone can still drag cards between columns.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: col,
    disabled: { draggable: !isAdmin, droppable: false },
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      className="relative flex flex-col overflow-hidden flex-[1_0_320px] max-w-[460px] max-sm:flex-[0_0_85vw] max-sm:max-w-none max-sm:snap-center rounded-section p-3.5 transition-colors"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        background: isCardOver ? accentBgLight : "var(--color-surface-soft)",
        border: `1px solid ${isCardOver ? accent : "var(--color-hairline)"}`,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -22px rgba(15,23,42,0.22)",
        touchAction: "manipulation",
      }}
    >
      {/* Status accent strip along the column top. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-30 pointer-events-none"
        style={{
          height: 3,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: `linear-gradient(90deg, ${accent}, ${accentDeep})`,
        }}
      />
      {/* Column header — a fixed (non-scrolling) top block so the status is
          FROZEN and always visible; only the cards list below scrolls. The grip
          is the admin reorder handle. */}
      <div
        className="shrink-0 z-20 flex items-center justify-between gap-2 -mx-3.5 -mt-3.5 mb-3 px-3.5 pt-4 pb-2.5"
        style={{
          background: "inherit",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <span className="inline-flex items-center gap-2 min-w-0" style={{ color: accentDeep }}>
          {isAdmin && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${label} column`}
              className="shrink-0 cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink-strong touch-none"
            >
              <GripVertical size={15} strokeWidth={2.2} aria-hidden />
            </button>
          )}
          {isArchive ? (
            <Archive size={16} strokeWidth={2.4} className="shrink-0" style={{ color: accent }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accent }} />
          )}
          <span
            className="font-black truncate"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 15.5,
              letterSpacing: "-0.005em",
            }}
          >
            {label}
          </span>
        </span>
        <span
          className="rounded-pill px-2.5 py-0.5 text-[13px] font-black tabular-nums shrink-0"
          style={{
            color: accentDeep,
            background: `color-mix(in srgb, ${accent} 13%, white)`,
            border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
          }}
        >
          {count}
        </span>
      </div>

      {/* Only this cards list scrolls — the header above stays frozen. */}
      <div className="kanban-scroll flex-1 min-h-[40px] overflow-y-auto overflow-x-hidden flex flex-col gap-2 -mr-2 pr-2">{children}</div>
    </div>
  );
}

// ── Card (draggable) ─────────────────────────────────────────────────────────
function KanbanCard({
  t,
  labels,
  tones,
  saving,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  saving: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: t.id,
    data: { type: "card" },
  });

  const statusTone = tones[t.status] ?? "slate";
  // Effective due already (revised ?? original) from the query; an open task
  // past it reads as overdue on the due chip.
  const overdue =
    !t.archived && !t.completedAt && t.status !== "done" && t.dueAt.getTime() < Date.now();
  const meta = [t.client?.trim(), t.subject?.trim()].filter((p): p is string => !!p);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <Tooltip.Root delayDuration={220}>
        <Tooltip.Trigger asChild>
          <div
            className="group relative rounded-chip bg-white border border-hairline p-3.5 pl-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-altus-red/40"
            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
          >
            {/* Status accent stripe. */}
            <span
              aria-hidden
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={{
                background: t.archived
                  ? "#94a3b8"
                  : `linear-gradient(180deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
              }}
            />
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/tasks/${t.id}/focus` as Route}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                className="text-[15.5px] font-semibold text-ink-strong leading-snug hover:underline group-hover:text-altus-red-deep transition-colors"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description || t.title}
              </Link>
              {saving && (
                <Loader2 size={14} className="animate-spin text-ink-subtle shrink-0 mt-0.5" />
              )}
            </div>

            {/* Badge row — task no · priority · due (red when overdue) · late. */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              {t.taskNo != null && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[12px] font-black tabular-nums text-ink-subtle"
                  style={{
                    background: "var(--color-surface-soft)",
                    border: "1px solid var(--color-hairline)",
                  }}
                >
                  #{t.taskNo}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold whitespace-nowrap"
                style={{
                  color: `var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}-deep)`,
                  background: `color-mix(in srgb, var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}) 12%, white)`,
                  border: `1px solid color-mix(in srgb, var(--color-${PRIORITY_TONE[t.priority] ?? "slate"}) 26%, transparent)`,
                }}
              >
                <Flag size={11} strokeWidth={2.6} />
                {PRIORITY_LABELS[t.priority]}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums whitespace-nowrap ${
                  overdue ? "" : "text-ink-subtle"
                }`}
                style={
                  overdue
                    ? {
                        color: "var(--color-red-deep)",
                        background: "color-mix(in srgb, var(--color-red) 10%, white)",
                        border: "1px solid color-mix(in srgb, var(--color-red) 28%, transparent)",
                      }
                    : {
                        background: "var(--color-surface-soft)",
                        border: "1px solid var(--color-hairline)",
                      }
                }
                title={overdue ? "Past its due date" : "Due date"}
              >
                <CalendarDays size={11} strokeWidth={2.4} />
                {format(t.dueAt, "MMM d")}
                {overdue ? " · overdue" : ""}
              </span>
              {isDoneLate({ status: t.status, completedAt: t.completedAt, dueAt: t.dueAt }) && (
                <LateBadge />
              )}
            </div>

            {/* Footer — client · subject + doer chip. */}
            {(meta.length > 0 || t.doerName) && (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-ink-subtle">
                  {meta.join(" · ")}
                </span>
                {t.doerName && (
                  <span
                    className="inline-flex items-center gap-1.5 min-w-0 shrink-0"
                    title={t.doerName}
                  >
                    <EmployeeAvatar name={t.doerName} size="sm" />
                    <span className="max-w-[110px] truncate text-[12.5px] font-semibold text-ink-subtle">
                      {t.doerName.split(" ")[0]}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="kanban-hovercard z-[80]"
          >
            <TaskHoverCard t={t} labels={labels} tones={tones} />
            <Tooltip.Arrow width={14} height={7} style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

// ── Weekly-goal card (design §10) ───────────────────────────────────────────
// A read-only, non-draggable card surfaced inside its status column. Visually
// distinct (Altus accent + "Weekly Goal" badge) and links out to the Weekly
// Goals workspace — the single edit/review surface. Never a real task.
function KanbanGoalCard({ g }: { g: VirtualTaskRow }) {
  const meta = [g.client?.trim(), g.subject?.trim(), g.doerName?.trim()].filter(
    (p): p is string => !!p,
  );
  return (
    <Link
      href={g.href as Route}
      className="group block rounded-chip p-3.5 pl-[15px] transition-colors duration-200 hover:bg-surface-soft"
      style={{
        background: "var(--color-surface-card)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        borderLeft: "3px solid var(--color-altus-red)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <WeeklyGoalBadge />
        <span
          className="tabular-nums font-bold shrink-0"
          style={{ fontSize: 12.5, color: "var(--color-altus-red-deep)" }}
        >
          {g.pct}%
        </span>
      </div>
      <span
        className="mt-2 block text-[15px] font-semibold text-ink-strong leading-snug group-hover:text-altus-red-deep transition-colors"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {g.title}
      </span>
      {meta.length > 0 && (
        <span className="mt-1.5 block truncate text-[12.5px] text-ink-subtle">
          {meta.join(" · ")}
        </span>
      )}
      {/* Effective-% progress bar. */}
      <span
        aria-hidden
        className="mt-2.5 block rounded-full overflow-hidden"
        style={{ height: 5, background: "var(--color-hairline)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, g.pct))}%`,
            background: "var(--color-altus-red)",
          }}
        />
      </span>
    </Link>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────
function Pill({
  tone,
  icon,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function FieldHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-1.5 text-ink-subtle"
      style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      {icon}
      {children}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <FieldHead icon={icon}>{label}</FieldHead>
      <div className="mt-1 truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
        {value && value.trim() ? value : "—"}
      </div>
    </div>
  );
}

function TaskHoverCard({
  t,
  labels,
  tones,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const statusTone = tones[t.status] ?? "blue";
  const prioTone = PRIORITY_TONE[t.priority] ?? "slate";
  const desc = t.description?.trim();
  const DELAY = ["40ms", "95ms", "150ms", "205ms", "260ms"] as const;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        width: 384,
        maxWidth: "calc(100vw - 32px)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
      }}
    >
      <span
        aria-hidden
        className="hc-accent absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
        }}
      />

      <div className="p-5 pt-6">
        <div className="hc-item flex items-center gap-2 flex-wrap" style={{ animationDelay: DELAY[0] }}>
          <Pill
            tone={statusTone}
            icon={<span className="h-2 w-2 rounded-full" style={{ background: `var(--color-${statusTone})` }} />}
          >
            {labels[t.status]}
          </Pill>
          <Pill tone={prioTone} icon={<Flag size={12} strokeWidth={2.6} />}>
            {PRIORITY_LABELS[t.priority]}
          </Pill>
          {t.archived && (
            <Pill tone="slate" icon={<Archive size={12} strokeWidth={2.4} />}>
              Archived
            </Pill>
          )}
        </div>

        <h3
          className="hc-item mt-3.5 text-ink-strong"
          style={{ animationDelay: DELAY[1], fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}
        >
          {t.taskNo != null && <span className="text-ink-subtle tabular-nums">#{t.taskNo} · </span>}
          {t.title}
        </h3>

        <div className="hc-item mt-3" style={{ animationDelay: DELAY[2] }}>
          <FieldHead icon={<AlignLeft size={14} strokeWidth={2.2} />}>Description</FieldHead>
          {desc ? (
            <p
              className="mt-1.5 whitespace-pre-wrap text-ink-soft"
              style={{ fontSize: 14.5, lineHeight: 1.6, maxHeight: 208, overflowY: "auto" }}
            >
              {desc}
            </p>
          ) : (
            <p className="mt-1.5 italic text-ink-subtle" style={{ fontSize: 14 }}>
              No description added.
            </p>
          )}
        </div>

        <div className="hc-item my-4 h-px bg-hairline" style={{ animationDelay: DELAY[3] }} />

        <div className="hc-item grid grid-cols-2 gap-x-4 gap-y-4" style={{ animationDelay: DELAY[4] }}>
          <Meta icon={<Building2 size={14} strokeWidth={2.2} />} label="Client" value={t.client} />
          <Meta icon={<Tag size={14} strokeWidth={2.2} />} label="Subject" value={t.subject} />
          <Meta
            icon={<CalendarDays size={14} strokeWidth={2.2} />}
            label="Due"
            value={t.dueAt ? format(t.dueAt, "MMM d, yyyy") : null}
          />
          <div className="min-w-0">
            <FieldHead icon={<User size={14} strokeWidth={2.2} />}>Doer</FieldHead>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              {t.doerName ? (
                <>
                  <EmployeeAvatar name={t.doerName} size="sm" />
                  <span className="truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {t.doerName}
                  </span>
                </>
              ) : (
                <span className="text-ink-subtle" style={{ fontSize: 14.5 }}>
                  Unassigned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
