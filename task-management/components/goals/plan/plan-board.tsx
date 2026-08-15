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
  Users,
} from "lucide-react";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { SourceCard } from "./source-card";
import { PlanItemCard } from "./plan-item-card";
import { DayReview } from "./day-review";
import { SourceTag } from "./source-tag";
import {
  DEFAULT_WMS_FILTER,
  DUE_LABEL,
  STATUS_LABEL,
  applyWmsFilter,
  isFilterActive,
  sortByAttention,
  type DueFilter,
  type PriorityFilter,
  type StatusFilter,
  type WmsFilter,
} from "./wms-filters";
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
  renamePlanItem,
  setItemProgress,
  startMyDay,
  transferPlanItem,
} from "@/app/(app)/goals/plan/actions";
import { useRouter, usePathname } from "next/navigation";
import type { Route } from "next";

/** Sources that de-dupe against today's plan (flip to "added" once pulled). */
const DEDUPE_KINDS: SourceKind[] = ["weekly", "task", "unfinished"];

/** Who this board is planning for — see lib/goals/plan-target.ts. */
export interface PlanTargetProp {
  employeeId: string;
  name: string;
  isDelegated: boolean;
  roster: { id: string; name: string }[];
}

interface Props {
  /** Whose day is on screen + everyone the viewer may plan for. */
  target: PlanTargetProp;
  initialPlan: PlanItem[];
  sources: PlanSources;
  minItems: number;
  isManager: boolean;
  initialPhase: PlanPhase;
  /** The plan date (YYYY-MM-DD) this board shows — what every due mark and due
   *  filter compares against. Comes from the server payload, so the client can
   *  never disagree with the server about which day this is. */
  ymd: string;
  /** Which planner day is shown — 0 = today … 6 = six days out. */
  dayOffset: number;
}

// Goals module identity (amber-gold) — mirrors MODULE_THEME.goals. The planner
// lives in the amber room, so every accent (drop zone, pips, CTA, focus rings)
// reads amber, not WMS red.
const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

const PLAN_DROP_ID = "plan-drop";
/** Drop-target id prefix for the day tabs — `daytab:<offset>`. */
const DAY_TAB_DROP = "daytab:";
const nonGhost = (items: PlanItem[]) => items.filter((i) => i.id !== GHOST_ID);

