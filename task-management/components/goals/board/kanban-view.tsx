"use client";

/**
 * Goals LEVEL BOARD — KANBAN VIEW.
 *
 * The period buckets rendered as side-by-side COLUMNS:
 *   · Quarterly → Q1 | Q2 | Q3 | Q4 (responsive grid),
 *   · Monthly   → the 12 FY months as columns, horizontally scrollable and
 *     grouped under their quarter labels.
 *
 * Each column is a `bucket:` droppable — the SAME drop-id contract as the list
 * view's period pills, so the board's one `onDragEnd` re-periods a card dropped
 * on a column (moveGoalToPeriod, optimistic w/ Undo) and reorders within a
 * column (reorderGoals). Dropping onto a CARD in another column re-buckets too
 * (handled upstream). Cards are the compact `variant="kanban"` GoalBoardCard —
 * same drawers, same ⋯ menu, same policy. Empty columns read "Nothing in Q3
 * yet" and still accept drops; every column footer carries the calm dashed
 * "+ Add goal" tile scoped to that bucket.
 */

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  type GoalDTO,
  periodKeyLabel,
  periodKeyShort,
} from "@/components/goals/cascade/util";
import { monthKeysOfQuarter } from "@/lib/goals/types";
import type { GoalMutationApi } from "@/components/goals/canvas/optimistic";
import { GoalBoardCard, type SharedCardProps } from "./goal-board-card";
import { BoardQuickAdd } from "./board-quick-add";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const BUCKET_DROP_PREFIX = "bucket:";

/** Stable empty-children identity (mirrors the list view). */
const EMPTY_CHILDREN: GoalDTO[] = [];

export interface KanbanBoardProps {
  level: "quarter" | "month";
  fyStartYear: number;
  /** Every bucket key → its FILTERED, Sr.-No.-sorted goals. */
  goalsByBucket: Map<string, GoalDTO[]>;
  /** The bucket the page's score card is scoped to (column header highlights). */
  selectedKey: string;
  /** Clicking a column header selects that bucket (shareable URL, score card). */
  onSelectBucket: (key: string) => void;
  cardProps: SharedCardProps;
  childrenByParent: Map<string, GoalDTO[]>;
  employeeId: string;
  parentOf: (bucketKey: string) => { id: string; title: string } | null;
  areaOptions: string[];
  mutation: GoalMutationApi;
  focusId: string | null;
  /** Drag is paused while filters narrow the columns (partial-order guard). */
  filtersActive: boolean;
}

export function KanbanBoard(props: KanbanBoardProps) {
  if (props.level === "quarter") {
    const quarters = [...props.goalsByBucket.keys()];
    return (
      <div
        className="wg-rise grid grid-cols-4 gap-3.5 max-xl:grid-cols-2 max-md:grid-cols-1"
        role="group"
        aria-label="Quarters — drag a goal between columns to move it"
      >
        {quarters.map((k) => (
          <KanbanColumn key={k} bucketKey={k} {...props} />
        ))}
      </div>
    );
  }

  // Monthly — 12 columns, horizontally scrollable, grouped by quarter.
  return (
    <div
      className="wg-rise overflow-x-auto pb-3 -mx-1 px-1"
      role="group"
      aria-label="Months of the financial year — drag a goal between columns to move it"
    >
      <div className="flex min-w-max items-start gap-5">
        {([1, 2, 3, 4] as const).map((q) => (
          <section key={q} aria-label={periodKeyLabel(`${props.fyStartYear}-Q${q}`)} className="shrink-0">
            <h3
              className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              {periodKeyLabel(`${props.fyStartYear}-Q${q}`)}
            </h3>
            <div className="flex items-start gap-3.5">
              {monthKeysOfQuarter(props.fyStartYear, q).map((k) => (
                <KanbanColumn key={k} bucketKey={k} fixedWidth {...props} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One column — header (label · count), droppable body, quick-add      */
/* ------------------------------------------------------------------ */

function KanbanColumn({
  bucketKey,
  fixedWidth = false,
  ...props
}: KanbanBoardProps & { bucketKey: string; fixedWidth?: boolean }) {
  const goals = props.goalsByBucket.get(bucketKey) ?? EMPTY_CHILDREN;
  const active = bucketKey === props.selectedKey;
  const label = props.level === "quarter" ? periodKeyLabel(bucketKey) : periodKeyShort(bucketKey);
  const { setNodeRef, isOver } = useDroppable({ id: `${BUCKET_DROP_PREFIX}${bucketKey}` });
  const canWrite = props.cardProps.canWrite;

  return (
    <section
      aria-label={`${periodKeyLabel(bucketKey)} — ${goals.length} goal${goals.length === 1 ? "" : "s"}`}
      className={`flex flex-col rounded-2xl border-2 border-dashed transition-all ${fixedWidth ? "w-[272px] shrink-0" : "min-w-0"}`}
      style={{
        background: isOver
          ? "color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-soft))"
          : "var(--color-surface-soft)",
        borderColor: isOver
          ? "var(--color-altus-red)"
          : "color-mix(in srgb, var(--color-altus-red) 35%, var(--color-hairline-strong))",
        boxShadow: isOver
          ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 14%, transparent)"
          : "0 2px 10px -6px color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
      }}
    >
      <header className="flex items-center justify-center gap-2 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => props.onSelectBucket(bucketKey)}
          aria-pressed={active}
          title={`Focus ${periodKeyLabel(bucketKey)} (score card + shareable URL)`}
          className={`cursor-pointer truncate rounded-md text-[15px] font-extrabold tracking-tight transition-colors hover:text-[var(--color-altus-red-deep)] ${FOCUS_RING}`}
          style={{ color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
        >
          {label}
        </button>
        <span
          className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
          style={
            active
              ? { background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red-deep)" }
              : { background: "var(--color-surface-card)", color: "var(--color-ink-subtle)", border: "1px solid var(--color-hairline)" }
          }
        >
          {goals.length}
        </span>
        {active && (
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: "var(--color-altus-red)" }}
          />
        )}
      </header>

      {/* Droppable body — empty columns are still full-height drop targets. */}
      <div ref={setNodeRef} className="flex min-h-[96px] flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
        <SortableContext items={goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          {goals.length === 0 ? (
            <p
              className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed px-3 py-6 text-center text-[12.5px] font-semibold"
              style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)", color: "var(--color-ink-subtle)" }}
            >
              {props.filtersActive ? `No matches in ${label}` : `Nothing in ${label} yet`}
            </p>
          ) : (
            goals.map((goal, i) => (
              <GoalBoardCard
                key={goal.id}
                goal={goal}
                srNo={i + 1}
                variant="kanban"
                autoFocus={props.focusId === goal.id}
                childGoals={props.childrenByParent.get(goal.id) ?? EMPTY_CHILDREN}
                {...props.cardProps}
              />
            ))
          )}
        </SortableContext>

        {canWrite && (
          <BoardQuickAdd
            compact
            employeeId={props.employeeId}
            level={props.level}
            periodKey={bucketKey}
            parent={props.parentOf(bucketKey)}
            areaOptions={props.areaOptions}
            currentCount={goals.length}
            mutation={props.mutation}
          />
        )}
      </div>
    </section>
  );
}
