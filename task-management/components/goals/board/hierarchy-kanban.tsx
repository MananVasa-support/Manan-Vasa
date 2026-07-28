"use client";

/**
 * Goals LEVEL BOARD — HIERARCHICAL FROZEN-PARENT KANBAN (Phase 1).
 *
 * REPLACES the old flat period-column Kanban on every level board. The board
 * reads Vision → Execution left-to-right:
 *
 *   ┌─────────────┐  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 *   │ FROZEN      │  │ Lane 1 │ │ Lane 2 │ │ Lane 3 │ │ Lane 4 │
 *   │ parent      │  │ child  │ │ child  │ │ …      │ │ …      │
 *   │ roll-up     │  │ cards  │ │ cards  │ │        │ │        │
 *   │ (sticky)    │  │        │ │        │ │        │ │        │
 *   └─────────────┘  └────────┘ └────────┘ └────────┘ └────────┘
 *      ▲ pinned left, never scrolls    ▲ these scroll horizontally →
 *
 * Per level:
 *   · Yearly   — FROZEN = the FY's YEAR goals · lanes = Q1…Q4 (quarter goals).
 *   · Quarterly— FROZEN = the quarter's goals · lanes = its 3 months (month goals).
 *   · Monthly  — FROZEN = the month's goals   · lanes = its weeks (week goals).
 *
 * Dragging a CHILD card between lanes RE-HOMES the goal (its `periodKey`) via the
 * board's shared `moveToBucket` (`onRehome`) — optimistic, with the Undo toast.
 * Dropping on a sibling in the SAME lane reorders (`onReorder`). Pointer + Keyboard
 * sensors. Read-only viewers and "Assigned" (shared, non-owned) goals never drag.
 *
 * PHASE 2 (clean seams left below): Week→Day board, the weekly_goals execution
 * board integration, animated parent↔child connector lines, multi-select, the
 * right-click context menu, dependency/blocker/confidence chips, full tablet/
 * mobile responsive polish (for now a min-width horizontal scroll).
 */

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
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { ChevronDown, Layers, Lock, Sparkles } from "lucide-react";
import {
  type GoalDTO,
  type RosterMember,
  effectiveGoalPct,
  periodKeyLabel,
  periodKeyShort,
  categoryStyle,
  childLevelOf,
  goalCode,
  fmtNum,
} from "@/components/goals/cascade/util";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  quarterOfKey,
} from "@/lib/goals/types";
import { weeksOfMonth } from "@/lib/goals/fy-calendar";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import { pctTone } from "@/components/weekly-goals/field-controls";
import { initialsOf } from "@/components/goals/canvas/people";
import type { GoalPolicy } from "@/lib/goals/policy";
import { GoalBoardCard, ProgressRing, type SharedCardProps } from "./goal-board-card";
import { BoardQuickAdd } from "./board-quick-add";
import { AssignmentChip } from "./assignment-chip";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/** Drop-id contract — a lane droppable is `lane:<childPeriodKey>`. */
const LANE_DROP_PREFIX = "lane:";

/** Stable empty identity so React.memo stays effective for childless cards. */
const EMPTY: GoalDTO[] = [];

type ParentLevel = "year" | "quarter" | "month";

/** One rendered lane: its child period-key + a two-line header. */
interface LaneMeta {
  key: string;
  main: string;
  sub: string;
}

export interface HierarchyKanbanProps {
  /** The board's OWN level — the frozen roll-up column. Children sit one below. */
  parentLevel: ParentLevel;
  fyStartYear: number;
  /** The selected parent bucket — FY key / quarter key / month key. */
  selectedKey: string;
  /** EVERY optimistic goal across levels (frozen parents + lane children live here). */
  goals: GoalDTO[];
  /** Search + completion filter — applied to the CHILD cards (parents always show). */
  filterGoal: (g: GoalDTO) => boolean;
  filtersActive: boolean;
  /** Memo-stable per-card props (policy, roster, lookups, mutation…). */
  cardProps: SharedCardProps;
  /** Direct children of every goal — feeds the drawer allocation strip + the
   *  parent roll-up child counts, no extra fetch. */
  childrenByParent: Map<string, GoalDTO[]>;
  roster: RosterMember[];
  viewedEmployeeId: string;
  viewedName: string;
  canWrite: boolean;
  policy: GoalPolicy;
  /** Same-level re-home (Q2→Q4, Jul→Aug…) — the board's shared `moveToBucket`. */
  onRehome: (g: GoalDTO, periodKey: string) => void;
  /** Persist a new Sr.-No. order for a lane (drag within a lane). */
  onReorder: (ids: string[]) => void;
  focusId: string | null;
}

