"use client";

/**
 * Weekly board — KANBAN view.
 *
 * A clean SINGLE-WEEK Kanban: a left "This month's goals" SOURCE column whose
 * cards are the month's monthly-cascade goals, and a right column for the week
 * in view. Drag a monthly goal into the week column → it creates a weekly goal
 * linked to that monthly parent (`addWeekGoal({ employeeId, weekStart, title,
 * monthGoalId })`). Existing weekly rows render as cards in the week column and
 * keep their carry-forward affordance.
 *
 * WHY single-week (design decision): the weekly loader only hydrates the rows of
 * the ONE focused week (plus prev/next week *keys*, not their goals). Rendering
 * adjacent weeks as columns would show them permanently empty even when they
 * hold goals — misleading. So this is the recommended single-week Kanban with a
 * draggable month-goal source → the current week; week-nav (‹ ›) still moves
 * which week is the target, and cross-week movement stays on the carry-forward
 * control (which already targets ±weeks).
 *
 * One `DndContext`; keyboard-draggable (Pointer + Keyboard sensors); every drop
 * is fail-safe — a rejected create reverts the optimistic card and toasts.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GripVertical, Link2, Plus, Target, CheckCircle2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addWeekGoal } from "@/app/(app)/goals/weekly/actions";
import { CarryForwardControl } from "./carry-forward-control";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption } from "./types";

const ACCENT = "var(--goals-accent, #E10600)";
const ACCENT_DEEP = "var(--goals-accent-deep, #A80400)";
const ACCENT_TINT = "color-mix(in srgb, var(--goals-accent, #E10600) 10%, transparent)";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const MONTH_DRAG_PREFIX = "monthgoal:";
const WEEK_DROP_ID = "weekcol";

/** A weekly card the user just created by dropping — held locally until the
 *  server row (same id) arrives on the next router.refresh, then reconciled. */
interface LocalCard {
  id: string;
  title: string;
  monthGoalTitle: string | null;
  saving: boolean;
}

