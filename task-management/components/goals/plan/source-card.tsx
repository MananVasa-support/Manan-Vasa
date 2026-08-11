"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Check, Trash2 } from "lucide-react";
import type { SourceItem } from "./types";
import { DueParts, MetaLine, PriorityText, Sep, SourceTagChip, StatusText, periodLabel } from "./row-bits";

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
 * One row of Available Work: title on its own line, metadata layered beneath it,
 * and a single primary action on the right.
 *
 * The title is the strongest thing in the row and truncates on one line, so a
 * long name can never push the action off-screen or reflow the list.
 *
 * A row is a REFERENCE, never a copy: `item.id` is the real `tasks.id` /
 * `weekly_goals.id` / `goals.id` / prior `daily_checklist.id`, and adding it
 * calls the matching server action, which stores that id on the plan row.
 */
export function SourceCard({ item, today, onAdd, onAbandon }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceDragId(item),
    data: { type: "source", kind: item.kind, sourceId: item.id, title: item.title, subtitle: item.subtitle },
    disabled: item.added,
  });

  const isTask = item.kind === "task";
  const isCarryover = item.kind === "unfinished";
  const period = periodLabel(item.kind);
  // A carryover row is identified by what it ORIGINALLY was — the tab it lives
  // in already says "Carryover", so repeating that tag would be noise.
  const tagKind = isCarryover ? (item.originKind ?? "unfinished") : item.kind;
  // The payload phrases this as "From 29 Jul" (or "Carried over" when the
  // source day is unknown); the row wants the fuller "Carryover from 29 Jul".
  const carryoverLabel = !isCarryover
    ? null
    : item.dueLabel?.startsWith("From ")
      ? `Carryover from ${item.dueLabel.slice(5)}`
      : "Carried over";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : item.added ? 0.55 : 1 }}
      className="group flex items-center gap-3 rounded-lg py-3.5 pl-1 pr-1 transition-colors hover:bg-surface-soft/50"
    >
      <button
        type="button"
        aria-label={item.added ? "Already on today's plan" : `Drag ${item.title} into today's plan`}
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-ink-muted/25 transition-colors hover:text-ink-muted focus-visible:outline-2 group-hover:text-ink-muted/60 disabled:cursor-default disabled:opacity-20 max-sm:hidden"
        style={{ outlineColor: ACCENT }}
        disabled={item.added}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold leading-[21px] text-ink-strong">{item.title}</div>

        {/* Identity line — what this is and where it comes from. */}
        <MetaLine>
          <SourceTagChip kind={tagKind} />
          {carryoverLabel ? (
            <>
              <Sep />
              <span>{carryoverLabel}</span>
            </>
          ) : null}
          {period ? (
            <>
              <Sep />
              <span>{period}</span>
            </>
          ) : null}
          {isTask && item.taskNo ? (
            <>
              <Sep />
              <span className="tabular-nums">#{item.taskNo}</span>
            </>
          ) : null}
          {item.project ? (
            <>
              <Sep />
              <span className="truncate">{item.project}</span>
            </>
          ) : !isTask && item.subtitle ? (
            <>
              <Sep />
              <span className="truncate">{item.subtitle}</span>
            </>
          ) : null}
          {!isTask && !isCarryover && item.meta ? (
            <>
              <Sep />
              <span className="tabular-nums">{item.meta}</span>
            </>
          ) : null}
        </MetaLine>

        {/* Status line — only WMS tasks have one, and it stays separate from the
            identity line so due/priority/status read as a group. */}
        {isTask ? (
          <MetaLine className="!mt-1.5">
            <DueParts dueYmd={item.dueYmd} today={today} />
            {item.priority ? (
              <>
                <Sep />
                <PriorityText priority={item.priority} />
              </>
            ) : null}
            {item.status ? (
              <>
                <Sep />
                <StatusText status={item.status} />
              </>
            ) : null}
          </MetaLine>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onAbandon && item.taskId ? (
          <button
            type="button"
            onClick={() => onAbandon(item)}
            aria-label={`Abandon ${item.title} (moves to Recycle Bin)`}
            title="Abandon — moves to Recycle Bin"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted/45 opacity-0 transition-[opacity,color] hover:text-[color:var(--color-red-deep)] focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
            style={{ outlineColor: ACCENT }}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onAdd(item)}
          disabled={item.added}
          aria-label={item.added ? `${item.title} is already on today's plan` : `Add ${item.title} to today's plan`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-bold transition-colors focus-visible:outline-2"
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
              <Check size={13} strokeWidth={3} /> On Today
            </>
          ) : (
            <>
              <Plus size={13} strokeWidth={3} />
              <span className="max-sm:hidden">Add to Today</span>
              <span className="sm:hidden">Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