/** Health band (blueprint semantic hexes): green ≥80 · amber ≥60 · red else. */
function healthBand(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 80) return { label: "On track", color: "#15803d", bg: "rgba(21,128,61,0.12)" };
  if (pct >= 60) return { label: "Watch", color: "#b45309", bg: "rgba(180,83,9,0.12)" };
  return { label: "At risk", color: "#b91c1c", bg: "rgba(185,28,28,0.10)" };
}

/** A goal shared FROM someone else (owner ≠ viewed person) — never re-homed here. */
function isAssigned(g: GoalDTO): boolean {
  return g.createdById != null && g.createdById !== g.employeeId;
}

export function HierarchyKanban(props: HierarchyKanbanProps) {
  const {
    parentLevel,
    fyStartYear: fy,
    selectedKey,
    goals,
    filterGoal,
    filtersActive,
    cardProps,
    childrenByParent,
    roster,
    viewedEmployeeId,
    viewedName,
    canWrite,
    policy,
    onRehome,
    onReorder,
    focusId,
  } = props;

  const childLevel = childLevelOf(parentLevel); // "quarter" | "month" | "week"
  const childLabel = parentLevel === "year" ? "quarters" : parentLevel === "quarter" ? "months" : "weeks";
  const parentLabel = parentLevel === "year" ? "Year" : parentLevel === "quarter" ? "Quarter" : "Month";

  // ── Lanes (child buckets that fall under the selected parent) ────────
  const lanes = React.useMemo<LaneMeta[]>(() => {
    if (parentLevel === "year") {
      return quartersOfFy(fy).map((k) => ({
        key: k,
        main: `Q${quarterOfKey(k)}`,
        sub: periodKeyLabel(k).split("·")[1]?.trim() ?? "",
      }));
    }
    if (parentLevel === "quarter") {
      return monthKeysOfQuarter(fy, quarterOfKey(selectedKey)).map((k) => ({
        key: k,
        main: periodKeyShort(k),
        sub: k.slice(0, 4),
      }));
    }
    // Monthly — the ISO/Mon-start weeks whose Monday falls in the selected month.
    const monthIndex = Number(selectedKey.slice(5, 7)) - 1;
    return weeksOfMonth(fy, monthIndex).map((w) => ({
      key: w.mondayISO,
      main: `W${w.weekNo}`,
      sub: formatWeekShort(w.mondayISO),
    }));
  }, [parentLevel, fy, selectedKey]);

  // ── Frozen parents = the selected bucket's goals at THIS level, stacked ──
  const parents = React.useMemo(
    () =>
      goals
        .filter((g) => g.period === parentLevel && g.periodKey === selectedKey)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    [goals, parentLevel, selectedKey],
  );

  // The parent that OWNS the lanes (lowest Sr. No.) — new lane goals file under it.
  const primaryParent = parents[0] ? { id: parents[0].id, title: parents[0].title } : null;

  // ── Child cards, bucketed per lane (filtered + Sr.-No. sorted) ──────
  const childrenByLane = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const l of lanes) m.set(l.key, []);
    for (const g of goals) {
      if (g.period !== childLevel) continue;
      const bucket = m.get(g.periodKey);
      if (!bucket) continue; // a child outside this parent's lanes
      if (!filterGoal(g)) continue;
      bucket.push(g);
    }
    for (const list of m.values())
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    return m;
  }, [goals, lanes, childLevel, filterGoal]);

  // Fast id → child lookup for the drag handlers.
  const childGoals = React.useMemo(
    () => goals.filter((g) => g.period === childLevel),
    [goals, childLevel],
  );

  // PHASE 2: week-level cascade goals aren't part of the loaded board set (weeks
  // live on weekly_goals). Render the week lanes empty + say so, never crash.
  const weekGap = childLevel === "week" && childGoals.length === 0;

  const ownerName = React.useCallback(
    (g: GoalDTO) => {
      const id = isAssigned(g) ? g.createdById : g.employeeId;
      return roster.find((r) => r.id === id)?.name ?? viewedName;
    },
    [roster, viewedName],
  );

  // ── Drag & drop — self-contained context (child-level draggables) ────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndId = React.useId();
  const [activeDrag, setActiveDrag] = React.useState<GoalDTO | null>(null);

  // Pointer-first collision — whatever droppable sits under the cursor wins; the
  // rect algorithm is the keyboard-sensor fallback (mirrors the list board).
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const under = pointerWithin(args);
    return under.length > 0 ? under : closestCorners(args);
  }, []);

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => setActiveDrag(childGoals.find((g) => g.id === String(e.active.id)) ?? null),
    [childGoals],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = e;
      if (!over) return;
      const g = childGoals.find((x) => x.id === String(active.id));
      if (!g || isAssigned(g)) return; // shared goals aren't re-homed by a non-owner
      const overId = String(over.id);

      // Dropped on a lane → re-home to that child bucket.
      if (overId.startsWith(LANE_DROP_PREFIX)) {
        onRehome(g, overId.slice(LANE_DROP_PREFIX.length));
        return;
      }
      if (overId === g.id) return;
      const target = childGoals.find((x) => x.id === overId);
      if (!target) return;

      // Dropped on a card in ANOTHER lane → re-home to that lane.
      if (target.periodKey !== g.periodKey) {
        onRehome(g, target.periodKey);
        return;
      }

      // Same lane → persist the reordered Sr.-No. line.
      const lane = childrenByLane.get(g.periodKey) ?? EMPTY;
      const oldIndex = lane.findIndex((x) => x.id === g.id);
      const newIndex = lane.findIndex((x) => x.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder(arrayMove(lane, oldIndex, newIndex).map((x) => x.id));
    },
    [childGoals, childrenByLane, onRehome, onReorder],
  );

  // ── ARIA-LIVE narration (keyboard parity) ───────────────────────────
  const nameOfDrop = React.useCallback(
    (id: string | number | undefined): string | null => {
      if (id == null) return null;
      const s = String(id);
      if (s.startsWith(LANE_DROP_PREFIX)) return `the ${periodKeyLabel(s.slice(LANE_DROP_PREFIX.length))} lane`;
      const g = childGoals.find((x) => x.id === s);
      return g ? `“${g.title}”` : null;
    },
    [childGoals],
  );
  const announcements = React.useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        return `Picked up ${nameOfDrop(active.id) ?? "the goal"}. Arrow keys move it between lanes; space drops, escape cancels.`;
      },
      onDragOver({ active, over }) {
        const t = nameOfDrop(over?.id);
        return t ? `${nameOfDrop(active.id) ?? "The goal"} is over ${t}.` : `No drop target.`;
      },
      onDragEnd({ active, over }) {
        const name = nameOfDrop(active.id) ?? "the goal";
        if (!over) return `Dropped ${name}. No change.`;
        const overId = String(over.id);
        if (overId.startsWith(LANE_DROP_PREFIX)) return `Moved ${name} to ${periodKeyLabel(overId.slice(LANE_DROP_PREFIX.length))}.`;
        const a = childGoals.find((x) => x.id === String(active.id));
        const o = childGoals.find((x) => x.id === overId);
        if (a && o && a.periodKey !== o.periodKey) return `Moved ${name} to ${periodKeyLabel(o.periodKey)}.`;
        return `Reordered ${name}.`;
      },
      onDragCancel({ active }) {
        return `Cancelled — ${nameOfDrop(active.id) ?? "the goal"} returned.`;
      },
    }),
    [nameOfDrop, childGoals],
  );
  const instructions = React.useMemo<ScreenReaderInstructions>(
    () => ({
      draggable:
        "Press space or enter to pick up a goal, arrow keys to move it between lanes or reorder it, space or enter to drop, escape to cancel. Shared goals and cross-level moves use the card's ⋯ menu.",
    }),
    [],
  );

  const totalChildren = React.useMemo(
    () => [...childrenByLane.values()].reduce((n, l) => n + l.length, 0),
    [childrenByLane],
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
    >
      {weekGap && (
        <div
          className="wg-rise mb-3 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-[13px] font-semibold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))",
            background: "color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card))",
            color: "var(--color-ink-soft)",
          }}
        >
          <Sparkles size={15} strokeWidth={2.4} style={{ color: "var(--color-altus-red)" }} />
          Week goals live on the Weekly execution board — none have cascaded into this month yet.
          The week lanes below are ready for them (Phase&nbsp;2 wires the weekly board in).
        </div>
      )}

      {/* Horizontal-scroll stage: the frozen roll-up pins left; the lanes scroll. */}
      <div className="wg-rise relative overflow-x-auto overflow-y-visible pb-4" role="group" aria-label={`${parentLabel} goals with their ${childLabel} — drag a card between lanes to move it`}>
        <div className="flex min-w-max items-stretch gap-4">
          {/* ── FROZEN PARENT COLUMN — sticky, dominant, the Vision anchor ── */}
          <aside
            className="sticky left-0 z-30 flex w-[312px] shrink-0 flex-col gap-3 rounded-2xl p-3 max-md:w-[248px]"
            style={{
              background:
                "linear-gradient(158deg, color-mix(in srgb, var(--color-altus-red) 9%, var(--color-surface-card)) 0%, var(--color-surface-card) 60%)",
              border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 26%, var(--color-hairline-strong))",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.7) inset, 22px 0 26px -22px color-mix(in srgb, var(--color-altus-red) 55%, transparent), 0 18px 40px -28px color-mix(in srgb, var(--color-altus-red) 50%, transparent)",
            }}
          >
            <div className="flex items-center gap-2 px-1 pt-0.5">
              <span
                className="grid size-7 place-items-center rounded-lg text-white"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                <Layers size={15} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--color-altus-red-deep)" }}>
                  {parentLabel} · roll-up
                </div>
                <div className="text-[12px] font-bold" style={{ color: "var(--color-ink-subtle)" }}>
                  {parents.length} goal{parents.length === 1 ? "" : "s"} · drives the {childLabel} →
                </div>
              </div>
            </div>

            {parents.length === 0 ? (
              <div
                className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center"
                style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 28%, transparent)" }}
              >
                <p className="text-[13px] font-bold" style={{ color: "var(--color-ink-soft)" }}>
                  No {parentLabel.toLowerCase()} goals yet
                </p>
                <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                  Add one on the {parentLabel} board — the {childLabel} cascade from it.
                </p>
              </div>
            ) : (
              parents.map((g, i) => (
                <ParentCard
                  key={g.id}
                  goal={g}
                  srNo={i + 1}
                  ownerName={ownerName(g)}
                  childCount={childrenByParent.get(g.id)?.length ?? 0}
                  childLabel={childLabel}
                />
              ))
            )}
          </aside>

          {/* ── CHILD LANES — droppable, sortable, the Execution surface ── */}
          {lanes.map((lane) => (
            <Lane
              key={lane.key}
              lane={lane}
              childLevel={childLevel}
              goals={childrenByLane.get(lane.key) ?? EMPTY}
              cardProps={cardProps}
              childrenByParent={childrenByParent}
              focusId={focusId}
              filtersActive={filtersActive}
              canWrite={canWrite}
              policy={policy}
              employeeId={viewedEmployeeId}
              parent={primaryParent}
            />
          ))}
        </div>
      </div>

      {/* Total footer count — quiet, tabular. */}
      <p className="wg-rise mt-1 px-1 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
        {totalChildren} {childLabel} across {lanes.length} lane{lanes.length === 1 ? "" : "s"}
        {filtersActive ? " (filtered)" : ""}
      </p>

      {/* Drag ghost — a lean copy of the carried card. */}
      <DragOverlay
        dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2,0,0,1)" }}
        style={{ width: "max-content", height: "auto" }}
      >
        {activeDrag && (
          <div
            className="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card)), var(--color-surface-card))",
              borderColor: "color-mix(in srgb, var(--color-altus-red) 48%, transparent)",
              boxShadow:
                "0 26px 60px -14px rgba(225,6,0,0.4), 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.6)",
              transform: "rotate(-2.5deg) scale(1.04)",
              cursor: "grabbing",
            }}
          >
            <ProgressRing pct={effectiveGoalPct(activeDrag)} tone={effectiveGoalPct(activeDrag) >= 100 ? "green" : pctTone(effectiveGoalPct(activeDrag))} size={36} />
            <span className="max-w-[280px] truncate text-[14px] font-bold" style={{ color: "var(--color-ink-strong)" }}>
              {activeDrag.title}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/* Frozen PARENT card — dominant, roll-up, expand/collapse detail       */