export function PlanBoard({ target, initialPlan, sources, minItems, isManager, initialPhase, ymd, dayOffset }: Props) {
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
  const router = useRouter();
  const pathname = usePathname();

  /** Switch the whole board to today / tomorrow / day-after (server re-fetch). */
  const goToDay = React.useCallback(
    (off: number) => router.push((off === 0 ? pathname : `${pathname}?d=${off}`) as Route),
    [router, pathname],
  );

  /** Move a plan/review item to ANOTHER planner day (0-6). It leaves THIS day's
   *  view immediately; a failure refreshes to restore truth. An item lives on
   *  exactly one day, so this is a move, never a copy. */
  const onTransfer = React.useCallback(
    (id: string, toOffset: number) => {
      setPlan((prev) => prev.filter((i) => i.id !== id));
      void transferPlanItem(id, toOffset).then((r) => {
        if (!r.ok) {
          fireToast({ message: r.error, type: "error" });
          router.refresh();
        } else {
          const d = planDays()[toOffset];
          fireToast({ message: `Moved to ${d ? `${d.word} · ${d.date}` : "that day"}.` });
        }
      });
    },
    [router],
  );

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
  const dayLabel =
    dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : (planDays()[dayOffset]?.word ?? "That day");

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
      const res = await reorderPlan(ids, dayOffset, target.employeeId);
      if (!res.ok) fireToast({ message: res.error });
    });
  }, [dayOffset, target.employeeId]);

  /** Flip a dedupe-able source (weekly/task/unfinished) to "added". */
  const markSource = React.useCallback((kind: SourceKind, id: string, added: boolean) => {
    setSrc((prev) => ({
      ...prev,
      [kind]: prev[kind].map((s) => (s.id === id ? { ...s, added } : s)),
    }));
  }, []);

  /** Remove a source card entirely from its column (bug-fix #5: an unfinished
   *  item is MOVED to the plan, so it must leave "Unfinished", not just dim). */
  const removeSource = React.useCallback((kind: SourceKind, id: string) => {
    setSrc((prev) => ({ ...prev, [kind]: prev[kind].filter((s) => s.id !== id) }));
  }, []);

  /** Shared add path — used by BOTH drag-drop and the "+ Add to Today" buttons. */
  const commitAdd = React.useCallback(
    async (
      kind: SourceKind,
      sourceId: string,
      title: string,
      subtitle: string | null,
      atIndex?: number,
      /** Which day to file it on — defaults to the day currently on screen.
       *  Set when a source card is dropped straight onto another day's tab. */
      toOffset?: number,
    ) => {
      const off = toOffset ?? dayOffset;
      // Filing onto ANOTHER day must not leave a phantom card on this one.
      const otherDay = off !== dayOffset;
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
      // Only show it on THIS day's plan when that's where it's being filed.
      if (!otherDay) {
        setPlan((prev) => {
          const base = nonGhost(prev);
          const idx = atIndex == null ? base.length : Math.min(atIndex, base.length);
          base.splice(idx, 0, optimistic);
          inserted = base;
          return base;
        });
      } else {
        setPlan((prev) => prev.filter((i) => i.id !== GHOST_ID));
      }
      if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, true);

      const res =
        kind === "weekly"
          ? await addWeeklyGoalToPlan(sourceId, off, target.employeeId)
          : kind === "task"
            ? await addTaskToPlan(sourceId, off, target.employeeId)
            : kind === "unfinished"
              ? await addUnfinishedToPlan(sourceId, off)
              : await addCascadeGoalToPlan(sourceId, off, target.employeeId);

      if (!res.ok) {
        setPlan((prev) => prev.filter((i) => i.id !== tempId));
        if (DEDUPE_KINDS.includes(kind)) markSource(kind, sourceId, false);
        fireToast({ message: res.error });
        return;
      }
      if (otherDay) {
        const d = planDays()[off];
        fireToast({ message: `Added to ${d ? `${d.word} · ${d.date}` : "that day"}.` });
        return;
      }
      // An unfinished item was MOVED onto the plan — it must leave the
      // "Unfinished" column for good (bug-fix #5), whether the server moved it
      // (res.item) or deleted a redundant duplicate (res.item == null).
      if (kind === "unfinished") removeSource("unfinished", sourceId);
      if (!res.item) {
        // No-op (already on this day) — drop the optimistic row silently.
        setPlan((prev) => prev.filter((i) => i.id !== tempId));
        return;
      }
      const real = res.item;
      const next = inserted.map((i) => (i.id === tempId ? real : i));
      setPlan(next);
      persistOrder(next);
    },
    [markSource, removeSource, persistOrder, dayOffset],
  );

  const onAddSource = React.useCallback(
    (item: SourceItem) => void commitAdd(item.kind, item.id, item.title, item.subtitle),
    [commitAdd],
  );

  /**
   * Complete / un-complete a commitment straight from the plan. Uses the SAME
   * `setItemProgress` the close-out screen and My Day use, so ticking anywhere
   * runs one reflect-to-source pipeline (origin WMS task flips done, origin
   * weekly goal hits 100%) rather than three divergent completion paths.
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

  // Rename a commitment (fix a typo). Optimistic; reverts on failure. A still-
  // saving optimistic row (temp: id) can't be renamed server-side yet, so skip.
  const onRename = React.useCallback((id: string, title: string) => {
    if (id.startsWith("temp:")) return;
    let prevTitle = "";
    setPlan((prev) =>
      prev.map((i) => {
        if (i.id === id) prevTitle = i.title;
        return i.id === id ? { ...i, title } : i;
      }),
    );
    startTransition(async () => {
      const res = await renamePlanItem(id, title);
      if (!res.ok) {
        setPlan((prev) => prev.map((i) => (i.id === id ? { ...i, title: prevTitle } : i)));
        fireToast({ message: res.error });
      }
    });
  }, []);

  const onAddAdhoc = React.useCallback(async (title: string) => {
    const tempId = `temp:${crypto.randomUUID()}`;
    setPlan((prev) => [...nonGhost(prev), { id: tempId, title, subtitle: null, origin: "standalone", kind: "adhoc", done: false }]);
    const res = await addAdhocToPlan(title, dayOffset, target.employeeId);
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

    // Dropped on a DAY TAB → re-date this item onto that day.
    const overId = over ? String(over.id) : "";
    if (overId.startsWith(DAY_TAB_DROP)) {
      const toOffset = Number(overId.slice(DAY_TAB_DROP.length));
      // A SOURCE card dropped on a tab is filed straight onto that day.
      if (a.data.current?.type === "source") {
        setPlan((prev) => prev.filter((i) => i.id !== GHOST_ID));
        if (Number.isFinite(toOffset)) {
          void commitAdd(
            a.data.current.kind,
            a.data.current.sourceId,
            a.data.current.title,
            a.data.current.subtitle ?? null,
            undefined,
            toOffset,
          );
        }
        return;
      }
      if (Number.isFinite(toOffset) && toOffset !== dayOffset) {
        onTransfer(String(a.id), toOffset);
      }
      return;
    }

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

  /** Switch whose plan is on screen — a server re-fetch, like the day tabs. */
  const goToPerson = React.useCallback(
    (empId: string) => {
      const qs = new URLSearchParams();
      if (dayOffset !== 0) qs.set("d", String(dayOffset));
      if (empId) qs.set("emp", empId);
      const q = qs.toString();
      router.push((q ? `${pathname}?${q}` : pathname) as Route);
    },
    [router, pathname, dayOffset],
  );

  const daySwitcher = (
    <div className="flex flex-wrap items-center gap-2">
      <DaySwitcher current={dayOffset} onPick={goToDay} />
      {/* Plan for someone else — only rendered when the viewer actually has
          people they may plan for (admins: everyone; managers: their downline). */}
      {target.roster.length > 1 && (
        <label className="mb-3 inline-flex items-center gap-1.5 rounded-2xl border border-hairline bg-surface-card px-2.5 py-2">
          <Users size={14} className="shrink-0 text-ink-muted" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Planning for</span>
          <select
            value={target.employeeId}
            onChange={(e) => goToPerson(e.target.value)}
            aria-label="Whose day to plan"
            className="max-w-[190px] rounded-lg border border-hairline-strong bg-surface-card px-2 py-1 text-[12.5px] font-bold text-ink-strong outline-none focus:border-altus-red"
          >
            {target.roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {target.isDelegated && (
        <span
          className="mb-3 rounded-pill px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
          title="You are editing someone else's plan"
        >
          {target.name}&apos;s plan
        </span>
      )}
    </div>
  );

  // Non-plan phases (active / close-out / closed) show the review half — same
  // commitments, no pull panels — on the SAME page. Carry-forward / →day-after
  // per item lives here too (Sir).
  if (phase !== "plan") {
    return (
      <>
        {daySwitcher}
        <DayReview
          phase={phase}
          items={committed}
          onToCloseout={() => setPhase("closeout")}
          onBackToPlan={() => setPhase("plan")}
          onClosed={() => setPhase("closed")}
          onReopened={() => setPhase("plan")}
          onTransfer={onTransfer}
        />
      </>
    );
  }

  return (
    <>
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
    {/* Inside the DndContext on purpose: each day tab is a DROP TARGET, so a
        planned card can be dragged straight onto "Tomorrow" to re-date it. */}
    {daySwitcher}
      {/* Four verticals: the plan on the left, then the three pull boxes —
          Goals & Goal Tasks, Unfinished, and the WMS To-Do (filtered). Drag a
          card left, or press "+ Add to Today". Stacks to 2 then 1 column. */}
      <div className="grid gap-4 grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-2 max-sm:grid-cols-1">
        {/* 1 — Today's Plan (compact) */}
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
          onRename={onRename}
          onAddAdhoc={onAddAdhoc}
          onStart={onStartDay}
          onTransfer={onTransfer}
          dayOffset={dayOffset}
        />

        {/* 2 — Goals & Goal Tasks: the cascade goals you've adopted, and the
            weekly rows that execute them. Kept as two labelled sections so the
            difference between a GOAL and a GOAL TASK stays obvious. */}
        <SourceWindow
          title="Goals & Goal Tasks"
          subtitle="Your goals and this week's goal tasks"
          icon={<Layers size={16} />}
          delay={60}
          today={ymd}
          dayLabel={dayLabel}
          sections={[
            { key: "monthly", label: "Goals", items: [...src.monthly, ...src.quarterly, ...src.yearly] },
            { key: "weekly", label: "Goal Tasks", items: src.weekly },
          ]}
          onAdd={onAddSource}
        />

        {/* 3 — Previously Unfinished */}
        <SourceWindow
          title="Unfinished"
          subtitle="Carried over from earlier days"
          icon={<History size={16} />}
          delay={100}
          today={ymd}
          dayLabel={dayLabel}
          sections={[{ key: "unfinished", label: "Not Done Yet", items: src.unfinished }]}
          onAdd={onAddSource}
          onAbandon={onAbandon}
        />

        {/* 4 — WMS To-Do, with due / priority / status filters */}
        <WmsWindow today={ymd} items={src.task} onAdd={onAddSource} onAbandon={onAbandon} dayLabel={dayLabel} />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
        {active ? (
          <div className="flex items-center gap-2 rounded-chip border border-hairline-strong bg-surface-card px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
            <SourceTag kind={active.type === "source" ? active.kind : active.item.kind} />
            <span className="text-sm font-medium text-ink-strong">
              {active.type === "source" ? active.title : active.item.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/* Day switcher — the next 7 days, each with its weekday + date             */
/* ----------------------------------------------------------------------- */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/**
 * The 7 planner days as {offset, weekday, date} — computed from the LOCAL date
 * so the labels match the user's calendar. Offsets 0/1 keep their familiar
 * "Today"/"Tomorrow" words; the rest read as the weekday, and every tab carries
 * its date so there is no counting.
 */
function planDays(): { off: number; word: string; date: string }[] {
  const base = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return {
      off: i,
      word: i === 0 ? "Today" : i === 1 ? "Tomorrow" : (WEEKDAYS[d.getDay()] ?? ""),
      date: `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()] ?? ""}`,
    };
  });
}

/**
 * One day tab — also a DROP TARGET. Dragging a planned card onto "Tomorrow"
 * re-dates it, which is the same single-row move the ⋯ menu performs, so the two
 * gestures can never disagree. The tab lights up while a card hovers it.
 */
function DayTab({
  t,
  on,
  onPick,
}: {
  t: { off: number; word: string; date: string };
  on: boolean;
  onPick: (off: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_TAB_DROP}${t.off}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => !on && onPick(t.off)}
      className={`flex min-w-[68px] shrink-0 flex-col items-center rounded-xl px-3 py-1.5 leading-tight transition-colors ${
        on ? "text-white" : "text-ink-soft hover:bg-surface-soft hover:text-ink-strong"
      }`}
      style={
        isOver && !on
          ? {
              background: `color-mix(in srgb, ${GOALS_ACCENT} 14%, transparent)`,
              outline: `2px dashed ${GOALS_ACCENT}`,
              outlineOffset: -2,
            }
          : on
            ? { background: GOALS_GRADIENT }
            : undefined
      }
    >
      <span className="text-[12.5px] font-bold">{t.word}</span>
      <span className={`text-[10.5px] font-semibold tabular-nums ${on ? "opacity-85" : "text-ink-subtle"}`}>
        {t.date}
      </span>
    </button>
  );
}

function DaySwitcher({ current, onPick }: { current: number; onPick: (off: number) => void }) {
  // Recomputed per render but stable within a day — cheap, and it means a tab
  // open across midnight re-labels itself instead of showing yesterday.
  const days = React.useMemo(() => planDays(), []);
  return (
    <div
      className="mb-3 flex items-center gap-1 overflow-x-auto rounded-2xl border border-hairline bg-surface-card p-1"
      role="tablist"
      aria-label="Choose a day to plan"
    >
      {days.map((t) => {
        const on = t.off === current;
        return <DayTab key={t.off} t={t} on={on} onPick={onPick} />;
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Left column — the droppable, ordered plan                               */
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
  onRename: (id: string, title: string) => void;
  onAddAdhoc: (title: string) => void;
  onStart: () => void;
  onTransfer: (id: string, off: number) => void;
  /** Which planner day this column shows — the per-item move menu omits it. */
  dayOffset: number;
}) {
  const { plan, count, doneCount, minItems, met, isManager, starting, busyId, onToggleDone, onRemove, onRename, onAddAdhoc, onStart, onTransfer, dayOffset } = props;
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
            <p className="truncate text-[11px] text-ink-muted">
              {count > 0 ? `${doneCount} of ${count} done` : "What will you deliver today?"}
            </p>
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
                <PlanItemCard
                  key={item.id}
                  item={item}
                  index={item.ghost ? i : nonGhostIndex(plan, item.id)}
                  busy={busyId === item.id}
                  onToggleDone={onToggleDone}
                  onRemove={onRemove}
                  onRename={onRename}
                  onTransfer={onTransfer}
                  dayOffset={dayOffset}
                />
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
            <p className="text-[11px] text-ink-muted">{minItems} to unlock your day.</p>
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
          {starting ? <Loader2 size={15} className="animate-spin" /> : <Sunrise size={15} />} Start My Day
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
/* Right columns — a source window with collapsible sections               */
/* ----------------------------------------------------------------------- */

function SourceWindow(props: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  delay?: number;
  today: string;
  /** Rendered between the header and the sections (the WMS filter block). */
  controls?: React.ReactNode;
  sections: { key: SourceKind; label: string; items: SourceItem[]; emptyText?: string }[];
  onAdd: (item: SourceItem) => void;
  onAbandon?: (item: SourceItem) => void;
  dayLabel?: string;
}) {
  const { title, subtitle, icon, delay = 0, today, controls, sections, onAdd, onAbandon, dayLabel } = props;
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
      {controls}
      <div className="flex flex-col gap-2">
        {sections.map((s) => (
          <SourceSection
            key={s.key}
            label={s.label}
            items={s.items}
            emptyText={s.emptyText}
            today={today}
            onAdd={onAdd}
            onAbandon={onAbandon}
            dayLabel={dayLabel}
          />
        ))}
      </div>
    </section>
  );
}

function SourceSection({
  label,
  items,
  today,
  onAdd,
  onAbandon,
  dayLabel,
  emptyText = "Nothing here right now.",
}: {
  label: string;
  items: SourceItem[];
  today: string;
  onAdd: (item: SourceItem) => void;
  onAbandon?: (item: SourceItem) => void;
  dayLabel?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false);
  const remaining = items.filter((i) => !i.added).length;
  const CAP = 6;
  const shown = showAll ? items : items.slice(0, CAP);
  const hidden = items.length - shown.length;
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
                <p className="mx-2 rounded-xl border border-hairline-strong px-3 py-3 text-center text-xs text-ink-muted/70">
                  {emptyText}
                </p>
              ) : (
                <>
                  {shown.map((item) => (
                    <SourceCard key={item.id} item={item} today={today} onAdd={onAdd} onAbandon={onAbandon} dayLabel={dayLabel} />
                  ))}
                  {items.length > CAP ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="mx-1 mt-0.5 inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors focus-visible:outline-2"
                      style={{
                        borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`,
                        color: GOALS_ACCENT_DEEP,
                        background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
                        outlineColor: GOALS_ACCENT,
                      }}
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
/* Column 4 — WMS To-Do, with due / priority / status filters              */
/* ----------------------------------------------------------------------- */

const SELECT_CLASS =
  "h-7 w-full min-w-0 rounded-lg border border-hairline bg-surface-card px-1 text-[11px] font-semibold text-ink-soft focus-visible:outline-2";

const DUE_OPTIONS: DueFilter[] = ["all", "overdue", "today", "week"];
const STATUS_OPTIONS: StatusFilter[] = ["all", "open", "in_progress", "blocked"];

/**
 * The WMS To-Do column. Filters narrow the list; the result is then re-ranked
 * attention-first, so a narrowed column still leads with what's at risk.
 *
 * Priority options are the app's REAL four-point scale (Critical · Important ·
 * Urgent · Normal — the `TASK_PRIORITIES` Eisenhower enum) rather than an
 * invented High/Medium/Low, so a filter always names a value the data holds.
 */
function WmsWindow({
  today,
  items,
  onAdd,
  onAbandon,
  dayLabel,
}: {
  today: string;
  items: SourceItem[];
  onAdd: (item: SourceItem) => void;
  onAbandon: (item: SourceItem) => void;
  dayLabel?: string;
}) {
  const [filter, setFilter] = React.useState<WmsFilter>(DEFAULT_WMS_FILTER);
  const set = <K extends keyof WmsFilter>(key: K, value: WmsFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: value }));

  const shown = React.useMemo(
    () => sortByAttention(applyWmsFilter(items, filter, today), today),
    [items, filter, today],
  );
  const active = isFilterActive(filter);

  return (
    <SourceWindow
      title="WMS To-Do"
      subtitle="Your open WMS tasks"
      icon={<ListTodo size={16} />}
      delay={140}
      today={today}
      dayLabel={dayLabel}
      controls={
        <div className="mb-2.5 rounded-xl bg-surface-soft/60 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="min-w-0">
              <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Due</span>
              <select
                value={filter.due}
                onChange={(e) => set("due", e.target.value as DueFilter)}
                className={SELECT_CLASS}
                style={{ outlineColor: GOALS_ACCENT }}
              >
                {DUE_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DUE_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Priority</span>
              <select
                value={filter.priority}
                onChange={(e) => set("priority", e.target.value as PriorityFilter)}
                className={SELECT_CLASS}
                style={{ outlineColor: GOALS_ACCENT }}
              >
                <option value="all">All</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 min-w-0">
              <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Status</span>
              <select
                value={filter.status}
                onChange={(e) => set("status", e.target.value as StatusFilter)}
                className={SELECT_CLASS}
                style={{ outlineColor: GOALS_ACCENT }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {active ? (
            <button
              type="button"
              onClick={() => setFilter(DEFAULT_WMS_FILTER)}
              className="mt-1.5 text-[11px] font-bold focus-visible:outline-2"
              style={{ color: GOALS_ACCENT_DEEP, outlineColor: GOALS_ACCENT }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      }
      sections={[
        {
          key: "task",
          label: "Pending",
          items: shown,
          emptyText: active ? "No tasks match these filters." : "Nothing here right now.",
        },
      ]}
      onAdd={onAdd}
      onAbandon={onAbandon}
    />
  );
}
