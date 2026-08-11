"use client";

import * as React from "react";
import { PRIORITY_LABELS, type TaskPriority, type TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { KIND_TAG, KIND_PERIOD_LABEL, type PlanKind } from "./types";

/**
 * The shared pieces every row on the board is built from.
 *
 * TWO RULES, because the earlier version turned every value into a pill and the
 * result read as a compressed data table:
 *   1. A BADGE is reserved for a semantic state you scan for — the source tag
 *      and "overdue". Everything else is plain text separated by a middot.
 *   2. Nothing that a user actually reads drops below 12px. Only the two badge
 *      types use the 10.5px micro size.
 *
 * Colour is always a second signal, never the only one: "Overdue", "Critical"
 * and "On Hold" are spelled out, so the row survives greyscale.
 */

/** Semantic colours: red = overdue/risk · amber = warning · green = done. */
const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";
const DONE = "var(--color-green-deep)";

/* ── badges (the only two) ────────────────────────────────────────────────── */

/** The explicit `GOAL` / `GOAL TASK` / `WMS TASK` / `CARRYOVER` / `AD-HOC`
 *  label. Monochrome on purpose — it identifies, it doesn't shout. */
export function SourceTagChip({ kind }: { kind: PlanKind }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[4px] bg-surface-soft px-1.5 py-[2px] text-[10.5px] font-bold uppercase leading-[14px] tracking-[0.06em] text-ink-soft">
      {KIND_TAG[kind]}
    </span>
  );
}

/** The one state worth interrupting a scan for. */
export function OverdueBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-[2px] text-[10.5px] font-bold uppercase leading-[14px] tracking-[0.06em]"
      style={{ background: "var(--color-red-bg)", color: RISK }}
    >
      Overdue
    </span>
  );
}

/* ── text lines ───────────────────────────────────────────────────────────── */

/** The middot separator between plain metadata values. */
export function Sep() {
  return (
    <span aria-hidden className="text-ink-muted/40">
      ·
    </span>
  );
}

/**
 * A metadata line under a row title. 12.5px — readable prose, not a caption.
 * `wrap` lets a long line fold instead of clipping.
 */
export function MetaLine({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] leading-[18px] text-ink-muted " + className
      }
    >
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

/** Due state as a badge (overdue only) plus plain date text beside it. */
export function DueParts({ dueYmd, today }: { dueYmd: string | null | undefined; today: string }) {
  if (!dueYmd) return <span className="text-ink-muted/70">No due date</span>;
  if (dueYmd < today) {
    return (
      <>
        <OverdueBadge />
        <span className="font-semibold" style={{ color: RISK }}>
          {formatYmd(dueYmd)}
        </span>
      </>
    );
  }
  if (dueYmd === today) {
    return (
      <span className="font-semibold" style={{ color: WARN }}>
        Due today
      </span>
    );
  }
  return <span>Due {formatYmd(dueYmd)}</span>;
}

/* ── priority + status, as plain coloured text ────────────────────────────── */

const PRIORITY_COLOR: Record<TaskPriority, string | undefined> = {
  imp_urgent: RISK,
  imp_not_urgent: WARN,
  not_imp_urgent: WARN,
  not_imp_not_urgent: undefined,
};

export function PriorityText({ priority }: { priority: TaskPriority | null | undefined }) {
  if (!priority) return null;
  const color = PRIORITY_COLOR[priority];
  return (
    <span className={color ? "font-semibold" : undefined} style={color ? { color } : undefined}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusText({ status }: { status: TaskStatus | null | undefined }) {
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

/** "Monthly" / "Quarterly" / "Yearly" — plain text beside the GOAL tag. */
export function periodLabel(kind: PlanKind): string | null {
  return KIND_PERIOD_LABEL[kind] ?? null;
}
