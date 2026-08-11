"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, X } from "lucide-react";
import type { PlanItem } from "./types";
import { MetaLine, Sep, SourceTagChip, periodLabel } from "./row-bits";

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
 * One committed line in Today's Plan.
 *
 * The title is the strongest text in the row; the source tag sits under it as
 * secondary information. Nothing else competes — this column is for reading
 * what you said you'd do, not for auditing task metadata.
 */
export function PlanItemCard({ item, index, busy, onToggleDone, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  const period = periodLabel(item.kind);

  // The live drag placeholder — a dashed gap the plan opens up around.
  if (item.ghost) {
    return (
      <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
        <div
          className="my-1 flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3.5"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
            background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
          }}
        >
          <span className="truncate text-[14.5px] font-medium text-ink-strong/60">{item.title}</span>
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: ACCENT }}>
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
        className="group flex items-start gap-3 rounded-lg py-3.5 pl-1 pr-1 transition-colors hover:bg-surface-soft/50"
        style={
          isDragging
            ? { background: "var(--color-surface-card)", boxShadow: "0 8px 24px rgba(15,23,42,0.14)" }
            : undefined
        }
      >
        <button
          type="button"
          aria-label={`Reorder ${item.title}`}
          className="mt-[3px] shrink-0 cursor-grab touch-none rounded p-0.5 text-ink-muted/25 transition-colors hover:text-ink-muted focus-visible:outline-2 group-hover:text-ink-muted/60"
          style={{ outlineColor: ACCENT }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>

        <button
          type="button"
          onClick={() => onToggleDone(item)}
          disabled={busy}
          aria-pressed={item.done}
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} complete`}
          className="mt-[2px] inline-flex size-[19px] shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-2 disabled:opacity-60"
          style={
            item.done
              ? { background: "var(--color-green-deep)", borderColor: "var(--color-green-deep)", outlineColor: ACCENT }
              : { borderColor: "var(--color-hairline-strong)", outlineColor: ACCENT }
          }
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin text-ink-muted" />
          ) : item.done ? (
            <Check size={12} strokeWidth={3.5} className="text-white" />
          ) : null}
        </button>

        <span
          aria-hidden
          className="mt-[2px] shrink-0 text-[12.5px] font-semibold tabular-nums leading-[21px] text-ink-muted/55"
        >
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div
            className={
              "truncate text-[14.5px] leading-[21px] " +
              (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
            }
          >
            {item.title}
          </div>
          <MetaLine>
            <SourceTagChip kind={item.kind} />
            {period ? (
              <>
                <Sep />
                <span>{period}</span>
              </>
            ) : null}
            {item.subtitle ? (
              <>
                <Sep />
                <span className="truncate">{item.subtitle}</span>
              </>
            ) : null}
          </MetaLine>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.title} from today's plan`}
          className="mt-[1px] inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted/45 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
          style={{ outlineColor: ACCENT }}
        >
          <X size={15} />
        </button>
      </div>
    </li>
  );
}
