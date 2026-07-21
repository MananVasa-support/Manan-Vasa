"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarCheck2,
  ChevronDown,
  History,
  Layers,
  ListTodo,
  Loader2,
  Plus,
  Sparkles,
  Sunrise,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { SourceCard } from "./source-card";
import { PlanItemCard } from "./plan-item-card";
import { DayReview } from "./day-review";
import { GHOST_ID, type PlanItem, type PlanPhase, type PlanSources, type SourceItem, type SourceKind } from "./types";
import {
  addWeeklyGoalToPlan,
  addCascadeGoalToPlan,
  addTaskToPlan,
  addUnfinishedToPlan,
  addAdhocToPlan,
  abandonTask,
  reorderPlan,
  removePlanItem,
  startMyDay,
} from "@/app/(app)/goals/plan/actions";

/** Sources that de-dupe against today's plan (flip to "added" once pulled). */
const DEDUPE_KINDS: SourceKind[] = ["weekly", "task", "unfinished"];

interface Props {
  initialPlan: PlanItem[];
  sources: PlanSources;
  minItems: number;
  isManager: boolean;
  initialPhase: PlanPhase;
}

// Goals module identity (amber-gold) — mirrors MODULE_THEME.goals. The planner
// lives in the amber room, so every accent (drop zone, pips, CTA, focus rings)
// reads amber, not WMS red.
const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

const PLAN_DROP_ID = "plan-drop";
const nonGhost = (items: PlanItem[]) => items.filter((i) => i.id !== GHOST_ID);

