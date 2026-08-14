"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, ArrowRight, CalendarClock } from "lucide-react";
import { PRIORITY_LABELS } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import type { SourceItem } from "./types";
import { SourceTag, fmtYmd } from "./source-tag";

/**
 * The shared "full item" surface for the planner — one field set rendered two
 * ways: a wide HOVER preview and a ¾-screen double-click POP-OUT. Shows what you
 * need to judge a goal / WMS task at a glance — assigner, status, priority,
 * effective due + overdue days, and the full description — with NO notes (Sir).
 */

const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

/**
 * A compact "push this item to a later day" control — a small calendar button
 * that opens a two-item menu (Tomorrow / Day after). Reused on plan cards and in
 * the day-review close-out. `variant="button"` renders a bordered pill for the
 * review; the default is a hover-reveal icon for dense cards.
 */
export function TransferControl({
  onTransfer,
  variant = "icon",
}: {
  onTransfer: (off: 1 | 2) => void;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (off: 1 | 2) => {
    setOpen(false);
    onTransfer(off);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Move to a later day"
        title="Move to a later day"
        className={
          variant === "button"
            ? "inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:border-altus-red hover:text-ink-strong"
            : "inline-flex size-6 items-center justify-center rounded-full text-ink-muted/60 opacity-0 transition-opacity hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 group-hover:opacity-100"
        }
      >
        <CalendarClock size={13} />
        {variant === "button" ? "Move" : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-36 rounded-lg border border-hairline-strong bg-surface-card p-1 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
          <button
            type="button"
            onClick={() => pick(1)}
            className="block w-full rounded px-2 py-1.5 text-left text-[12px] font-semibold text-ink-strong hover:bg-surface-soft"
          >
            → Tomorrow
          </button>
          <button
            type="button"
            onClick={() => pick(2)}
            className="block w-full rounded px-2 py-1.5 text-left text-[12px] font-semibold text-ink-strong hover:bg-surface-soft"
          >
            → Day after
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Whole days `dueYmd` is before `today` (>0 = overdue), else null. */
function overdueDaysOf(item: SourceItem, today: string): number | null {
  if (item.overdueDays != null) return item.overdueDays > 0 ? item.overdueDays : null;
  const due = item.dueYmd ?? null;
  if (!due || due >= today) return null;
  const [dy, dm, dd] = due.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const a = Date.UTC(dy ?? 1970, (dm ?? 1) - 1, dd ?? 1);
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : null;
}

/** A labelled field row; renders nothing when the value is empty. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="flex gap-3">
      <div className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] font-medium text-ink-strong">{children}</div>
    </div>
  );
}

/** The shared body — reused by the hover panel and the modal. */
export function ItemDetailBody({ item, today }: { item: SourceItem; today: string }) {
  const isTask = item.kind === "task";
  const overdueDays = overdueDaysOf(item, today);
  const dueOnDay = item.dueYmd === today;
  const kindTag = item.kind === "unfinished" ? (item.originKind ?? "unfinished") : item.kind;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SourceTag kind={kindTag} />
        {isTask && item.taskNo ? (
          <span className="text-[11px] font-bold tabular-nums text-ink-muted">#{item.taskNo}</span>
        ) : null}
      </div>

      <div className="text-[16px] font-black leading-[1.25] text-ink-strong" style={{ letterSpacing: "-0.01em" }}>
        {item.title}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        {item.assigner ? <Field label="Assigned by">{item.assigner}</Field> : null}
        {item.status ? <Field label="Status">{STATUS_LABELS_FALLBACK[item.status] ?? item.status}</Field> : null}
        {item.priority ? (
          <Field label="Priority">
            <span
              className={item.important ? "font-bold" : undefined}
              style={item.priority === "imp_urgent" ? { color: RISK } : item.important ? { color: WARN } : undefined}
            >
              {PRIORITY_LABELS[item.priority]}
            </span>
          </Field>
        ) : null}
        {item.dueYmd ? (
          <Field label="Due">
            <span className="tabular-nums">{fmtYmd(item.dueYmd)}</span>
            {overdueDays != null ? (
              <span className="ml-2 font-bold" style={{ color: RISK }}>
                · {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
              </span>
            ) : dueOnDay ? (
              <span className="ml-2 font-bold" style={{ color: WARN }}>
                · due this day
              </span>
            ) : null}
          </Field>
        ) : item.dueLabel && item.overdue ? (
          <Field label="Due">
            <span className="font-bold" style={{ color: RISK }}>
              {item.dueLabel}
            </span>
          </Field>
        ) : null}
        {item.project ? <Field label="Project">{item.project}</Field> : null}
        {item.fromYmd ? <Field label="Carried">from {fmtYmd(item.fromYmd)}</Field> : null}
        {item.meta && !isTask ? <Field label="Progress">{item.meta}</Field> : null}
      </div>

      {item.description && item.description.trim() ? (
        <div className="border-t border-hairline pt-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted/80">Description</div>
          <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-ink-soft">{item.description.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A wide hover preview anchored to the card. Opens on hover (short delay),
 * portal'd to <body>, clamped to ⅔–¾ of the viewport and kept on-screen.
 */
export function ItemHoverCard({
  item,
  today,
  children,
}: {
  item: SourceItem;
  today: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(720, Math.max(340, Math.round(vw * 0.7)));
      // Prefer to the right of the card; flip left if it would overflow.
      let left = r.right + 12;
      if (left + width > vw - 12) left = Math.max(12, r.left - width - 12);
      const top = Math.max(12, Math.min(r.top, window.innerHeight - 40));
      setPos({ top, left, width });
    }, 260);
  }, []);

  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} className="min-w-0">
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[60] rounded-2xl border border-hairline-strong bg-surface-card p-4 shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
              style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: "80vh", overflow: "auto" }}
            >
              <ItemDetailBody item={item} today={today} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** The ¾-screen double-click pop-out: the same body + actions. */
export function ItemDetailModal({
  item,
  today,
  onClose,
  onAdd,
  addLabel,
}: {
  item: SourceItem;
  today: string;
  onClose: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fullHref =
    item.kind === "task" && (item.taskId || item.id) ? `/tasks/${item.taskId ?? item.id}` : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[75vw] max-w-[900px] flex-col overflow-hidden rounded-3xl border border-hairline-strong bg-surface-card shadow-[0_40px_100px_rgba(15,23,42,0.35)] max-md:w-[94vw]"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Details</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <ItemDetailBody item={item} today={today} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          {fullHref ? (
            <a
              href={fullHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-bold text-ink-strong hover:border-altus-red"
            >
              <ExternalLink size={14} /> Open full page
            </a>
          ) : null}
          {onAdd && !item.added ? (
            <button
              type="button"
              onClick={() => {
                onAdd();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              <ArrowRight size={14} /> {addLabel ?? "Add to plan"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
