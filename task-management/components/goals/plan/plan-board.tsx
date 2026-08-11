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
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Loader2, Plus, Sunrise } from "lucide-react";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { SourceCard } from "./source-card";
import { PlanItemCard } from "./plan-item-card";
import { DayReview } from "./day-review";
import { SourceTagChip } from "./row-bits";
import {
  DEFAULT_WMS_FILTER,
  DUE_FILTER_LABEL,
  STATUS_FILTER_LABEL,
  applyWmsFilter,
  isFilterActive,
  sortByAttention,
  type DueFilter,
  type PriorityFilter,
  type StatusFilter,
  type WmsFilter,
} from "./filters";
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
  setItemProgress,
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
  /** IST today (YYYY-MM-DD) — the reference every due chip + filter compares
   *  against. Passed from the server payload rather than computed here so the
   *  client can't disagree with the server about which day "today" is. */
  ymd: string;
}

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const GRADIENT = `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`;

const PLAN_DROP_ID = "plan-drop";
const nonGhost = (items: PlanItem[]) => items.filter((i) => i.id !== GHOST_ID);

/**
 * Plan My Day — one daily command centre, rendered identically at
 * `/goals/plan` (Goals › Plan My Day) and `/my-day` (WMS › My Day).
 *
 * The board answers two questions and keeps them visually apart:
 *   RIGHT — AVAILABLE WORK: everything you COULD work on, grouped by where it
 *           comes from (Goals · Goal Tasks · WMS Tasks · Carryover).
 *   LEFT  — TODAY'S PLAN: what you've COMMITTED to, ordered, completable.
 *
 * Adding always REFERENCES the original row (goal id / weekly goal id / task
 * id / prior checklist row) through the existing server actions — the board
 * never creates a Goal, a Goal Task or a WMS Task.
 */