/* ------------------------------------------------------------------ */

function ParentCard({
  goal,
  srNo,
  ownerName,
  childCount,
  childLabel,
}: {
  goal: GoalDTO;
  srNo: number;
  ownerName: string;
  childCount: number;
  childLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const eff = effectiveGoalPct(goal);
  const tone = eff >= 100 ? "green" : pctTone(eff);
  const band = healthBand(eff);
  const cat = categoryStyle(goal.category, false);
  const crossed = !goal.adopted;
  const detailId = `hier-parent-${goal.id}`;

  const targetLine =
    goal.targetQty != null
      ? `${fmtNum(goal.actualQty ?? 0)} / ${fmtNum(goal.targetQty)}${goal.uom ? ` ${goal.uom}` : ""}`
      : goal.targetAmount != null
        ? `₹ ${fmtNum(goal.actualAmount ?? 0)} / ${fmtNum(goal.targetAmount)}`
        : "—";

  return (
    <article
      className="wg-sheen relative overflow-hidden rounded-2xl"
      style={{
        background: "var(--color-surface-card)",
        border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
        boxShadow: "0 10px 26px -16px color-mix(in srgb, var(--color-altus-red) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.7)",
        opacity: crossed ? 0.62 : 1,
      }}
    >
      {/* dominant left accent rail */}
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-1" style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />

      <div className="flex items-start gap-3 p-3 pl-4">
        <ProgressRing pct={eff} tone={tone} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black tabular-nums" style={{ color: "var(--color-altus-red-deep)" }}>
              {goalCode(goal)}
            </span>
            <span className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-bold" style={{ background: cat.bg, color: cat.color }}>
              {cat.label}
            </span>
            <AssignmentChip goal={goal} />
          </div>
          <h3
            className="mt-1 text-[15px] font-black leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
            style={{ color: "var(--color-ink-strong)", letterSpacing: "-0.01em", fontFamily: "var(--font-display)", textDecoration: crossed ? "line-through" : undefined }}
            title={goal.title}
          >
            {goal.title}
          </h3>
        </div>
      </div>

      {/* Roll-up row — owner · health band · % */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-black text-white ring-2 ring-white"
          title={ownerName}
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {initialsOf(ownerName) || "?"}
        </span>
        <span
          className="inline-flex flex-1 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ background: band.bg, color: band.color }}
        >
          {crossed ? "Set aside" : band.label}
        </span>
        <span className="shrink-0 text-[15px] font-black tabular-nums" style={{ color: `var(--color-${tone}-deep)`, fontFamily: "var(--font-display)" }}>
          {eff}%
        </span>
      </div>

      {/* Expand / collapse → inline detail (never leaves the board) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className={`flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-[11.5px] font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_5%,transparent)] ${FOCUS_RING}`}
        style={{ borderColor: "var(--color-hairline)", color: "var(--color-ink-subtle)" }}
      >
        <ChevronDown size={14} strokeWidth={2.6} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.18s ease", color: "var(--color-altus-red)" }} />
        {open ? "Hide detail" : "Detail"}
        {childCount > 0 && (
          <span className="ml-0.5 tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
            · {childCount} {childLabel}
          </span>
        )}
      </button>

      {open && (
        <dl id={detailId} className="grid grid-cols-2 gap-x-3 gap-y-2 border-t px-4 py-3" style={{ borderColor: "var(--color-hairline)" }}>
          <DetailCell label="Area" value={goal.area || "—"} />
          <DetailCell label="Measure" value={goal.uom || "—"} />
          <DetailCell label="Target · Actual" value={targetLine} wide />
          <DetailCell label="Weight" value={String(goal.weight)} />
          <DetailCell label="Sr. No." value={`#${srNo}`} />
        </dl>
      )}
    </article>
  );
}

function DetailCell({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[9.5px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-bold tabular-nums" style={{ color: "var(--color-ink-strong)" }} title={value}>
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One child LANE — droppable body + sortable cards + quick-add tile     */
/* ------------------------------------------------------------------ */

function Lane({
  lane,
  childLevel,
  goals,
  cardProps,
  childrenByParent,
  focusId,
  filtersActive,
  canWrite,
  policy,
  employeeId,
  parent,
}: {
  lane: LaneMeta;
  childLevel: "quarter" | "month" | "week";
  goals: GoalDTO[];
  cardProps: SharedCardProps;
  childrenByParent: Map<string, GoalDTO[]>;
  focusId: string | null;
  filtersActive: boolean;
  canWrite: boolean;
  policy: GoalPolicy;
  employeeId: string;
  parent: { id: string; title: string } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${LANE_DROP_PREFIX}${lane.key}` });
  // Week lanes are still the gap this phase — no quick-add (no week cascade rows).
  const showQuickAdd = canWrite && policy.canCreateOwnChildren && childLevel !== "week";

  return (
    <section
      aria-label={`${lane.main} — ${goals.length} goal${goals.length === 1 ? "" : "s"}`}
      className="flex w-[274px] shrink-0 flex-col rounded-2xl border-2 border-dashed transition-all"
      style={{
        background: isOver
          ? "color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-soft))"
          : "var(--color-surface-soft)",
        borderColor: isOver
          ? "var(--color-altus-red)"
          : "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
        boxShadow: isOver
          ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 14%, transparent)"
          : "0 2px 10px -8px color-mix(in srgb, var(--color-altus-red) 26%, transparent)",
      }}
    >
      <header
        className="sticky top-2 z-20 mx-2 mt-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2"
        style={{
          background: "var(--color-surface-card)",
          border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 24%, var(--color-hairline-strong))",
          boxShadow: "0 2px 10px -6px rgba(15,23,42,0.2)",
        }}
      >
        <div className="min-w-0">
          <div className="truncate text-[14px] font-black tracking-tight" style={{ color: "var(--color-ink-strong)", fontFamily: "var(--font-display)" }}>
            {lane.main}
          </div>
          {lane.sub && (
            <div className="truncate text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-subtle)" }}>
              {lane.sub}
            </div>
          )}
        </div>
        <span
          className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}
        >
          {goals.length}
        </span>
      </header>

      <div ref={setNodeRef} className="flex min-h-[96px] flex-1 flex-col gap-2.5 px-2.5 pb-2.5 pt-1">
        <SortableContext items={goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {goals.length === 0 ? (
            <p
              className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed px-3 py-6 text-center text-[12px] font-semibold"
              style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, transparent)", color: "var(--color-ink-subtle)" }}
            >
              {filtersActive ? `No matches in ${lane.main}` : `Nothing in ${lane.main} yet`}
            </p>
          ) : (
            goals.map((goal, i) => {
              const assigned = isAssigned(goal);
              // Shared / assigned goals are read-only for a non-owner — mark them
              // non-draggable (the server rejects a re-home too).
              const cp = assigned ? { ...cardProps, dragDisabled: true } : cardProps;
              return (
                <div key={goal.id} className="relative">
                  {assigned && (
                    <span
                      className="pointer-events-none absolute -top-1.5 right-2 z-10 inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wide"
                      style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline-strong)", color: "var(--color-ink-subtle)" }}
                    >
                      <Lock size={9} strokeWidth={2.6} /> Assigned
                    </span>
                  )}
                  <GoalBoardCard
                    goal={goal}
                    srNo={i + 1}
                    variant="kanban"
                    autoFocus={focusId === goal.id}
                    childGoals={childrenByParent.get(goal.id) ?? EMPTY}
                    {...cp}
                  />
                </div>
              );
            })
          )}
        </SortableContext>

        {showQuickAdd && (
          <BoardQuickAdd
            compact
            employeeId={employeeId}
            level={childLevel}
            periodKey={lane.key}
            parent={parent}
            areaOptions={cardProps.areaOptions}
            measureOptions={cardProps.measureOptions}
            typeOptions={cardProps.typeOptions}
            customLookups={cardProps.customLookups}
            isAdmin={cardProps.isAdmin}
            roster={cardProps.roster}
            currentCount={goals.length}
            mutation={cardProps.mutation}
            existingTitles={goals.map((g) => g.title)}
          />
        )}
      </div>
    </section>
  );
}
