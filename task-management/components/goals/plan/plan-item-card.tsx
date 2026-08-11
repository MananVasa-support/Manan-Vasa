"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, X } from "lucide-react";
import type { PlanItem } from "./types";
import { Dot, MetaLine, PeriodLabel, SourceTagChip } from "./row-bits";

const ACCENT = "#E10600";

interface Props {
  item: PlanItem;
  index: number;
  /** Marking done is disabled while the row's write is in flight. */
  busy?: boolean;
  onToggleDone: (item: PlanItem) => void;
  onRemove: (id: string) => void;
}

/**
 * One committed line in Today's Plan — ordered, completable, removable.
 *
 * The row shows WHERE the work came from with the same `[GOAL]` / `[GOAL TASK]`
 * / `[WMS TASK]` tag the Available Work column used, so an item keeps its
 * identity when it crosses the board.
 */
export function PlanItemCard({ item, index, busy, onToggleDone, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  // The live drag placeholder — a dashed gap the plan opens up around.
  if (item.ghost) {
    return (
      <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
        <div
          className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
            background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
          }}
        >
          <span className="truncate text-[13.5px] font-medium text-ink-strong/60">{item.title}</span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: ACCENT }}>
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
      <div
        className="group flex items-start gap-2.5 rounded-lg py-2 pl-1 pr-1.5 transition-colors hover:bg-surface-soft/60"
        style={isDragging ? { background: "var(--color-surface-card)", boxShadow: "0 8px 24px rgba(15,23,42,0.14)" } : undefined}
      >
        <button
          type="button"
          aria-label={`Reorder ${item.title}`}
          className="mt-[5px] shrink-0 cursor-grab touch-none rounded text-ink-muted/30 transition-colors hover:text-ink-muted focus-visible:outline-2 group-hover:text-ink-muted/70"
          style={{ outlineColor: ACCENT }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>

        <button
          type="button"
          onClick={() => onToggleDone(item)}
          disabled={busy}
          aria-pressed={item.done}
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} complete`}
          className="mt-[2px] inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors focus-visible:outline-2 disabled:opacity-60"
          style={
            item.done
              ? { background: "var(--color-green-deep)", borderColor: "var(--color-green-deep)", outlineColor: ACCENT }
              : { borderColor: "var(--color-hairline-strong)", outlineColor: ACCENT }
          }
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin text-ink-muted" />
          ) : item.done ? (
            <Check size={12} strokeWidth={3.5} className="text-white" />
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="shrink-0 text-[11px] font-bold tabular-nums text-ink-muted/50"
              style={{ minWidth: "1.1em" }}
            >
              {index + 1}
            </span>
            <span
              className={
                "min-w-0 flex-1 truncate text-[13.5px] leading-[19px] " +
                (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
              }
            >
              {item.title}
            </span>
          </div>
          <MetaLine>
            <SourceTagChip kind={item.kind} />
            <PeriodLabel kind={item.kind} />
            {item.subtitle ? (
              <>
                <Dot />
                <span className="truncate">{item.subtitle}</span>
              </>
            ) : null}
          </MetaLine>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.title} from today's plan`}
          className="mt-[1px] inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted/50 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
          style={{ outlineColor: ACCENT }}
        >
          <X size={13} />
        </button>
      </div>
    </li>
  );
}
