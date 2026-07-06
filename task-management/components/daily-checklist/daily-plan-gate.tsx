"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "motion/react";
import {
  ArrowRight,
  Plus,
  Check,
  Target,
  X,
  CornerUpRight,
  Loader2,
  ListChecks,
  GripVertical,
  Sparkles,
  ChevronDown,
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
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { fireToast } from "@/lib/toast";
import {
  pullGoalToToday,
  pullTaskToToday,
  upsertGoalActual,
  logAllGoalActuals,
  autoFillFive,
  addStandaloneItem,
  removeItem,
  moveOverdueToToday,
} from "@/app/(app)/daily-checklist/actions";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import type {
  DailyItem,
  OverdueItem,
  PullableGoal,
  OpenTaskOption,
  PlannerGoal,
} from "@/lib/queries/daily-checklist";

/* ── Daily-plan gate — the "Plan Your Day" surface users hit each morning.
 *    LEFT  = Today's 5 Commitments (focal, the drop target).
 *    RIGHT = two stacked draggable panels (Weekly Goals + Tasks).
 *    Drag a goal/task from the right onto the left to commit it; every right
 *    row also has a "+ Add" button for keyboard/touch (drag is mouse-only).
 *    Brand-tokens only; fail-open: the layout never blocks login on a DB hiccup
 *    and the server gate is authoritative — worst case it re-shows. ── */

const MIN = MIN_DAILY_ITEMS;

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** The single droppable id for the LEFT commitments column. */
const DROP_ID = "today-commitments";

interface Props {
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  /** Still a prop (kept for compatibility); plannerGoals is the live source. */
  pullable: PullableGoal[];
  openTasks: OpenTaskOption[];
  plannerGoals: PlannerGoal[];
}

type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** Drag payload — a goal or task being dragged from the right into the left. */
type DragData =
  | { kind: "goal"; id: string; label: string }
  | { kind: "task"; id: string; label: string };

export function DailyPlanGate({
  greetingName,
  today,
  items: pItems,
  overdue: pOverdue,
  openTasks: pOpenTasks,
  plannerGoals: pPlannerGoals,
}: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // Local state mirrors the server: every add/pull/remove/log updates it from
  // the authoritative row the action returns (not a guess). The layout re-checks
  // the gate only when "Start my day" calls router.refresh().
  const [items, setItems] = React.useState(pItems);
  const [openTasks, setOpenTasks] = React.useState(pOpenTasks);
  const [plannerGoals, setPlannerGoals] = React.useState(pPlannerGoals);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState(false);
  const [active, setActive] = React.useState<DragData | null>(null);

  const count = items.length;
  // The day is "planned" once at least ONE item exists (assigned task OR personal
  // item) — matches the new attendance gate. No more mandatory 5.
  const met = count >= 1;
  const remaining = met ? 0 : 1;
  const slotCount = Math.max(3, count);

  // Goals that BLOCK the day: open (cumulative < 100) AND no today's progress
  // logged yet (neither a % nor a note).
  const blockingGoals = React.useMemo(
    () =>
      plannerGoals.filter(
        (g) => g.pctDone < 100 && g.todayPct == null && (g.todayNote ?? "").trim() === "",
      ),
    [plannerGoals],
  );
  const goalsToLog = blockingGoals.length;

  // The gate's contract (the server gate is authoritative; this just drives the
  // CTA enable + "what's missing" hint).
  const ready = met && goalsToLog === 0;

  const sensors = useSensors(
    // Mouse: a 6px move starts a drag, so clicking the +Add button still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to drag, so normal scroll still works on the panels.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  async function act(
    key: string,
    fn: () => Promise<Res>,
    onOk: (r: { ok: true; [k: string]: unknown }) => void,
    onFail?: (error: string) => void,
  ) {
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) {
        if (onFail) onFail(res.error);
        else fireToast({ message: res.error, type: "error" });
        return;
      }
      onOk(res);
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Something went wrong.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  // ── Pull a weekly goal into today's commitments. ──
  const onPullGoal = (goalId: string) =>
    act(
      `goal:${goalId}`,
      () => pullGoalToToday(goalId),
      (r) => {
        const item = (r as unknown as { item: DailyItem | null }).item;
        // Mark it as pulled either way (real new row OR already-on-today no-op).
        setPlannerGoals((p) => p.map((g) => (g.id === goalId ? { ...g, pulledToday: true } : g)));
        if (item) setItems((p) => [...p, item]);
      },
      (error) => {
        fireToast({ message: error, type: "error" });
        // On failure pull fresh server data so the panels resync.
        router.refresh();
      },
    );

  // ── Pull an open task into today's commitments. ──
  const onPullTask = (taskId: string) =>
    act(
      `task:${taskId}`,
      () => pullTaskToToday(taskId),
      (r) => {
        const item = (r as unknown as { item: DailyItem | null }).item;
        if (item) {
          setItems((p) => [...p, item]);
          setOpenTasks((p) => p.filter((t) => t.id !== taskId));
        } else {
          // Already on today's list — drop it from the panel, tell the user.
          setOpenTasks((p) => p.filter((t) => t.id !== taskId));
          fireToast({ message: "That task is already on today's list.", type: "info" });
        }
      },
      (error) => {
        fireToast({ message: error, type: "error" });
        router.refresh();
      },
    );

  // ── Log today's progress on a goal (% and/or a one-line note). ──
  const onLogGoal = (goalId: string, pct: number | null, note: string) =>
    act(
      `log:${goalId}`,
      () => upsertGoalActual({ goalId, pct, note: note || undefined }),
      () => {
        setPlannerGoals((p) =>
          p.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  todayPct: pct,
                  todayNote: note.trim() || null,
                  pctDone: pct != null ? pct : g.pctDone,
                }
              : g,
          ),
        );
        fireToast({ message: "Today's progress logged.", type: "success" });
      },
    );

  // ── One-tap: log EVERY still-unlogged open goal at its current %. ──
  const onLogAll = () =>
    act(
      "logall",
      () => logAllGoalActuals(),
      (r) => {
        const logged = (r as unknown as { logged: { goalId: string; pct: number }[] }).logged ?? [];
        const byId = new Map(logged.map((l) => [l.goalId, l.pct]));
        setPlannerGoals((p) =>
          p.map((g) => (byId.has(g.id) ? { ...g, todayPct: byId.get(g.id)! } : g)),
        );
        fireToast({
          message:
            logged.length > 0
              ? `Logged ${logged.length} goal${logged.length === 1 ? "" : "s"} at current progress.`
              : "All goals already logged.",
          type: "success",
        });
      },
    );

  const onAutoFill = () =>
    act(
      "autofill",
      () => autoFillFive(),
      () => {
        // The action inserts rows server-side; pull fresh data so the ledger
        // reflects exactly what landed (no guessing the count).
        router.refresh();
      },
    );

  const onAddStandalone = (title: string, clear: () => void) => {
    const t = title.trim();
    if (t.length < 2) return;
    const fd = new FormData();
    fd.set("title", t);
    clear();
    act(
      "add",
      () => addStandaloneItem(fd),
      (r) => {
        const item = (r as unknown as { item: DailyItem }).item;
        if (item) setItems((p) => [...p, item]);
      },
    );
  };

  const onRemove = (it: DailyItem) =>
    act(it.id, () => removeItem(it.id), () => setItems((p) => p.filter((x) => x.id !== it.id)));

  const onMoveOverdue = () =>
    act("overdue", () => moveOverdueToToday(), (r) => {
      setItems((p) => [...p, ...(r as unknown as { items: DailyItem[] }).items]);
      setOverdue([]);
    });

  function startDay() {
    // The server layout re-checks the gate on refresh and drops it. If the CTA
    // logic is ever off, worst case the gate just re-shows — never hard-fail.
    if (!ready || entering) return;
    setEntering(true);
    router.refresh();
    // Fail-safe: if the refresh doesn't drop the gate within a few seconds,
    // re-enable so the user can never be trapped on a spinner.
    window.setTimeout(() => setEntering(false), 4000);
  }

  function onDragStart(e: DragStartEvent) {
    setActive((e.active.data.current as DragData | undefined) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    const a = active;
    setActive(null);
    if (!a || !e.over || String(e.over.id) !== DROP_ID) return;
    if (a.kind === "goal") onPullGoal(a.id);
    else onPullTask(a.id);
  }

  const missingHint: string[] = [];
  if (!met) missingHint.push("Add at least one item (or get a task assigned)");
  if (goalsToLog > 0)
    missingHint.push(`Log today's progress on ${goalsToLog} goal${goalsToLog === 1 ? "" : "s"}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <main
        className="relative min-h-[100svh] w-full"
        style={{
          background:
            "linear-gradient(180deg, var(--color-surface-soft) 0%, color-mix(in srgb, var(--color-surface-track) 60%, var(--color-surface-soft)) 100%)",
          color: "var(--color-ink-strong)",
        }}
      >
        <div className="mx-auto w-full max-w-[1280px] px-8 max-md:px-4 py-8 max-md:py-6">
          {/* ── HERO ── */}
          <header className="wg-rise">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <span
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--color-altus-red-deep)" }}
              >
                Plan your day{greetingName ? ` — ${greetingName}` : ""}
              </span>
              <span
                className="text-[12.5px] font-semibold tabular-nums"
                style={{ color: "var(--color-ink-subtle)" }}
              >
                {today.weekday} · {today.date}
              </span>
            </div>
            <h1
              className="mt-3 font-bold"
              style={{
                color: "var(--color-ink-strong)",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 3.2vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              Plan what you&apos;ll get done today
            </h1>
            <p
              className="mt-2 max-w-[58ch] font-medium"
              style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-ink-muted)" }}
            >
              Tasks your manager assigned appear automatically. Add any personal items or pull from
              your weekly goals, log today&apos;s goal progress, then start.
            </p>
          </header>

          {/* ── TWO COLUMNS — stack on mobile <768px ── */}
          <div className="mt-7 grid grid-cols-[1.35fr_1fr] gap-7 max-md:grid-cols-1 max-md:gap-6 items-start">
            {/* ════ LEFT: Today's 5 Commitments (focal + drop target) ════ */}
            <CommitmentsColumn
              items={items}
              slotCount={slotCount}
              count={count}
              met={met}
              remaining={remaining}
              ready={ready}
              entering={entering}
              missingHint={missingHint}
              overdue={overdue}
              busyId={busyId}
              reduce={!!reduce}
              activeDrag={active}
              onRemove={onRemove}
              onAutoFill={onAutoFill}
              onAddStandalone={onAddStandalone}
              onMoveOverdue={onMoveOverdue}
              onStartDay={startDay}
            />

            {/* ════ RIGHT: two stacked draggable panels ════ */}
            <div className="flex flex-col gap-6 min-w-0">
              <GoalsPanel
                goals={plannerGoals}
                busyId={busyId}
                reduce={!!reduce}
                onPull={onPullGoal}
                onLog={onLogGoal}
                blockingCount={goalsToLog}
                onLogAll={onLogAll}
              />
              {/* Assigned tasks now flow into the day automatically — the manual
                  "Tasks" pull panel (which copied tasks) has been retired. */}
            </div>
          </div>
        </div>
      </main>

      {/* Floating drag preview. */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
        {active ? (
          <div
            className="w-[280px] rotate-2 cursor-grabbing rounded-xl border bg-surface-card p-3 shadow-2xl"
            style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)" }}
          >
            <div className="flex items-center gap-2">
              {active.kind === "goal" ? (
                <Target size={15} strokeWidth={2.4} style={{ color: "var(--color-altus-red)" }} />
              ) : (
                <ListChecks size={15} strokeWidth={2.4} style={{ color: "var(--color-altus-red)" }} />
              )}
              <span
                className="block font-semibold text-ink-strong"
                style={{ fontSize: 14, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
              >
                {active.label}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   LEFT — Today's commitments (the focus; the drop target)
   ════════════════════════════════════════════════════════════════════════ */
function CommitmentsColumn({
  items,
  slotCount,
  count,
  met,
  remaining,
  ready,
  entering,
  missingHint,
  overdue,
  busyId,
  reduce,
  activeDrag,
  onRemove,
  onAutoFill,
  onAddStandalone,
  onMoveOverdue,
  onStartDay,
}: {
  items: DailyItem[];
  slotCount: number;
  count: number;
  met: boolean;
  remaining: number;
  ready: boolean;
  entering: boolean;
  missingHint: string[];
  overdue: OverdueItem[];
  busyId: string | null;
  reduce: boolean;
  activeDrag: DragData | null;
  onRemove: (it: DailyItem) => void;
  onAutoFill: () => void;
  onAddStandalone: (title: string, clear: () => void) => void;
  onMoveOverdue: () => void;
  onStartDay: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ID });
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Active while a goal/task is mid-drag (highlight the whole column as a target).
  const dragging = activeDrag != null;

  return (
    <section
      ref={setNodeRef}
      className="wg-rise min-w-0 rounded-section border p-6 max-md:p-5 transition-colors"
      style={{
        background: "var(--color-surface-card)",
        borderColor: isOver
          ? "var(--color-altus-red)"
          : dragging
            ? "color-mix(in srgb, var(--color-altus-red) 45%, var(--color-hairline))"
            : "var(--color-hairline)",
        boxShadow: isOver
          ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 14%, transparent), 0 1px 3px rgba(15,23,42,0.05)"
          : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 20, letterSpacing: "-0.01em" }}>
          Today&apos;s plan
        </h2>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold tabular-nums"
          style={{
            background: met
              ? "color-mix(in srgb, var(--color-green) 12%, transparent)"
              : "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
            color: met ? "var(--color-green-deep)" : "var(--color-altus-red-deep)",
          }}
        >
          {count === 0 ? "Nothing planned yet" : `${count} planned`}
        </span>
      </div>

      {/* Numbered slots — filled commitments + empty placeholders up to MIN. */}
      <ul className="space-y-0">
        <AnimatePresence initial={false}>
          {Array.from({ length: slotCount }).map((_, i) => {
            const it = items[i];
            return (
              <CommitmentLine
                key={it ? it.id : `slot-${i}`}
                index={i + 1}
                item={it}
                reduce={reduce}
                busy={it ? busyId === it.id : false}
                onRemove={it && it.source !== "assigned" ? () => onRemove(it) : undefined}
              />
            );
          })}
        </AnimatePresence>
      </ul>

      {dragging && (
        <p
          className="mt-3 rounded-xl border border-dashed py-3 text-center text-[13px] font-bold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)",
            color: "var(--color-altus-red-deep)",
            background: "color-mix(in srgb, var(--color-altus-red) 5%, transparent)",
          }}
        >
          Drop here to commit it to today
        </p>
      )}

      {met && (
        <p className="mt-4 text-[12.5px] font-semibold text-ink-subtle">
          Your day is planned — add more below any time.
        </p>
      )}

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          onAddStandalone(inputRef.current?.value ?? "", () => {
            if (inputRef.current) inputRef.current.value = "";
            inputRef.current?.focus();
          });
        }}
      >
        <div
          className="flex items-center gap-2.5 rounded-2xl border-2 bg-surface-card px-3 py-2 transition-colors focus-within:border-[var(--color-altus-red)]"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
        >
          <span
            aria-hidden
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
          >
            <Plus size={18} strokeWidth={2.6} />
          </span>
          <input
            ref={inputRef}
            type="text"
            maxLength={280}
            autoComplete="off"
            aria-label="Type your own commitment for today"
            placeholder="Type your own…"
            className={`flex-1 min-w-0 bg-transparent text-[15.5px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle py-2 ${FOCUS_RING}`}
          />
          <button
            type="submit"
            disabled={busyId === "add"}
            className={`wg-btn inline-flex shrink-0 items-center gap-1.5 rounded-xl py-2.5 px-5 text-[14px] font-bold text-white cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)" }}
          >
            {busyId === "add" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.8} />}
            Add
          </button>
        </div>
      </form>

      {/* ── Overdue carry-over strip ── */}
      <AnimatePresence>
        {overdue.length > 0 && (
          <motion.button
            type="button"
            onClick={onMoveOverdue}
            disabled={busyId === "overdue"}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className={`wg-btn mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
            style={{
              background: "color-mix(in srgb, var(--color-amber) 12%, transparent)",
              color: "var(--color-amber-deep)",
              border: "1px solid color-mix(in srgb, var(--color-amber) 36%, transparent)",
            }}
          >
            {busyId === "overdue" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CornerUpRight size={14} strokeWidth={2.6} />
            )}
            Roll over {overdue.length} unfinished item{overdue.length === 1 ? "" : "s"}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Start my day → ── */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--color-hairline)" }}>
        <button
          type="button"
          onClick={onStartDay}
          disabled={!ready || entering}
          aria-describedby={ready ? undefined : "start-missing"}
          className={`wg-btn ${ready ? "wg-sheen" : ""} inline-flex w-full items-center justify-center gap-2 rounded-xl py-4 px-6 text-[16px] font-bold cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`}
          style={
            ready
              ? {
                  background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  color: "#fff",
                  boxShadow: "0 14px 34px -10px rgba(225,6,0,0.6)",
                }
              : {
                  background: "var(--color-surface-track)",
                  color: "var(--color-ink-subtle)",
                }
          }
        >
          {entering ? <Loader2 size={18} className="animate-spin" /> : null}
          Start my day <ArrowRight size={18} strokeWidth={2.6} />
        </button>
        {!ready && missingHint.length > 0 && (
          <p id="start-missing" className="mt-2.5 text-center text-[13px] font-semibold text-ink-subtle">
            {missingHint.join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

/* ── one commitment line — filled commitment or empty numbered slot ── */
function CommitmentLine({
  index,
  item,
  busy,
  reduce,
  onRemove,
}: {
  index: number;
  item?: DailyItem;
  busy: boolean;
  reduce: boolean;
  onRemove?: () => void;
}) {
  // Origin badge: Goal (goalId) · Task (taskId) · Own (neither).
  const originLabel = item
    ? item.goalId
      ? "Goal"
      : item.taskId
        ? "Task"
        : "Own"
    : null;
  const isGoal = item?.goalId != null;
  const isTask = item?.taskId != null;

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="group flex items-center gap-4 py-3"
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
    >
      {/* numbered slot / committed check */}
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full tabular-nums text-[14px] font-bold"
        style={
          item
            ? {
                background: isGoal
                  ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                  : "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
                color: "#fff",
              }
            : {
                border: "1.5px dashed var(--color-hairline-strong)",
                color: "var(--color-ink-subtle)",
              }
        }
      >
        {item ? <Check size={15} strokeWidth={3} /> : index}
      </span>

      {item ? (
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-ink-strong break-words" style={{ fontSize: 16, overflowWrap: "anywhere" }}>
            {item.title}
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{
              color: isGoal
                ? "var(--color-altus-red)"
                : isTask
                  ? "var(--color-green-deep)"
                  : "var(--color-ink-subtle)",
            }}
          >
            {originLabel}
            {item.client || item.subject ? ` · ${[item.client, item.subject].filter(Boolean).join(" · ")}` : ""}
          </span>
        </span>
      ) : (
        <span className="flex-1 min-w-0 font-medium text-ink-subtle" style={{ fontSize: 15 }}>
          Drag a goal or task here, or type your own…
        </span>
      )}

      {/* remove ✕ — revealed on hover/focus, always tappable on touch */}
      <span className="shrink-0 inline-flex size-8 items-center justify-center">
        {item && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove "${item.title}"`}
            className={`inline-flex size-8 items-center justify-center rounded-md text-ink-subtle hover:text-altus-red transition-opacity disabled:opacity-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100 ${FOCUS_RING}`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <X size={17} strokeWidth={2.4} />}
          </button>
        )}
      </span>
    </motion.li>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   RIGHT — panel chrome shared by Weekly Goals + Tasks
   ════════════════════════════════════════════════════════════════════════ */
function Panel({
  title,
  hint,
  delay,
  children,
}: {
  title: string;
  hint: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="wg-rise rounded-section border border-hairline bg-surface-card p-5"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: `${delay}ms` }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-bold text-ink-strong" style={{ fontSize: 17 }}>
          {title}
        </h3>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{hint}</span>
      </div>
      {children}
    </section>
  );
}

