"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { motion } from "motion/react";
import type { PlanItem, PlanKind } from "./types";

const KIND_LABEL: Record<PlanKind, string> = {
  weekly: "Weekly goal",
  monthly: "Monthly goal",
  quarterly: "Quarter goal",
  yearly: "Yearly goal",
  task: "Task",
  adhoc: "Commitment",
};

// Goals module identity (amber-gold) — mirrors MODULE_THEME.goals. Used for the
// weekly kind-dot + focus rings so the planner reads as an amber room, not WMS red.
const GOALS_ACCENT = "#b45309";

// Kind-dots map to real brand status tokens (no undefined --color-emerald leak).
const KIND_ACCENT: Record<PlanKind, string> = {
  weekly: GOALS_ACCENT,
  monthly: "var(--color-purple-deep)",
  quarterly: "var(--color-blue-deep)",
  yearly: "var(--color-indigo-deep)",
  task: "var(--color-slate)",
  adhoc: "var(--color-green-deep)",
};

interface Props {
  item: PlanItem;
  index: number;
  onRemove: (id: string) => void;
}

/** One ordered commitment in "Today's Plan" — sortable + removable. */
export function PlanItemCard({ item, index, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  // The live drag placeholder — a dashed ghost the plan opens up around.
  if (item.ghost) {
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className="list-none"
      >
        <div
          className="flex items-center gap-3 rounded-chip border border-dashed px-3 py-3"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 55%, transparent)`,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 6%, transparent)`,
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-strong/70">{item.title}</div>
          </div>
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: GOALS_ACCENT }}
          >
            Drop here
          </span>
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className="list-none"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="group flex items-center gap-2.5 rounded-chip border border-hairline bg-surface-card px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
        style={isDragging ? { boxShadow: "0 10px 30px rgba(15,23,42,0.16)" } : undefined}
      >
        <button
          type="button"
          aria-label={`Reorder ${item.title}`}
          className="shrink-0 cursor-grab touch-none text-ink-muted/50 hover:text-ink-muted focus-visible:outline-2 rounded"
          style={{ outlineColor: GOALS_ACCENT }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-soft text-[11px] font-bold text-ink-muted tabular-nums"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-strong">{item.title}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: KIND_ACCENT[item.kind] }}
              aria-hidden
            />
            <span className="truncate text-xs text-ink-muted">
              {KIND_LABEL[item.kind]}
              {item.subtitle ? ` · ${item.subtitle}` : ""}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.title} from today's plan`}
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
          style={{ outlineColor: GOALS_ACCENT }}
        >
          <X size={15} />
        </button>
      </motion.div>
    </li>
  );
}