export function PlanBoard({ initialPlan, sources, minItems, isManager, initialPhase, ymd }: Props) {
  const [phase, setPhase] = React.useState<PlanPhase>(initialPhase);
  const [starting, setStarting] = React.useState(false);
  const [plan, setPlan] = React.useState<PlanItem[]>(initialPlan);
  const [src, setSrc] = React.useState<PlanSources>(sources);
  const [busyId, setBusyId] = React.useState<string | null>(null);
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
  const doneCount = React.useMemo(() => committed.filter((i) => i.done).length, [committed]);
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

  /** Flip a dedupe-able source (weekly/task/unfinished) to "added". */
  const markSource = React.useCallback((kind: SourceKind, id: string, added: boolean) => {
    setSrc((prev) => ({
      ...prev,
      [kind]: prev[kind].map((s) => (s.id === id ? { ...s, added } : s)),
    }));
  }, []);

  /** Shared add path — used by BOTH drag-drop and the "+ Add" buttons. */
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

  /**
   * Complete / un-complete a commitment straight from the plan. Uses the SAME
   * `setItemProgress` the close-out screen uses, so ticking here runs the same
   * reflect-to-source pipeline (origin WMS task flips done, origin weekly goal
   * hits 100%) instead of a second, divergent completion path.
   */
  const onToggleDone = React.useCallback((item: PlanItem) => {
    if (item.id.startsWith("temp:")) return; // not persisted yet
    const done = !item.done;
    const pct = done ? 100 : 0;
    setPlan((prev) => prev.map((i) => (i.id === item.id ? { ...i, done, donePct: pct } : i)));
    setBusyId(item.id);
    void setItemProgress(item.id, { done, pct })
      .then((r) => {
        if (!r.ok) {
          setPlan((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !done, donePct: done ? 0 : 100 } : i)));
          fireToast({ message: r.error, type: "error" });
        }
      })
      .finally(() => setBusyId(null));
  }, []);

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
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <PlanColumn
          plan={plan}
          count={count}
          doneCount={doneCount}
          minItems={minItems}
          met={met}
          isManager={isManager}
          starting={starting}
          busyId={busyId}
          onToggleDone={onToggleDone}
          onRemove={onRemove}
          onAddAdhoc={onAddAdhoc}
          onStart={onStartDay}
        />
        <AvailableWork sources={src} today={ymd} onAdd={onAddSource} onAbandon={onAbandon} />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {active ? (
          <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-card px-3 py-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.2)]">
            <SourceTagChip kind={active.type === "source" ? active.kind : active.item.kind} />
            <span className="text-[13.5px] font-semibold text-ink-strong">
              {active.type === "source" ? active.title : active.item.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ----------------------------------------------------------------------- */
/* Shared panel chrome                                                     */
/* ----------------------------------------------------------------------- */

/** One flat surface per column — a single border, no nested cards inside. */
function Panel({
  label,
  caption,
  aside,
  children,
}: {
  label: string;
  caption: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-section border border-hairline bg-surface-card p-5 max-md:p-4">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-ink-strong">{label}</h2>
          <p className="mt-1 text-[12.5px] text-ink-muted">{caption}</p>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/* Left — Today's Plan                                                     */
/* ----------------------------------------------------------------------- */
function PlanColumn(props: {
  plan: PlanItem[];
  count: number;
  doneCount: number;
  minItems: number;
  met: boolean;
  isManager: boolean;
  starting: boolean;
  busyId: string | null;
  onToggleDone: (item: PlanItem) => void;
  onRemove: (id: string) => void;
  onAddAdhoc: (title: string) => void;
  onStart: () => void;
}) {
  const { plan, count, doneCount, minItems, met, isManager, starting, busyId, onToggleDone, onRemove, onAddAdhoc, onStart } = props;
  const { setNodeRef, isOver } = useDroppable({ id: PLAN_DROP_ID });
  const [draft, setDraft] = React.useState("");

  const ids = React.useMemo(() => plan.map((i) => i.id), [plan]);
  const isEmpty = count === 0;
  const pct = count > 0 ? Math.round((doneCount / count) * 100) : 0;
  const allDone = count > 0 && doneCount === count;

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t.length < 2) return;
    onAddAdhoc(t);
    setDraft("");
  }

  return (
    <Panel
      label="Today's Plan"
      caption="What I've committed to today"
      aside={
        <span className="shrink-0 text-right">
          <span
            className="block text-[15px] font-black tabular-nums leading-none"
            style={{ color: allDone ? "var(--color-green-deep)" : "var(--color-ink-strong)" }}
          >
            {doneCount} / {count}
          </span>
          <span className="mt-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">
            Complete
          </span>
        </span>
      }
    >
      {/* Completion bar — the one piece of chrome that earns its pixels here. */}
      {count > 0 ? (
        <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-surface-track">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: allDone ? "var(--color-green-deep)" : GRADIENT }}
          />
        </div>
      ) : null}

      <div
        ref={setNodeRef}
        className="rounded-lg transition-colors"
        style={{
          outline: isOver ? `2px dashed color-mix(in srgb, ${ACCENT} 45%, transparent)` : "none",
          outlineOffset: 4,
          background: isOver ? `color-mix(in srgb, ${ACCENT} 4%, transparent)` : undefined,
          minHeight: isEmpty ? undefined : 40,
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col divide-y divide-hairline/50">
            {plan.map((item, i) => (
              <PlanItemCard
                key={item.id}
                item={item}
                index={item.ghost ? i : nonGhostIndex(plan, item.id)}
                busy={busyId === item.id}
                onToggleDone={onToggleDone}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </SortableContext>

        {isEmpty ? (
          <div
            className="rounded-lg border border-dashed px-4 py-8 text-center"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 26%, transparent)` }}
          >
            <p className="text-[13px] font-semibold text-ink-soft">Nothing planned yet</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[12px] text-ink-muted">
              Add work from Available Work, drag a row across, or type a commitment below.
            </p>
          </div>
        ) : null}
      </div>

      <form onSubmit={submitDraft} className="mt-4 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add your own commitment…"
          aria-label="Add a commitment for today"
          maxLength={280}
          className="h-9 flex-1 rounded-lg border border-hairline bg-surface-card px-3 text-[13px] text-ink-strong placeholder:text-ink-muted/60 focus-visible:outline-2"
          style={{ outlineColor: ACCENT }}
        />
        <button
          type="submit"
          disabled={draft.trim().length < 2}
          aria-label="Add commitment"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-strong text-white transition-opacity disabled:opacity-30 focus-visible:outline-2"
          style={{ outlineColor: ACCENT }}
        >
          <Plus size={16} />
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4 max-sm:flex-col max-sm:items-stretch">
        <p className="text-[11.5px] text-ink-muted">
          {met ? (
            <span className="font-semibold" style={{ color: "var(--color-green-deep)" }}>
              Minimum met — you&apos;re ready to start.
            </span>
          ) : (
            <>
              Plan at least <span className="font-bold tabular-nums text-ink-strong">{minItems}</span>{" "}
              {isManager ? "items (manager minimum)" : "items"} to start — {minItems - count} to go.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onStart}
          disabled={!met || starting}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold text-white transition-opacity disabled:opacity-35 focus-visible:outline-2"
          style={{ background: GRADIENT, outlineColor: ACCENT }}
        >
          {starting ? <Loader2 size={15} className="animate-spin" /> : <Sunrise size={15} />} Start My Day
        </button>
      </div>
    </Panel>
  );
}

function nonGhostIndex(plan: PlanItem[], id: string): number {
  return nonGhost(plan).findIndex((i) => i.id === id);
}

/* ----------------------------------------------------------------------- */
/* Right — Available Work                                                  */
/* ----------------------------------------------------------------------- */
function AvailableWork({
  sources,
  today,
  onAdd,
  onAbandon,
}: {
  sources: PlanSources;
  today: string;
  onAdd: (item: SourceItem) => void;
  onAbandon: (item: SourceItem) => void;
}) {
  const [filter, setFilter] = React.useState<WmsFilter>(DEFAULT_WMS_FILTER);

  // Cascade goals (year / quarter / month) are ONE list — nearest horizon
  // first, so the month you're actually executing leads.
  const goals = React.useMemo(
    () => [...sources.monthly, ...sources.quarterly, ...sources.yearly],
    [sources.monthly, sources.quarterly, sources.yearly],
  );

  // Filter, then re-rank — a narrowed list is still attention-first.
  const wmsTasks = React.useMemo(
    () => sortByAttention(applyWmsFilter(sources.task, filter, today), today),
    [sources.task, filter, today],
  );

  const available = (items: SourceItem[]) => items.filter((i) => !i.added).length;

  return (
    <Panel
      label="Available Work"
      caption="Everything you could pick up today — add what you'll commit to"
      aside={
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-black tabular-nums leading-none text-ink-strong">
            {available(goals) + available(sources.weekly) + available(sources.task) + available(sources.unfinished)}
          </span>
          <span className="mt-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">
            Available
          </span>
        </span>
      }
    >
      <div className="flex flex-col">
        <WorkSection label="Goals" tagKind="monthly" items={goals} today={today} onAdd={onAdd} />
        <WorkSection label="Goal Tasks" tagKind="weekly" items={sources.weekly} today={today} onAdd={onAdd} />
        <WorkSection
          label="WMS Tasks"
          tagKind="task"
          items={wmsTasks}
          totalBeforeFilter={sources.task.length}
          today={today}
          onAdd={onAdd}
          onAbandon={onAbandon}
          filters={<WmsFilters filter={filter} onChange={setFilter} />}
        />
        <WorkSection
          label="Carryover"
          tagKind="unfinished"
          items={sources.unfinished}
          today={today}
          onAdd={onAdd}
          onAbandon={onAbandon}
        />
      </div>
    </Panel>
  );
}

/**
 * One source group inside Available Work. Sections are separated by a hairline
 * rule rather than being cards of their own — the panel is already a card, and
 * a card inside a card inside a card is exactly what this page had before.
 */
function WorkSection({
  label,
  tagKind,
  items,
  totalBeforeFilter,
  today,
  filters,
  onAdd,
  onAbandon,
}: {
  label: string;
  tagKind: SourceKind;
  items: SourceItem[];
  totalBeforeFilter?: number;
  today: string;
  filters?: React.ReactNode;
  onAdd: (item: SourceItem) => void;
  onAbandon?: (item: SourceItem) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false);
  const CAP = 6;
  const shown = showAll ? items : items.slice(0, CAP);
  const hidden = items.length - shown.length;
  const remaining = items.filter((i) => !i.added).length;
  const filtered = totalBeforeFilter != null && totalBeforeFilter !== items.length;

  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md py-3 text-left focus-visible:outline-2"
        style={{ outlineColor: ACCENT }}
      >
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.15 }} className="text-ink-muted/60">
          <ChevronDown size={14} />
        </motion.span>
        <span className="text-[12.5px] font-bold text-ink-strong">{label}</span>
        <SourceTagChip kind={tagKind} />
        <span className="ml-auto text-[11px] font-semibold tabular-nums text-ink-muted">
          {filtered ? `${items.length} of ${totalBeforeFilter}` : remaining}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pb-3">
              {filters}
              {items.length === 0 ? (
                <p className="px-1 py-3 text-[12px] text-ink-muted">
                  {filtered ? "No tasks match these filters." : "Nothing here right now."}
                </p>
              ) : (
                <>
                  <div className="flex flex-col divide-y divide-hairline/40">
                    {shown.map((item) => (
                      <SourceCard key={item.id} item={item} today={today} onAdd={onAdd} onAbandon={onAbandon} />
                    ))}
                  </div>
                  {items.length > CAP ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 py-1 text-[11.5px] font-bold transition-colors focus-visible:outline-2"
                      style={{ color: ACCENT_DEEP, outlineColor: ACCENT }}
                    >
                      {showAll ? "Show less" : `Show ${hidden} more`}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* WMS task filters                                                        */
/* ----------------------------------------------------------------------- */

const SELECT_CLASS =
  "h-[30px] w-full rounded-md border border-hairline bg-surface-card px-1.5 text-[11.5px] font-semibold text-ink-soft focus-visible:outline-2";

const DUE_OPTIONS: DueFilter[] = ["all", "overdue", "today", "tomorrow", "week", "custom"];
const STATUS_OPTIONS: StatusFilter[] = ["all", "open", "in_progress", "blocked", "completed"];

/**
 * Compact due-date / priority / status filters over the LIVE WMS task list.
 *
 * Priority options are the app's real four-point scale (Critical · Important ·
 * Urgent · Normal — the `TASK_PRIORITIES` Eisenhower enum), not an invented
 * High/Medium/Low, so a filter always names a value the data actually holds.
 * Status options group the real statuses into the four plain-language buckets
 * (see `STATUS_GROUP`).
 */
function WmsFilters({ filter, onChange }: { filter: WmsFilter; onChange: (f: WmsFilter) => void }) {
  const set = <K extends keyof WmsFilter>(key: K, value: WmsFilter[K]) => onChange({ ...filter, [key]: value });
  const active = isFilterActive(filter);

  return (
    <div className="mb-1 rounded-lg bg-surface-soft/60 p-2">
      <div className="grid grid-cols-3 gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">Due</span>
          <select
            value={filter.due}
            onChange={(e) => set("due", e.target.value as DueFilter)}
            className={SELECT_CLASS}
            style={{ outlineColor: ACCENT }}
          >
            {DUE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {DUE_FILTER_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">Priority</span>
          <select
            value={filter.priority}
            onChange={(e) => set("priority", e.target.value as PriorityFilter)}
            className={SELECT_CLASS}
            style={{ outlineColor: ACCENT }}
          >
            <option value="all">All</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">Status</span>
          <select
            value={filter.status}
            onChange={(e) => set("status", e.target.value as StatusFilter)}
            className={SELECT_CLASS}
            style={{ outlineColor: ACCENT }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_FILTER_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filter.due === "custom" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">From</span>
            <input
              type="date"
              value={filter.from}
              onChange={(e) => set("from", e.target.value)}
              className={SELECT_CLASS}
              style={{ outlineColor: ACCENT }}
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">To</span>
            <input
              type="date"
              value={filter.to}
              onChange={(e) => set("to", e.target.value)}
              className={SELECT_CLASS}
              style={{ outlineColor: ACCENT }}
            />
          </label>
        </div>
      ) : null}

      {active ? (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_WMS_FILTER)}
          className="mt-2 text-[11px] font-bold transition-colors focus-visible:outline-2"
          style={{ color: ACCENT_DEEP, outlineColor: ACCENT }}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
