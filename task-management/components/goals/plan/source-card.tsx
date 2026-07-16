"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Check } from "lucide-react";
import { motion } from "motion/react";
import type { SourceItem } from "./types";

/** dnd id for a source card — namespaced so it never collides with plan row ids. */
export function sourceDragId(item: SourceItem): string {
  return `src::${item.kind}::${item.id}`;
}

// Goals module identity (amber-gold) — mirrors MODULE_THEME.goals.
const GOALS_ACCENT = "#b45309";
const GOALS_ACCENT_DEEP = "#7c2d12";

// Kind accent bars map to real brand status tokens (weekly carries the goals amber).
const KIND_ACCENT: Record<SourceItem["kind"], string> = {
  weekly: GOALS_ACCENT,
  monthly: "var(--color-purple-deep)",
  quarterly: "var(--color-blue-deep)",
  yearly: "var(--color-indigo-deep)",
  task: "var(--color-slate)",
};

interface Props {
  item: SourceItem;
  /** No-drag quick path — add straight to today's plan. */
  onAdd: (item: SourceItem) => void;
}

/**
 * A draggable card in a right-hand source window. Drag it into "Today's Plan",
 * or use the "+ Add to today" quick button (no-drag path). Keyboard users tab to
 * the grip and use the dnd-kit keyboard sensor, or press the + button.
 */
export function SourceCard({ item, onAdd }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: sourceDragId(item),
    data: { type: "source", kind: item.kind, sourceId: item.id, title: item.title, subtitle: item.subtitle },
    disabled: item.added,
  });

  const accent = KIND_ACCENT[item.kind];

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: item.added ? 0.55 : 1, y: 0 }}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : undefined }}
      className="group flex items-center gap-2 rounded-chip border border-hairline bg-surface-card px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:border-hairline-strong hover:shadow-[0_6px_18px_rgba(124,45,18,0.08)]"
    >
      <button
        type="button"
        aria-label={item.added ? "Already on today's plan" : `Drag ${item.title} into today's plan`}
        className="shrink-0 cursor-grab touch-none text-ink-muted/50 hover:text-ink-muted disabled:cursor-default disabled:opacity-30 focus-visible:outline-2 rounded"
        style={{ outlineColor: GOALS_ACCENT }}
        disabled={item.added}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>
      <span
        aria-hidden
        className="h-7 w-[3px] shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-strong">{item.title}</div>
        {item.subtitle ? (
          <div className="truncate text-xs text-ink-muted">{item.subtitle}</div>
        ) : null}
      </div>
      {item.meta ? (
        <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-ink-muted tabular-nums">
          {item.meta}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onAdd(item)}
        disabled={item.added}
        aria-label={item.added ? "Added to today" : `Add ${item.title} to today`}
        className="wg-btn shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-100 focus-visible:outline-2"
        style={
          item.added
            ? {
                borderColor: "color-mix(in srgb, var(--color-green-deep) 30%, transparent)",
                background: "var(--color-green-bg)",
                color: "var(--color-green-deep)",
                outlineColor: GOALS_ACCENT,
              }
            : {
                borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 32%, transparent)`,
                background: `color-mix(in srgb, ${GOALS_ACCENT} 8%, transparent)`,
                color: GOALS_ACCENT_DEEP,
                outlineColor: GOALS_ACCENT,
              }
        }
      >
        {item.added ? <Check size={14} /> : <Plus size={15} />}
      </button>
    </motion.div>
  );
}
