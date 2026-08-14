"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Check, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { PRIORITY_LABELS } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import type { SourceItem } from "./types";
import { KIND_PERIOD, OverdueTag, SourceTag, fmtYmd } from "./source-tag";
import { ItemHoverCard, ItemDetailModal } from "./item-detail";

/** dnd id for a source card — namespaced so it never collides with plan row ids. */
export function sourceDragId(item: SourceItem): string {
  return `src::${item.kind}::${item.id}`;
}

const GOALS_ACCENT = "#E10600";
const GOALS_ACCENT_DEEP = "#A80400";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

interface Props {
  item: SourceItem;
  /** The viewed plan date (YYYY-MM-DD) — what the due marks compare against. */
  today: string;
  /** No-drag quick path — add straight to the viewed day's plan. */
  onAdd: (item: SourceItem) => void;
  /** Abandon the underlying task → Recycle Bin (only for task-linked cards). */
  onAbandon?: (item: SourceItem) => void;
  /** "Today" | "Tomorrow" | "Day after" — the add button's day label. */
  dayLabel?: string;
}

/**
 * A draggable card in one of the three source columns. Drag it into "Today's
 * Plan", or press "+ Add to Today".
 *
 * A card is a REFERENCE, never a copy: `item.id` is the real `tasks.id` /
 * `weekly_goals.id` / `goals.id` / prior `daily_checklist.id`, and adding it
 * calls the matching server action, which stores that id on the plan row. No
 * Goal, Goal Task or WMS Task is ever created here.
 */
export function SourceCard({ item, today, onAdd, onAbandon, dayLabel = "Today" }: Props) {
  const [detail, setDetail] = React.useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceDragId(item),
    data: { type: "source", kind: item.kind, sourceId: item.id, title: item.title, subtitle: item.subtitle },
    disabled: item.added,
  });

  const isTask = item.kind === "task";
  const isCarryover = item.kind === "unfinished";
  const period = KIND_PERIOD[item.kind];
  const overdue = isTask ? item.dueYmd != null && item.dueYmd < today : !!item.overdue;
  const dueToday = isTask && item.dueYmd === today;

  return (
    <ItemHoverCard item={item} today={today}>
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: item.added ? 0.55 : 1, y: 0 }}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined }}
      className="group relative rounded-xl border border-hairline bg-surface-card px-2.5 py-2 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:border-hairline-strong hover:shadow-[0_6px_18px_rgba(124,45,18,0.08)]"
    >
      {/* A small circular + pinned top-right (Sir: the full-width "Add to Today"
          button ate too much vertical space in a three-column board). Same single
          action, ~1/6th the footprint; it turns into a green tick once added. */}
      <button
        type="button"
        onClick={() => onAdd(item)}
        disabled={item.added}
        title={item.added ? `Already on ${dayLabel}'s plan` : `Add to ${dayLabel}`}
        aria-label={item.added ? `${item.title} is already planned` : `Add ${item.title} to ${dayLabel}`}
        className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus-visible:outline-2 disabled:cursor-default disabled:hover:scale-100"
        style={{
          background: item.added ? "var(--color-green-deep)" : GOALS_GRADIENT,
          outlineColor: GOALS_ACCENT,
        }}
      >
        {item.added ? <Check size={13} strokeWidth={3.4} /> : <Plus size={14} strokeWidth={3.2} />}
      </button>

      <div className="flex items-start gap-1.5 pr-7">
        <button
          type="button"
          aria-label={item.added ? "Already on today's plan" : `Drag ${item.title} into today's plan`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted focus-visible:outline-2 disabled:cursor-default disabled:opacity-25"
          style={{ outlineColor: GOALS_ACCENT }}
          disabled={item.added}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>

        <div className="min-w-0 flex-1" onDoubleClick={() => setDetail(true)} title="Double-click for full detail">
          <div className="truncate text-[13px] font-semibold leading-[18px] text-ink-strong">
            {item.title}
          </div>

          {/* Identity line — what this is and where it came from. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-[15px] text-ink-muted">
            <SourceTag kind={isCarryover ? (item.originKind ?? "unfinished") : item.kind} />
            {period ? <span>{period}</span> : null}
            {isTask && item.taskNo ? <span className="tabular-nums">#{item.taskNo}</span> : null}
            {item.project ? (
              <span className="truncate">{item.project}</span>
            ) : !isTask && item.subtitle ? (
              <span className="truncate">{item.subtitle}</span>
            ) : null}
            {!isTask && !isCarryover && item.meta ? (
              <span className="tabular-nums">{item.meta}</span>
            ) : null}
          </div>

          {/* Status line. WMS tasks show due · priority · status; a carried-over
              row shows that it is carried over and which day from. */}
          {isTask ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-[15px] text-ink-muted">
              {overdue ? (
                <>
                  <OverdueTag />
                  <span className="font-semibold tabular-nums" style={{ color: RISK }}>
                    {fmtYmd(item.dueYmd)}
                  </span>
                </>
              ) : dueToday ? (
                <span className="font-semibold" style={{ color: WARN }}>
                  Due today
                </span>
              ) : item.dueYmd ? (
                <span className="tabular-nums">Due {fmtYmd(item.dueYmd)}</span>
              ) : (
                <span className="text-ink-muted/70">No due date</span>
              )}
              {item.priority ? (
                <span
                  className={item.important ? "font-semibold" : undefined}
                  style={item.priority === "imp_urgent" ? { color: RISK } : item.important ? { color: WARN } : undefined}
                >
                  {PRIORITY_LABELS[item.priority]}
                </span>
              ) : null}
              {item.status ? <span>{STATUS_LABELS_FALLBACK[item.status] ?? item.status}</span> : null}
            </div>
          ) : isCarryover ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-[15px]">
              <OverdueTag label="Carried Over" />
              {item.fromYmd ? (
                <span className="tabular-nums text-ink-muted">from {fmtYmd(item.fromYmd)}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {onAbandon && item.taskId ? (
          <button
            type="button"
            onClick={() => onAbandon(item)}
            aria-label={`Abandon ${item.title} (moves to Recycle Bin)`}
            title="Abandon — moves to Recycle Bin"
            className="shrink-0 inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-[color:var(--color-altus-red)] focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
            style={{ outlineColor: GOALS_ACCENT }}
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>

    </motion.div>
    {detail ? (
      <ItemDetailModal
        item={item}
        today={today}
        onClose={() => setDetail(false)}
        onAdd={() => onAdd(item)}
        addLabel={`Add to ${dayLabel}`}
      />
    ) : null}
    </ItemHoverCard>
  );
}
