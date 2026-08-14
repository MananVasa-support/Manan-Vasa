"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Loader2, Pencil, X } from "lucide-react";
import { motion } from "motion/react";
import type { PlanItem } from "./types";
import { KIND_PERIOD, SourceTag } from "./source-tag";
import { HoverTip } from "@/components/ui/hover-tip";
import { TransferControl } from "./item-detail";

// Goals module identity — mirrors MODULE_THEME.goals.
const GOALS_ACCENT = "#E10600";

interface Props {
  item: PlanItem;
  index: number;
  /** Marking done is disabled while this row's write is in flight. */
  busy?: boolean;
  onToggleDone: (item: PlanItem) => void;
  onRemove: (id: string) => void;
  /** Save an edited title (fix a typo). Absent ⇒ the card is read-only text. */
  onRename?: (id: string, title: string) => void;
  /** Push this commitment to tomorrow (1) / day-after (2). */
  onTransfer?: (id: string, off: number) => void;
  /** Which planner day this card is on — the move menu omits it. */
  dayOffset?: number;
}

/** One ordered commitment in "Today's Plan" — sortable, completable, editable, removable. */
export function PlanItemCard({ item, index, busy, onToggleDone, onRemove, onRename, onTransfer, dayOffset }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "plan" },
  });

  // Inline title edit — fix the spelling of a commitment after adding it.
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.title);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const startEdit = React.useCallback(() => {
    if (!onRename || item.done) return;
    setDraft(item.title);
    setEditing(true);
  }, [onRename, item.done, item.title]);

  const commitEdit = React.useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next.length >= 2 && next !== item.title) onRename?.(item.id, next);
  }, [draft, item.id, item.title, onRename]);

  React.useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [editing]);

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
          {editing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                // Enter commits (Shift+Enter for a newline); Esc cancels.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  setDraft(item.title);
                }
              }}
              rows={1}
              maxLength={280}
              aria-label="Edit commitment"
              className="w-full resize-none rounded border bg-surface-card px-1.5 py-1 text-[13px] font-semibold leading-[18px] text-ink-strong outline-none"
              style={{ borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 55%, transparent)` }}
            />
          ) : (
            <div
              onDoubleClick={startEdit}
              className={
                "truncate text-[13px] leading-[18px] " +
                (onRename && !item.done ? "cursor-text " : "") +
                (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
              }
            >
              <HoverTip text={item.title}>{item.title}</HoverTip>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            <SourceTag kind={item.kind} />
            {period ? <span>{period}</span> : null}
            {item.subtitle ? <span className="truncate">{item.subtitle}</span> : null}
          </div>
        </div>

        {/* Push this commitment to a later day (tomorrow / day-after). */}
        {onTransfer && !item.done && !editing ? (
          <TransferControl onTransfer={(off) => onTransfer(item.id, off)} currentOffset={dayOffset} />
        ) : null}

        {/* Edit — turns the title into an input to fix a typo. Hidden while done. */}
        {onRename && !item.done && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit ${item.title}`}
            className="shrink-0 inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
            style={{ outlineColor: GOALS_ACCENT }}
          >
            <Pencil size={13} />
          </button>
        ) : null}

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