export function WeeklyKanban({
  me,
  scopeEmp,
  weekStart,
  weekNo,
  weekLabel,
  rows,
  monthGoalOptions,
  canWrite,
}: {
  me: BoardMe;
  scopeEmp: string;
  weekStart: string;
  weekNo: number;
  weekLabel: string;
  rows: CascadeWeeklyGoal[];
  monthGoalOptions: MonthGoalOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [added, setAdded] = React.useState<LocalCard[]>([]);
  const [activeOption, setActiveOption] = React.useState<MonthGoalOption | null>(null);

  // Reconcile: once a locally-added card's real id shows up in the server rows,
  // drop the optimistic copy (the real card renders instead).
  React.useEffect(() => {
    setAdded((prev) => prev.filter((c) => !rows.some((r) => r.id === c.id)));
  }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // How many weekly goals this week already ladder up to each monthly goal —
  // a calm badge on the source card so the drag reads as "add another".
  const linkedByMonth = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.monthGoalId) m.set(r.monthGoalId, (m.get(r.monthGoalId) ?? 0) + 1);
    return m;
  }, [rows]);

  const createFromMonth = React.useCallback(
    (option: MonthGoalOption) => {
      const tempId = `temp-${Math.random().toString(36).slice(2)}`;
      setAdded((p) => [...p, { id: tempId, title: option.title, monthGoalTitle: option.title, saving: true }]);
      void addWeekGoal({
        employeeId: scopeEmp,
        weekStart,
        title: option.title,
        monthGoalId: option.id,
      })
        .then((res) => {
          if (!res.ok) {
            setAdded((p) => p.filter((c) => c.id !== tempId));
            fireToast({ message: res.error, type: "error" });
            return;
          }
          // Swap the temp id for the real row id, mark saved, then refresh so the
          // fully-hydrated server row (parent link, Sr. No.) lands + reconciles.
          setAdded((p) => p.map((c) => (c.id === tempId ? { ...c, id: res.id, saving: false } : c)));
          fireToast({ message: `Added “${option.title}” to W${weekNo}.`, type: "success" });
          router.refresh();
        })
        .catch((e: unknown) => {
          setAdded((p) => p.filter((c) => c.id !== tempId));
          fireToast({ message: e instanceof Error ? e.message : "Couldn't add the goal. Try again.", type: "error" });
        });
    },
    [scopeEmp, weekStart, weekNo, router],
  );

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => {
      const opt = e.active.data.current?.option as MonthGoalOption | undefined;
      setActiveOption(opt ?? null);
    },
    [],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setActiveOption(null);
      const { active, over } = e;
      if (!over || over.id !== WEEK_DROP_ID) return;
      const opt = active.data.current?.option as MonthGoalOption | undefined;
      if (opt) createFromMonth(opt);
    },
    [createFromMonth],
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] max-lg:grid-cols-1">
        {/* ── Source column — this month's monthly goals (drag into the week) ── */}
        <section
          aria-label="This month's goals — drag one into the week"
          className="flex flex-col rounded-2xl border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.6)" }}
        >
          <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Target size={15} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink-strong">This month&apos;s goals</div>
              <div className="text-[11px] font-medium text-ink-soft">Drag a goal into the week →</div>
            </div>
            <span
              className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
              style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
            >
              {monthGoalOptions.length}
            </span>
          </header>
          <div className="flex flex-col gap-2 p-3">
            {monthGoalOptions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-8 text-center text-[12.5px] font-medium text-ink-soft">
                No monthly goals for this month yet. Add one on the Monthly board first.
              </p>
            ) : (
              monthGoalOptions.map((o) => (
                <MonthGoalSource
                  key={o.id}
                  option={o}
                  linkedCount={linkedByMonth.get(o.id) ?? 0}
                  disabled={!canWrite}
                />
              ))
            )}
          </div>
        </section>

        {/* ── Week column — the drop target + existing weekly cards ── */}
        <WeekColumn
          weekNo={weekNo}
          weekLabel={weekLabel}
          weekStart={weekStart}
          rows={rows}
          added={added}
          me={me}
          canWrite={canWrite}
        />
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {activeOption && (
          <div
            className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5"
            style={{
              background: "var(--color-surface-card)",
              borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 48%, transparent)",
              boxShadow: "0 22px 50px -14px rgba(225,6,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)",
              transform: "rotate(-2deg) scale(1.03)",
              cursor: "grabbing",
            }}
          >
            <Link2 size={14} style={{ color: ACCENT }} />
            <span className="max-w-[260px] truncate text-[13.5px] font-bold text-ink-strong">
              {activeOption.title}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/* Draggable source card — one monthly goal                            */
/* ------------------------------------------------------------------ */

function MonthGoalSource({
  option,
  linkedCount,
  disabled,
}: {
  option: MonthGoalOption;
  linkedCount: number;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${MONTH_DRAG_PREFIX}${option.id}`,
    data: { option },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      aria-label={disabled ? option.title : `${option.title} — press space or enter to pick up, then move it into the week and drop`}
      className={`group flex items-start gap-2 rounded-xl border bg-surface-card px-3 py-2.5 transition-shadow ${
        disabled ? "cursor-default" : `cursor-grab hover:shadow-md active:cursor-grabbing ${FOCUS_RING}`
      }`}
      style={{
        borderColor: "var(--color-hairline)",
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {!disabled && (
        <GripVertical size={15} className="mt-0.5 shrink-0 text-ink-faint transition-colors group-hover:text-ink-soft" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {option.area && (
            <span
              className="rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
              style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
            >
              {option.area}
            </span>
          )}
          {linkedCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold"
              style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
              title={`${linkedCount} weekly goal${linkedCount === 1 ? "" : "s"} this week ladder up to this`}
            >
              <Link2 size={10} /> {linkedCount}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold leading-snug text-ink-strong">{option.title}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Week column — droppable body + existing weekly cards                */
/* ------------------------------------------------------------------ */

function WeekColumn({
  weekNo,
  weekLabel,
  weekStart,
  rows,
  added,
  me,
  canWrite,
}: {
  weekNo: number;
  weekLabel: string;
  weekStart: string;
  rows: CascadeWeeklyGoal[];
  added: LocalCard[];
  me: BoardMe;
  canWrite: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: WEEK_DROP_ID });
  const total = rows.length + added.length;

  return (
    <section
      aria-label={`Week ${weekNo} — ${total} goal${total === 1 ? "" : "s"}. Drop a monthly goal here to add it to this week.`}
      className="flex flex-col rounded-2xl border-2 border-dashed transition-all"
      style={{
        background: isOver
          ? "color-mix(in srgb, var(--goals-accent, #E10600) 5%, var(--color-surface-soft))"
          : "var(--color-surface-soft)",
        borderColor: isOver
          ? ACCENT
          : "color-mix(in srgb, var(--goals-accent, #E10600) 32%, var(--color-hairline-strong))",
        boxShadow: isOver ? "0 0 0 3px color-mix(in srgb, var(--goals-accent, #E10600) 14%, transparent)" : "none",
      }}
    >
      <header
        className="sticky top-2 z-10 mx-2 mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
          boxShadow: "0 8px 20px -12px color-mix(in srgb, var(--goals-accent, #E10600) 70%, transparent)",
        }}
      >
        <span className="rounded-chip bg-white/25 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white">W{weekNo}</span>
        <span className="truncate text-[13.5px] font-bold text-white">{weekLabel}</span>
        <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1.5 py-[1px] text-[11px] font-bold tabular-nums text-white">
          {total}
        </span>
      </header>

      <div ref={setNodeRef} className="flex min-h-[140px] flex-1 flex-col gap-2.5 p-3">
        {total === 0 ? (
          <p
            className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center text-[13px] font-semibold"
            style={{ borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 30%, transparent)", color: "var(--color-ink-soft)" }}
          >
            {canWrite ? "Drag a monthly goal here to plan it for this week." : "No goals for this week yet."}
          </p>
        ) : (
          <>
            {rows.map((r) => (
              <WeekGoalCard key={r.id} goal={r} me={me} canWrite={canWrite} weekStart={weekStart} />
            ))}
            {added.map((c) => (
              <PendingCard key={c.id} card={c} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/* Google 0–100 grading colour. */
function gradeColor(pct: number): string {
  if (pct >= 70) return "#15803d";
  if (pct >= 40) return "#b45309";
  return "#b91c1c";
}

function WeekGoalCard({
  goal,
  me,
  canWrite,
  weekStart,
}: {
  goal: CascadeWeeklyGoal;
  me: BoardMe;
  canWrite: boolean;
  weekStart: string;
}) {
  const pct = goal.acceptPct ?? goal.pctDone;
  const color = gradeColor(pct);
  const canCarry = canWrite && (me.isAdmin || goal.employeeId === me.id);

  return (
    <article
      className="relative overflow-hidden rounded-xl border border-hairline bg-surface-card px-3 py-2.5"
      style={{ opacity: goal.adopted ? 1 : 0.6, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex items-start gap-2 pl-1.5">
        <span
          className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums"
          style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
        >
          {goal.position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {goal.area && (
              <span
                className="rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
              >
                {goal.area}
              </span>
            )}
            <h4 className={`text-[13.5px] font-semibold text-ink-strong ${goal.adopted ? "" : "line-through"}`}>
              {goal.subject || goal.targetDone || "Untitled goal"}
            </h4>
          </div>
          {goal.monthGoalTitle && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft">
              <Link2 size={11} style={{ color: ACCENT }} />
              <span className="truncate max-w-[28ch]">{goal.monthGoalTitle}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold"
              style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}
            >
              {pct}%
            </span>
            {goal.committed && (
              <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold" style={{ color: ACCENT_DEEP }}>
                <CheckCircle2 size={11} /> Committed
              </span>
            )}
            {canCarry && (
              <div className="ml-auto">
                <CarryForwardControl goalId={goal.id} weekStart={weekStart} />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Optimistic card shown from drop until the server row reconciles. */
function PendingCard({ card }: { card: LocalCard }) {
  return (
    <article
      className="relative flex items-start gap-2 rounded-xl border border-dashed px-3 py-2.5"
      style={{ borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 40%, transparent)", background: ACCENT_TINT }}
    >
      <Plus size={14} className="mt-0.5" style={{ color: ACCENT }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink-strong">{card.title}</div>
        {card.monthGoalTitle && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft">
            <Link2 size={11} style={{ color: ACCENT }} />
            <span className="truncate max-w-[28ch]">{card.monthGoalTitle}</span>
          </div>
        )}
        <div className="mt-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: ACCENT_DEEP }}>
          {card.saving ? "Adding…" : "Added"}
        </div>
      </div>
    </article>
  );
}
