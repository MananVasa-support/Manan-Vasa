"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Check, Trash2 } from "lucide-react";
import type { SourceItem } from "./types";
import { DueChip, Dot, MetaLine, PeriodLabel, PriorityChip, SourceTagChip, StatusChip } from "./row-bits";

/** dnd id for a source card — namespaced so it never collides with plan row ids. */
export function sourceDragId(item: SourceItem): string {
  return `src::${item.kind}::${item.id}`;
}

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface Props {
  item: SourceItem;
  /** IST today (YYYY-MM-DD) — the reference the due chip compares against. */
  today: string;
  /** No-drag quick path — add straight to today's plan. */
  onAdd: (item: SourceItem) => void;
  /** Abandon the underlying task → Recycle Bin (only for task-linked cards). */
  onAbandon?: (item: SourceItem) => void;
}

/**
 * One row of Available Work. Drag it into Today's Plan, or press "+ Add".
 *
 * A row is a REFERENCE, never a copy: `item.id` is the real `tasks.id` /
 * `weekly_goals.id` / `goals.id` / prior `daily_checklist.id`, and adding it
 * calls the matching server action, which stores that id on the plan row. No
 * Goal, Goal Task or WMS Task is ever created from this button.
 *
 * Compact by design — a single line of title plus one meta line, no card
 * chrome, so twenty rows scan as a list rather than twenty boxes.
 */
export function SourceCard({ item, today, onAdd, onAbandon }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceDragId(item),
    data: { type: "source", kind: item.kind, sourceId: item.id, title: item.title, subtitle: item.subtitle },
    disabled: item.added,
  });

  const isTask = item.kind === "task";
  const isCarryover = item.kind === "unfinished";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : item.added ? 0.5 : 1 }}
      className="group flex items-start gap-2 rounded-lg py-2 pl-1 pr-1.5 transition-colors hover:bg-surface-soft/60"
    >
      <button
        type="button"
        aria-label={item.added ? "Already on today's plan" : `Drag ${item.title} into today's plan`}
        className="mt-[3px] shrink-0 cursor-grab touch-none rounded text-ink-muted/30 transition-colors hover:text-ink-muted focus-visible:outline-2 group-hover:text-ink-muted/70 disabled:cursor-default disabled:opacity-20"
        style={{ outlineColor: ACCENT }}
        disabled={item.added}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-[19px] text-ink-strong">
            {item.title}
          </span>
          {/* Task ID — the number a user quotes. Kept on the title line so it
              stays findable no matter how long the meta line gets. */}
          {item.taskNo ? (
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-muted/70">
              #{item.taskNo}
            </span>
          ) : item.meta ? (
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-muted/70">{item.meta}</span>
          ) : null}
        </div>

        <MetaLine>
          <SourceTagChip kind={item.kind} />
          {/* A carryover row names the source it came FROM, so "add" is
              obviously a re-commitment, not a new item. */}
          {isCarryover && item.originKind ? (
            <>
              <Dot />
              <span>from</span>
              <SourceTagChip kind={item.originKind} />
            </>
          ) : null}
          <PeriodLabel kind={item.kind} />

          {item.project ? (
            <>
              <Dot />
              <span className="truncate">{item.project}</span>
            </>
          ) : item.subtitle && !isTask ? (
            <>
              <Dot />
              <span className="truncate">{item.subtitle}</span>
            </>
          ) : null}

          {isTask ? (
            <>
              <Dot />
              <DueChip dueYmd={item.dueYmd} today={today} />
              {item.priority ? (
                <>
                  <Dot />
                  <PriorityChip priority={item.priority} />
                </>
              ) : null}
              {item.status ? (
                <>
                  <Dot />
                  <StatusChip status={item.status} />
                </>
              ) : null}
            </>
          ) : item.dueLabel ? (
            <>
              <Dot />
              <span style={item.overdue ? { color: "var(--color-red-deep)", fontWeight: 700 } : undefined}>
                {item.dueLabel}
              </span>
            </>
          ) : null}
        </MetaLine>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onAbandon && item.taskId ? (
          <button
            type="button"
            onClick={() => onAbandon(item)}
            aria-label={`Abandon ${item.title} (moves to Recycle Bin)`}
            title="Abandon — moves to Recycle Bin"
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-muted/50 opacity-0 transition-[opacity,color] hover:text-[color:var(--color-red-deep)] focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
            style={{ outlineColor: ACCENT }}
          >
            <Trash2 size={12.5} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onAdd(item)}
          disabled={item.added}
          aria-label={item.added ? `${item.title} is already on today's plan` : `Add ${item.title} to today's plan`}
          className="inline-flex h-[26px] items-center gap-1 rounded-md border px-2 text-[11.5px] font-bold transition-colors focus-visible:outline-2"
          style={
            item.added
              ? {
                  borderColor: "transparent",
                  background: "var(--color-green-bg)",
                  color: "var(--color-green-deep)",
                  outlineColor: ACCENT,
                }
              : {
                  borderColor: "var(--color-hairline-strong)",
                  color: ACCENT_DEEP,
                  outlineColor: ACCENT,
                }
          }
        >
          {item.added ? (
            <>
              <Check size={12} strokeWidth={3} /> On Today
            </>
          ) : (
            <>
              <Plus size={12} strokeWidth={3} /> Add to Today
            </>
          )}
        </button>
      </div>
    </div>
  );
}
