"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import type { PlanItem } from "./types";
import { KIND_PERIOD, SourceTag } from "./source-tag";

// Goals module identity — mirrors MODULE_THEME.goals.
const GOALS_ACCENT = "#E10600";

interface Props {
  item: PlanItem;
  index: number;
  /** Marking done is disabled while this row's write is in flight. */
  busy?: boolean;
  onToggleDone: (item: PlanItem) => void;
  onRemove: (id: string) => void;
}

/** One ordered commitment in "Today's Plan" — sortable, completable, removable. */
export function PlanItemCard({ item, index, busy, onToggleDone, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  const period = KIND_PERIOD[item.kind];

  // The live drag placeholder — a dashed ghost the plan opens up around.
  if (item.ghost) {
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className="list-none"
      >
        <div
          className="flex items-center gap-3 rounded-chip border px-3 py-3"
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
        className="group flex items-start gap-2 rounded-chip border border-hairline bg-surface-card px-2.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
        style={isDragging ? { boxShadow: "0 10px 30px rgba(15,23,42,0.16)" } : undefined}
      >
        <button
          type="button"
          aria-label={`Reorder ${item.title}`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-ink-muted/40 hover:text-ink-muted focus-visible:outline-2"
          style={{ outlineColor: GOALS_ACCENT }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>

        {/* Complete — the same `setItemProgress` write the close-out screen
            uses, so ticking here runs the identical reflect-to-source pipeline. */}
        <button
          type="button"
          onClick={() => onToggleDone(item)}
          disabled={busy}
          aria-pressed={item.done}
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} complete`}
          className="mt-0.5 inline-flex size-[17px] shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-2 disabled:opacity-60"
          style={
            item.done
              ? { background: "var(--color-green-deep)", borderColor: "var(--color-green-deep)", outlineColor: GOALS_ACCENT }
              : { borderColor: "var(--color-hairline-strong)", outlineColor: GOALS_ACCENT }
          }
        >
          {busy ? (
            <Loader2 size={10} className="animate-spin text-ink-muted" />
          ) : item.done ? (
            <Check size={11} strokeWidth={3.5} className="text-white" />
          ) : null}
        </button>

        <span
          aria-hidden
          className="mt-0.5 shrink-0 text-[11px] font-bold tabular-nums leading-[18px] text-ink-muted/60"
        >
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div
            className={
              "truncate text-[13px] leading-[18px] " +
              (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
            }
          >
            {item.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            <SourceTag kind={item.kind} />
            {period ? <span>{period}</span> : null}
            {item.subtitle ? <span className="truncate">{item.subtitle}</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.title} from today's plan`}
          className="shrink-0 inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
          style={{ outlineColor: GOALS_ACCENT }}
        >
          <X size={14} />
        </button>
      </motion.div>
    </li>
  );
}