export function PlanBoard({ initialPlan, sources, minItems, isManager, initialPhase }: Props) {
  const [phase, setPhase] = React.useState<PlanPhase>(initialPhase);
  const [starting, setStarting] = React.useState(false);
  const [plan, setPlan] = React.useState<PlanItem[]>(initialPlan);
  const [src, setSrc] = React.useState<PlanSources>(sources);
  const [active, setActive] = React.useState<
    | { type: "source"; title: string; subtitle: string | null; kind: SourceKind }
    | { type: "plan"; item: PlanItem }
    | null
  >(null);
  const [, startTransition] = React.useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Stable SSR-safe DndContext id — avoids the dnd-kit hydration mismatch on
  // `aria-describedby` (module-global counter drifts server↔client).
  const dndId = React.useId();

  const committed = React.useMemo(() => nonGhost(plan), [plan]);
  const count = committed.length;
  const met = count >= minItems;

  /** "Start my day" — persist the started stamp, then flip to the active phase. */
  const onStartDay = React.useCallback(() => {
    if (!met || starting) return;
    setStarting(true);
    void startMyDay()
      .then((r) => {
        if (r.ok) setPhase("active");
        else fireToast({ message: r.error, type: "error" });
      })
      .finally(() => setStarting(false));
  }, [met, starting]);

  /** Persist the current visual order (fire-and-forget, toast on failure). */
  const persistOrder = React.useCallback((items: PlanItem[]) => {
    const ids = nonGhost(items).map((i) => i.id);
    startTransition(async () => {
      const res = await reorderPlan(ids);
      if (!res.ok) fireToast({ message: res.error });
    });
  }, []);

  /** Flip a dedupe-able source (weekly/task) to "added" in its window. */
  const markSource = React.useCallback((kind: SourceKind, id: string, added: boolean) => {
    setSrc((prev) => ({
      ...prev,
      [kind]: prev[kind].map((s) => (s.id === id ? { ...s, added } : s)),
    }));
  }, []);

  /** Shared add path — used by BOTH drag-drop and the "+ Add to today" buttons. */
  const commitAdd = React.useCallback(
    async (kind: SourceKind, sourceId: string, title: string, subtitle: string | null, atIndex?: number) => {
      const tempId = `temp:${crypto.randomUUID()}`;
      const optimistic: PlanItem = {
        id: tempId,
        title,
        subtitle,
        origin: kind === "weekly" ? "goal_related" : "standalone",
        kind,
        done: false,
      };
      let inserted: PlanItem[] = [];
      setPlan((prev) => {
        const base = nonGhost(prev);
        const idx = atIndex == null ? base.length : Math.min(atIndex, base.length);
        base.splice(idx, 0, optimistic);
        inserted = base;
        return base;
      });
      if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, true);

      const res =
        kind === "weekly"
          ? await addWeeklyGoalToPlan(sourceId)
          : kind === "task"
            ? await addTaskToPlan(sourceId)
            : kind === "unfinished"
              ? await addUnfinishedToPlan(sourceId)
              : await addCascadeGoalToPlan(sourceId);

      if (!res.ok) {
        setPlan((prev) => prev.filter((i) => i.id !== tempId));
        if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, false);
        fireToast({ message: res.error });
        return;
      }
      if (!res.item) {
        // No-op (already on today) — drop the optimistic row silently.
        setPlan((prev) => prev.filter((i) => i.id !== tempId));
        return;
      }
      const real = res.item;
      const next = inserted.map((i) => (i.id === tempId ? real : i));
      setPlan(next);
      persistOrder(next);
    },
    [markSource, persistOrder],
  );

  const onAddSource = React.useCallback(
    (item: SourceItem) => void commitAdd(item.kind, item.id, item.title, item.subtitle),
    [commitAdd],
  );

  /** Abandon a task → Recycle Bin. Optimistically drop it from its source list. */
  const onAbandon = React.useCallback((item: SourceItem) => {
    if (!item.taskId) return;
    setSrc((prev) => ({ ...prev, [item.kind]: prev[item.kind].filter((s) => s.id !== item.id) }));
    startTransition(async () => {
      const res = await abandonTask(item.taskId!);
      if (!res.ok) fireToast({ message: res.error });
    });
  }, []);

  const onRemove = React.useCallback((id: string) => {
    setPlan((prev) => prev.filter((i) => i.id !== id));
    startTransition(async () => {
      const res = await removePlanItem(id);
      if (!res.ok) fireToast({ message: res.error });
    });
  }, []);

  const onAddAdhoc = React.useCallback(async (title: string) => {
    const tempId = `temp:${crypto.randomUUID()}`;
    setPlan((prev) => [...nonGhost(prev), { id: tempId, title, subtitle: null, origin: "standalone", kind: "adhoc", done: false }]);
    const res = await addAdhocToPlan(title);
    if (!res.ok) {
      setPlan((prev) => prev.filter((i) => i.id !== tempId));
      fireToast({ message: res.error });
      return;
    }
    setPlan((prev) => prev.map((i) => (i.id === tempId ? res.item : i)));
  }, []);

  // ---- Drag lifecycle ----------------------------------------------------
  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current;
    if (data?.type === "source") {
      setActive({ type: "source", title: data.title, subtitle: data.subtitle ?? null, kind: data.kind });
    } else {
      const item = plan.find((i) => i.id === e.active.id);
      if (item) setActive({ type: "plan", item });
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (a.data.current?.type !== "source") return; // reorder handled on end
    if (!over) {
      setPlan((prev) => prev.filter((i) => i.id !== GHOST_ID));
      return;
    }
    const overId = String(over.id);
    setPlan((prev) => {
      const base = nonGhost(prev);
      let idx = base.length;
      if (overId !== PLAN_DROP_ID) {
        const i = base.findIndex((x) => x.id === overId);
        if (i >= 0) idx = i;
      }
      const ghost: PlanItem = {
        id: GHOST_ID,
        ghost: true,
        title: a.data.current?.title ?? "New commitment",
        subtitle: a.data.current?.subtitle ?? null,
        origin: "standalone",
        kind: a.data.current?.kind ?? "adhoc",
        done: false,
      };
      base.splice(idx, 0, ghost);
      return base;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActive(null);
    if (a.data.current?.type === "source") {
      const ghostIndex = plan.findIndex((i) => i.id === GHOST_ID);
      setPlan((prev) => prev.filter((i) => i.id !== GHOST_ID));
      if (ghostIndex >= 0) {
        void commitAdd(
          a.data.current.kind,
          a.data.current.sourceId,
          a.data.current.title,
          a.data.current.subtitle ?? null,
          ghostIndex,
        );
      }
      return;
    }
    if (over && a.id !== over.id) {
      const oldIndex = plan.findIndex((i) => i.id === a.id);
      const newIndex = plan.findIndex((i) => i.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        const next = arrayMove(plan, oldIndex, newIndex);
        setPlan(next);
        persistOrder(next);
      }
    }
  }

  function onDragCancel() {
    setActive(null);
    setPlan((prev) => prev.filter((i) => i.id !== GHOST_ID));
  }

  // Non-plan phases (active / close-out / closed) show the review half — same
  // commitments, no pull panels — on the SAME page.
  if (phase !== "plan") {
    return (
      <DayReview
        phase={phase}
        items={committed}
        onToCloseout={() => setPhase("closeout")}
        onBackToPlan={() => setPhase("plan")}
        onClosed={() => setPhase("closed")}
        onReopened={() => setPhase("plan")}
      />
    );
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* Sir's four verticals: a compact plan on the left, then the three pull
          boxes — Weekly Goals, Unfinished, and your To-Do (filtered). Drag a card
          left, or tap +. Stacks to 2 then 1 column on narrower screens. */}
      <div className="grid gap-4 grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-2 max-sm:grid-cols-1">
        {/* 1 — Today's Plan (compact) */}
        <PlanColumn
          plan={plan}
          count={count}
          minItems={minItems}
          met={met}
          isManager={isManager}
          starting={starting}
          onRemove={onRemove}
          onAddAdhoc={onAddAdhoc}
          onStart={onStartDay}
        />

        {/* 2 — Weekly Goals */}
        <SourceWindow
          title="Weekly goals"
          subtitle="What your manager set this week"
          icon={<Layers size={16} />}
          delay={60}
          sections={[{ key: "weekly", label: "This week", items: src.weekly }]}
          onAdd={onAddSource}
        />

        {/* 3 — Previously Unfinished */}
        <SourceWindow
          title="Unfinished"
          subtitle="Carried over from earlier days"
          icon={<History size={16} />}
          delay={100}
          sections={[{ key: "unfinished", label: "Not done yet", items: src.unfinished }]}
          onAdd={onAddSource}
          onAbandon={onAbandon}
        />

        {/* 4 — To-Do list (overdue + due within 7 days), with a filter */}
        <SourceWindow
          title="To-do list"
          subtitle="Overdue + due within 7 days"
          icon={<ListTodo size={16} />}
          delay={140}
          filterable
          sections={[{ key: "task", label: "Pending", items: src.task }]}
          onAdd={onAddSource}
          onAbandon={onAbandon}
        />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {active ? (
          <div className="flex items-center gap-2 rounded-chip border border-hairline-strong bg-surface-card px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
            <Sparkles size={15} style={{ color: GOALS_ACCENT }} />
            <span className="text-sm font-medium text-ink-strong">
              {active.type === "source" ? active.title : active.item.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ----------------------------------------------------------------------- */
/* Left column — the droppable, ordered plan                               */
/* ----------------------------------------------------------------------- */
function PlanColumn(props: {
  plan: PlanItem[];
  count: number;
  minItems: number;
  met: boolean;
  isManager: boolean;
  starting: boolean;
  onRemove: (id: string) => void;
  onAddAdhoc: (title: string) => void;
  onStart: () => void;
}) {
  const { plan, count, minItems, met, isManager, starting, onRemove, onAddAdhoc, onStart } = props;
  const { setNodeRef, isOver } = useDroppable({ id: PLAN_DROP_ID });
  const [draft, setDraft] = React.useState("");
  const reduce = useReducedMotion();

  const ids = React.useMemo(() => plan.map((i) => i.id), [plan]);
  const isEmpty = count === 0;
  // Breathe the drop zone in amber until the daily minimum is met (mirrors the
  // weekly-goals "add N more" nudge language). GPU shadow only, reduced-motion off.
  const nudge = !met && !isOver;

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t.length < 2) return;
    onAddAdhoc(t);
    setDraft("");
  }

  return (
    <section className="flex flex-col wg-rise">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-[0_4px_12px_rgba(124,45,18,0.28)]"
            style={{ background: GOALS_GRADIENT }}
          >
            <CalendarCheck2 size={16} />
          </span>
          <div className="min-w-0">
            <h2
              className="truncate text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em" }}
            >
              Today&apos;s Plan
            </h2>
            <p className="truncate text-[11px] text-ink-muted">What will you deliver today?</p>
          </div>
        </div>
        <PipMeter count={count} minItems={minItems} met={met} reduce={!!reduce} />
      </header>

      <motion.div
        ref={setNodeRef}
        animate={
          nudge && !reduce
            ? { boxShadow: ["0 0 0 0 rgba(225,6,0,0)", "0 0 0 5px rgba(225,6,0,0.12)", "0 0 0 0 rgba(225,6,0,0)"] }
            : { boxShadow: "0 0 0 0 rgba(225,6,0,0)" }
        }
        transition={nudge && !reduce ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.25 }}
        className="min-h-[190px] rounded-2xl border p-2.5 transition-colors"
        style={{
          borderStyle: isEmpty && !isOver ? "dashed" : "solid",
          borderColor: isOver
            ? `color-mix(in srgb, ${GOALS_ACCENT} 45%, transparent)`
            : isEmpty
              ? `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`
              : "var(--color-hairline)",
          background: isOver
            ? `color-mix(in srgb, ${GOALS_ACCENT} 5%, transparent)`
            : "color-mix(in srgb, var(--color-surface-soft) 60%, transparent)",
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {plan.map((item, i) => (
                <PlanItemCard key={item.id} item={item} index={item.ghost ? i : nonGhostIndex(plan, item.id)} onRemove={onRemove} />
              ))}
            </AnimatePresence>
          </ul>
        </SortableContext>

        {isEmpty ? (
          <div className="grid place-items-center gap-1.5 py-7 text-center">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{
                background: `color-mix(in srgb, ${GOALS_ACCENT} 10%, transparent)`,
                color: GOALS_ACCENT_DEEP,
              }}
            >
              <Sunrise size={19} />
            </span>
            <p className="max-w-[32ch] text-[13px] font-medium text-ink-soft">
              Drag a goal or task in from the right, or add a commitment below.
            </p>
            <p className="text-[11px] text-ink-muted">
              {minItems} to unlock your day.
            </p>
          </div>
        ) : null}

        <form onSubmit={submitDraft} className="mt-2.5 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a commitment…"
            aria-label="Add a commitment for today"
            maxLength={280}
            className="h-9 flex-1 rounded-chip border border-hairline bg-surface-card px-3 text-[13px] text-ink-strong placeholder:text-ink-muted/60 focus-visible:outline-2"
            style={{ outlineColor: GOALS_ACCENT }}
          />
          <button
            type="submit"
            disabled={draft.trim().length < 2}
            aria-label="Add commitment"
            className="wg-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-chip bg-ink-strong text-white disabled:opacity-40 focus-visible:outline-2"
            style={{ outlineColor: GOALS_ACCENT }}
          >
            <Plus size={16} />
          </button>
        </form>
      </motion.div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-muted">
          {met ? (
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: GOALS_ACCENT_DEEP }}>
              <Sparkles size={13} /> You&apos;re ready — have a focused day.
            </span>
          ) : (
            <>
              Plan at least{" "}
              <span className="font-bold tabular-nums" style={{ color: GOALS_ACCENT_DEEP }}>{minItems}</span>{" "}
              {isManager ? "items (manager minimum)" : "items"} to start.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={!met || starting}
          className="brand-btn wg-btn wg-sheen inline-flex h-10 shrink-0 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white shadow-[0_8px_22px_rgba(124,45,18,0.28)] disabled:opacity-40 disabled:shadow-none focus-visible:outline-2"
          style={{ background: GOALS_GRADIENT, outlineColor: GOALS_ACCENT }}
        >
          {starting ? <Loader2 size={15} className="animate-spin" /> : <Sunrise size={15} />} Start my day
        </button>
      </div>
    </section>
  );
}

function nonGhostIndex(plan: PlanItem[], id: string): number {
  return nonGhost(plan).findIndex((i) => i.id === id);
}

/** A pip meter for the daily minimum — each planned item lights an amber pip, so
 *  filling the minimum feels rewarding (the just-filled pip pops). */
function PipMeter({
  count,
  minItems,
  met,
  reduce,
}: {
  count: number;
  minItems: number;
  met: boolean;
  reduce: boolean;
}) {
  const filledCount = Math.min(count, minItems);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-card px-2.5 py-1"
      role="img"
      aria-label={`${count} of ${minItems} planned`}
    >
      <span className="inline-flex items-center gap-1" aria-hidden>
        {Array.from({ length: minItems }).map((_, i) => {
          const filled = i < filledCount;
          return (
            <span
              key={`${i}-${filled}`}
              className={"h-1.5 rounded-full transition-all " + (filled ? "w-5" : "w-2.5") + (filled && !reduce ? " wg-pip-pop" : "")}
              style={{
                background: filled ? GOALS_GRADIENT : "var(--color-surface-track)",
                animationDelay: filled && !reduce ? `${i * 60}ms` : undefined,
              }}
            />
          );
        })}
      </span>
      <span
        className="text-xs font-bold tabular-nums"
        style={{ color: met ? GOALS_ACCENT_DEEP : "var(--color-ink-muted)" }}
      >
        {count}/{minItems}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/* Right column — a source window with collapsible sections                */
/* ----------------------------------------------------------------------- */
type TaskFilter = "all" | "overdue" | "important";

function SourceWindow(props: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  delay?: number;
  filterable?: boolean;
  sections: { key: SourceKind; label: string; items: SourceItem[] }[];
  onAdd: (item: SourceItem) => void;
  onAbandon?: (item: SourceItem) => void;
}) {
  const { title, subtitle, icon, delay = 0, filterable, sections, onAdd, onAbandon } = props;
  const [filter, setFilter] = React.useState<TaskFilter>("all");
  const apply = React.useCallback(
    (items: SourceItem[]) =>
      filter === "overdue"
        ? items.filter((i) => i.overdue)
        : filter === "important"
          ? items.filter((i) => i.important)
          : items,
    [filter],
  );
  return (
    <section
      className="wg-rise rounded-2xl border border-hairline bg-surface-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="mb-2.5 flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${GOALS_ACCENT} 12%, transparent)`,
            color: GOALS_ACCENT_DEEP,
          }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3
            className="truncate text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 13.5 }}
          >
            {title}
          </h3>
          <p className="truncate text-[11px] text-ink-muted">{subtitle}</p>
        </div>
      </header>
      {filterable ? (
        <div className="mb-2.5 flex items-center gap-1.5">
          {(["all", "overdue", "important"] as TaskFilter[]).map((f) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition-colors focus-visible:outline-2"
                style={
                  on
                    ? { background: GOALS_GRADIENT, color: "#fff", outlineColor: GOALS_ACCENT }
                    : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", outlineColor: GOALS_ACCENT }
                }
                aria-pressed={on}
              >
                {f}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {sections.map((s) => (
          <SourceSection key={s.key} label={s.label} items={apply(s.items)} onAdd={onAdd} onAbandon={onAbandon} />
        ))}
      </div>
    </section>
  );
}

function SourceSection({
  label,
  items,
  onAdd,
  onAbandon,
}: {
  label: string;
  items: SourceItem[];
  onAdd: (item: SourceItem) => void;
  onAbandon?: (item: SourceItem) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const remaining = items.filter((i) => !i.added).length;
  return (
    <div className="rounded-xl border border-hairline/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-2 rounded-xl"
        style={{ outlineColor: GOALS_ACCENT }}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
          {label}
          <span
            className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
            style={
              remaining > 0
                ? {
                    background: `color-mix(in srgb, ${GOALS_ACCENT} 12%, transparent)`,
                    color: GOALS_ACCENT_DEEP,
                  }
                : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }
            }
          >
            {remaining}
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.15 }} className="text-ink-muted">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 px-2 pb-2.5">
              {items.length === 0 ? (
                <p className="mx-2 rounded-xl border border-dashed border-hairline-strong px-3 py-3 text-center text-xs text-ink-muted/70">
                  Nothing here right now.
                </p>
              ) : (
                items.map((item) => <SourceCard key={item.id} item={item} onAdd={onAdd} onAbandon={onAbandon} />)
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