/** "Show more" toggle for the goals/tasks lists (first 3 + the rest). */
function useShowMore<T>(rows: T[], initial = 3) {
  const [open, setOpen] = React.useState(false);
  const shown = open ? rows : rows.slice(0, initial);
  const hidden = rows.length - shown.length;
  return { shown, hidden, open, setOpen };
}

function ShowMoreButton({
  hidden,
  open,
  onToggle,
}: {
  hidden: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (hidden <= 0 && !open) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold text-ink-soft hover:text-ink-strong transition-colors ${FOCUS_RING}`}
    >
      <ChevronDown
        size={14}
        strokeWidth={2.6}
        className="transition-transform"
        style={{ transform: open ? "rotate(180deg)" : "none" }}
      />
      {open ? "Show less" : `Show ${hidden} more`}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   RIGHT — Weekly Goals panel (draggable rows + inline today's-progress form)
   ════════════════════════════════════════════════════════════════════════ */
function GoalsPanel({
  goals,
  busyId,
  reduce,
  onPull,
  onLog,
  blockingCount,
  onLogAll,
}: {
  goals: PlannerGoal[];
  busyId: string | null;
  reduce: boolean;
  onPull: (goalId: string) => void;
  onLog: (goalId: string, pct: number | null, note: string) => void;
  blockingCount: number;
  onLogAll: () => void;
}) {
  const { shown, hidden, open, setOpen } = useShowMore(goals);
  const loggingAll = busyId === "logall";

  return (
    <Panel title="Weekly Goals" hint="drag or log" delay={120}>
      {goals.length === 0 ? (
        <p className="font-medium py-6 text-center text-ink-subtle" style={{ fontSize: 13.5 }}>
          No weekly goals this week.
        </p>
      ) : (
        <>
          {/* One-tap clear for the goal gate when several are still unlogged —
              records each at its CURRENT %, so it never fakes progress. */}
          {blockingCount > 0 && (
            <button
              type="button"
              onClick={onLogAll}
              disabled={loggingAll}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[14px] font-bold transition-colors disabled:opacity-60"
              style={{
                borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, transparent)",
                background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                color: "var(--color-altus-red-deep)",
              }}
            >
              {loggingAll
                ? "Logging…"
                : `Log all ${blockingCount} at current % — clears the gate`}
            </button>
          )}
        <ul className="space-y-2.5">
          {shown.map((g) => (
            <GoalRow
              key={g.id}
              g={g}
              busyId={busyId}
              reduce={reduce}
              onPull={onPull}
              onLog={onLog}
            />
          ))}
          {(hidden > 0 || open) && (
            <li>
              <ShowMoreButton hidden={hidden} open={open} onToggle={() => setOpen((v) => !v)} />
            </li>
          )}
        </ul>
        </>
      )}
    </Panel>
  );
}

function GoalRow({
  g,
  busyId,
  reduce,
  onPull,
  onLog,
}: {
  g: PlannerGoal;
  busyId: string | null;
  reduce: boolean;
  onPull: (goalId: string) => void;
  onLog: (goalId: string, pct: number | null, note: string) => void;
}) {
  const label = g.targetDone || g.subject || g.client || "Weekly goal";
  const meta = [g.client, g.subject].filter(Boolean).join(" · ");
  const open = g.pctDone < 100;
  // BLOCKS the day: open goal with no today's progress logged yet.
  const blocks = open && g.todayPct == null && (g.todayNote ?? "").trim() === "";
  const logging = busyId === `log:${g.id}`;
  const pulling = busyId === `goal:${g.id}`;

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `goal:${g.id}`,
    data: { kind: "goal", id: g.id, label } satisfies DragData,
  });

  const [pct, setPct] = React.useState<string>(g.todayPct != null ? String(g.todayPct) : "");
  const [note, setNote] = React.useState<string>(g.todayNote ?? "");

  return (
    <motion.li
      layout={!reduce}
      className="rounded-xl border p-3"
      style={{
        background: "var(--color-surface-card)",
        borderColor: blocks
          ? "color-mix(in srgb, var(--color-altus-red) 55%, transparent)"
          : "var(--color-hairline)",
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        {/* drag handle (mouse) */}
        <button
          type="button"
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag "${label}" to today`}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink-strong touch-none"
        >
          <GripVertical size={16} strokeWidth={2.2} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-ink-strong" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
                {label}
              </div>
              {meta && (
                <div className="text-ink-subtle" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                  {meta}
                </div>
              )}
            </div>
            {/* +Add (keyboard/touch path) — or ✓ added */}
            {g.pulledToday ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
                style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}
              >
                <Check size={13} strokeWidth={3} /> Added
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onPull(g.id)}
                disabled={pulling}
                aria-label={`Add "${label}" to today`}
                className={`wg-btn inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red-deep)" }}
              >
                {pulling ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} strokeWidth={2.8} />}
                Add
              </button>
            )}
          </div>

          {/* target + cumulative % bar */}
          {g.targetDone && g.targetDone !== label && (
            <div className="mt-1.5 text-ink-subtle" style={{ fontSize: 12 }}>
              Target: {g.targetDone}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span
              aria-hidden
              className="block flex-1 rounded-full overflow-hidden"
              style={{ height: 5, background: "var(--color-hairline)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, g.pctDone))}%`,
                  background: open ? "var(--color-altus-red)" : "var(--color-green)",
                }}
              />
            </span>
            <span className="tabular-nums font-bold" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
              {g.pctDone}%
            </span>
          </div>

          {/* inline today's progress mini-form */}
          <form
            className="mt-2.5 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = pct.trim() === "" ? null : Math.max(0, Math.min(100, Math.round(Number(pct))));
              const num = n != null && !Number.isNaN(n) ? n : null;
              if (num == null && note.trim() === "") {
                fireToast({ message: "Add today's progress (a % or a note).", type: "error" });
                return;
              }
              onLog(g.id, num, note.trim());
            }}
          >
            {/* One-tap % presets — same quick control as the board's cards. */}
            <div className="grid grid-cols-5 gap-1">
              {[0, 25, 50, 75, 100].map((p) => {
                const active = pct !== "" && Math.round(Number(pct)) === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPct(String(p))}
                    aria-pressed={active}
                    className={`rounded-md py-1 text-center text-[12px] font-black tabular-nums transition-colors ${FOCUS_RING}`}
                    style={
                      active
                        ? { background: "var(--color-altus-red)", color: "#fff", border: "1px solid var(--color-altus-red)" }
                        : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)", border: "1px solid var(--color-hairline-strong)" }
                    }
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 rounded-lg border px-2 py-1.5"
                style={{ borderColor: blocks ? "color-mix(in srgb, var(--color-altus-red) 45%, transparent)" : "var(--color-hairline-strong)" }}
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  aria-label={`Today's progress % on "${label}"`}
                  placeholder="0"
                  className={`w-12 bg-transparent text-right text-[13px] font-bold tabular-nums text-ink-strong outline-none placeholder:text-ink-subtle ${FOCUS_RING}`}
                />
                <span className="text-[12px] font-bold text-ink-subtle">%</span>
              </div>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                aria-label={`Today's note on "${label}"`}
                placeholder="note (optional)"
                className={`min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <button
                type="submit"
                disabled={logging}
                className={`wg-btn inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {logging ? <Loader2 size={13} className="animate-spin" /> : "Log"}
              </button>
            </div>
          </form>
          {blocks && (
            <p className="mt-1.5 text-[11.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
              Log today&apos;s progress to start your day.
            </p>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   RIGHT — Tasks panel (draggable rows + +Add)
   ════════════════════════════════════════════════════════════════════════ */
function TasksPanel({
  tasks,
  busyId,
  reduce,
  onPull,
}: {
  tasks: OpenTaskOption[];
  busyId: string | null;
  reduce: boolean;
  onPull: (taskId: string) => void;
}) {
  const { shown, hidden, open, setOpen } = useShowMore(tasks);

  return (
    <Panel title="Tasks" hint="drag or add" delay={180}>
      {tasks.length === 0 ? (
        <p className="font-medium py-6 text-center text-ink-subtle" style={{ fontSize: 13.5 }}>
          No open tasks to pull.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => (
            <TaskRow key={t.id} t={t} busyId={busyId} reduce={reduce} onPull={onPull} />
          ))}
          {(hidden > 0 || open) && (
            <li>
              <ShowMoreButton hidden={hidden} open={open} onToggle={() => setOpen((v) => !v)} />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function TaskRow({
  t,
  busyId,
  reduce,
  onPull,
}: {
  t: OpenTaskOption;
  busyId: string | null;
  reduce: boolean;
  onPull: (taskId: string) => void;
}) {
  const label = t.title;
  const meta = [t.client, t.subject].filter(Boolean).join(" · ");
  const pulling = busyId === `task:${t.id}`;

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `task:${t.id}`,
    data: { kind: "task", id: t.id, label } satisfies DragData,
  });

  return (
    <motion.li
      layout={!reduce}
      className="flex items-center gap-2.5 rounded-xl border border-hairline p-3"
      style={{ background: "var(--color-surface-card)", opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        type="button"
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag "${label}" to today`}
        className="shrink-0 cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink-strong touch-none"
      >
        <GripVertical size={16} strokeWidth={2.2} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink-strong" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
          {t.taskNo != null && (
            <span className="tabular-nums text-ink-subtle">#{t.taskNo} · </span>
          )}
          {label}
        </div>
        {meta && (
          <div className="text-ink-subtle" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
            {meta}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPull(t.id)}
        disabled={pulling}
        aria-label={`Add "${label}" to today`}
        className={`wg-btn inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red-deep)" }}
      >
        {pulling ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} strokeWidth={2.8} />}
        Add
      </button>
    </motion.li>
  );
}
