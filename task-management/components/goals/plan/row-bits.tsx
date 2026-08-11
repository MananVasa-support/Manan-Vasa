"use client";

import * as React from "react";
import { PRIORITY_LABELS, type TaskPriority, type TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { KIND_TAG, KIND_PERIOD_LABEL, type PlanKind } from "./types";

/**
 * The small shared pieces every row on the board is built from — one definition
 * each, so a line reads identically in Today's Plan and in Available Work.
 *
 * Colour is ALWAYS a second signal here, never the only one: every chip states
 * its meaning in words (`OVERDUE`, `Critical`, `On Hold`), so the board is
 * readable in greyscale and to anyone who can't separate the hues.
 */

/** Semantic colours (design §8): red = overdue/risk · amber = warning ·
 *  green = done · neutral = normal. */
const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";
const DONE = "var(--color-green-deep)";

/* ── source tag ───────────────────────────────────────────────────────────── */

/**
 * The explicit `[GOAL]` / `[GOAL TASK]` / `[WMS TASK]` / `[CARRYOVER]` label.
 * Deliberately monochrome — the tag is the thing you read, not a colour you
 * have to decode, and keeping every tag the same weight stops the board from
 * turning into a pill parade.
 */
export function SourceTagChip({ kind, className = "" }: { kind: PlanKind; className?: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-[4px] bg-surface-soft px-1.5 py-[1px] text-[9.5px] font-bold uppercase leading-[15px] tracking-[0.07em] text-ink-muted " +
        className
      }
    >
      {KIND_TAG[kind]}
    </span>
  );
}

/* ── meta line ────────────────────────────────────────────────────────────── */

/** A neutral dot separator for the sub-line. */
export function Dot() {
  return (
    <span aria-hidden className="text-ink-muted/40">
      ·
    </span>
  );
}

/**
 * The one-line "everything else about this row" strip: source tag first, then
 * whatever detail exists. Children are laid out with consistent spacing so
 * rows line up down the column even when their detail differs.
 */
export function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-[15px] text-ink-muted">
      {children}
    </div>
  );
}

/* ── due date ─────────────────────────────────────────────────────────────── */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-11" → "11 Aug". String math only — no timezone re-parse. */
export function formatYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const [, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return null;
  return `${Number(d)} ${MONTH_ABBR[mi]}`;
}

/**
 * Due-date chip. Overdue is the only state that earns colour (red + the word
 * "OVERDUE"); "Today" reads amber as a soft nudge; everything else is neutral
 * text so a long list stays calm.
 */
export function DueChip({ dueYmd, today }: { dueYmd: string | null | undefined; today: string }) {
  if (!dueYmd) return <span className="text-ink-muted/70">No due date</span>;
  const overdue = dueYmd < today;
  const isToday = dueYmd === today;
  if (overdue) {
    return (
      <span className="font-bold" style={{ color: RISK }}>
        Overdue · {formatYmd(dueYmd)}
      </span>
    );
  }
  if (isToday) {
    return (
      <span className="font-bold" style={{ color: WARN }}>
        Due today
      </span>
    );
  }
  return <span>Due {formatYmd(dueYmd)}</span>;
}

/* ── priority + status ────────────────────────────────────────────────────── */

/** Critical is risk-red, the two mid quadrants are amber, Normal stays neutral —
 *  but the label is always spelled out, so the rank never depends on the hue. */
const PRIORITY_COLOR: Record<TaskPriority, string | undefined> = {
  imp_urgent: RISK,
  imp_not_urgent: WARN,
  not_imp_urgent: WARN,
  not_imp_not_urgent: undefined,
};

export function PriorityChip({ priority }: { priority: TaskPriority | null | undefined }) {
  if (!priority) return null;
  const color = PRIORITY_COLOR[priority];
  return (
    <span className="inline-flex items-center gap-1" style={color ? { color } : undefined}>
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: color ?? "var(--color-ink-muted)", opacity: color ? 1 : 0.45 }}
      />
      <span className={color ? "font-semibold" : undefined}>{PRIORITY_LABELS[priority]}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: TaskStatus | null | undefined }) {
  if (!status) return null;
  const isDone = status === "done" || status === "approved";
  const isBlocked = status === "on_hold" || status === "need_info" || status === "need_help";
  return (
    <span
      className={isDone || isBlocked ? "font-semibold" : undefined}
      style={{ color: isDone ? DONE : isBlocked ? WARN : undefined }}
    >
      {STATUS_LABELS_FALLBACK[status] ?? status}
    </span>
  );
}

/* ── goal period ──────────────────────────────────────────────────────────── */

/** "Monthly" / "Quarterly" / "Yearly" beside a [GOAL] tag — the cascade level is
 *  meaningful context that the tag alone doesn't carry. */
export function PeriodLabel({ kind }: { kind: PlanKind }) {
  const label = KIND_PERIOD_LABEL[kind];
  return label ? <span>{label}</span> : null;
}
