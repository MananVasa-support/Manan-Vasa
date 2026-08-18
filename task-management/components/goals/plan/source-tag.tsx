"use client";

import * as React from "react";
import type { PlanKind } from "./types";

/**
 * The ONE source-tag vocabulary, shared by Plan My Day and My Day.
 *
 * Every row on either page carries one of these, spelled out in words, so a
 * user can tell at a glance whether a line came from Goals or from WMS —
 * without decoding a colour. Both pages import this file, which is what stops
 * the two surfaces from drifting into different names for the same thing.
 *
 *   GOAL       — a cascade goal (`goals`: year / quarter / month)
 *   GOAL TASK  — a weekly goal (`weekly_goals`), the executable slice of a goal
 *   WMS TASK   — a real WMS task (`tasks`)
 *   COMMITMENT — typed straight into today's plan (ad-hoc)
 *   CARRYOVER  — an unfinished commitment pulled forward from an earlier day
 */
export type SourceTagName = "GOAL" | "GOAL TASK" | "WMS TASK" | "COMMITMENT" | "CARRYOVER";

export const KIND_TAG: Record<PlanKind, SourceTagName> = {
  yearly: "GOAL",
  quarterly: "GOAL",
  monthly: "GOAL",
  weekly: "GOAL TASK",
  task: "WMS TASK",
  unfinished: "CARRYOVER",
  adhoc: "COMMITMENT",
};

/* ── Plan-review CATEGORY ──────────────────────────────────────────────────
   The review table's "Category" column. Deliberately its own vocabulary rather
   than reusing `SourceTagName`: the tags above are terse all-caps chips sized
   for a card corner, while this is a readable table cell.

   "Unfinished" CANNOT come from `kind`. When a carried-over item is pulled onto
   a plan it is re-dated in place, so its kind reverts to weekly/task/adhoc —
   the surviving signal is `moved_from_date`, which is why `carriedOver` is
   checked FIRST and wins over everything else.

   Five labels, not four: a cascade goal (Yearly/Quarterly/Monthly) is a real
   plan row and is none of the other four. Folding it into "Weekly Goal" would
   put the wrong word on screen. */
export type PlanCategory =
  | "Daily Commitment"
  | "WMS Task"
  | "Weekly Goal"
  | "Unfinished"
  | "Goal";

export function planCategory(
  kind: PlanKind,
  carriedOver: boolean | undefined,
): PlanCategory {
  if (carriedOver) return "Unfinished";
  switch (kind) {
    case "task":
      return "WMS Task";
    case "weekly":
      return "Weekly Goal";
    case "yearly":
    case "quarterly":
    case "monthly":
      return "Goal";
    case "unfinished":
      return "Unfinished";
    default:
      return "Daily Commitment";
  }
}

/** Category → the same accent family the card tags use, so the two agree. */
export const CATEGORY_ACCENT: Record<PlanCategory, string> = {
  "Daily Commitment": "var(--color-green-deep)",
  "WMS Task": "var(--color-slate)",
  "Weekly Goal": "#E10600",
  Unfinished: "var(--color-amber-deep)",
  Goal: "var(--color-indigo-deep)",
};

/** The cascade level shown beside a GOAL tag ("Yearly" / "Quarterly" / "Monthly"). */
export const KIND_PERIOD: Partial<Record<PlanKind, string>> = {
  yearly: "Yearly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

const GOALS_ACCENT = "#E10600";

/** Per-tag accent, used only for the thin leading rule — the WORD is the signal. */
const TAG_ACCENT: Record<SourceTagName, string> = {
  GOAL: "var(--color-indigo-deep)",
  "GOAL TASK": GOALS_ACCENT,
  "WMS TASK": "var(--color-slate)",
  COMMITMENT: "var(--color-green-deep)",
  CARRYOVER: "var(--color-amber-deep)",
};

/**
 * The small uppercase source tag. Deliberately quiet — a hairline-bordered
 * chip rather than a filled pill, so a column of twenty rows doesn't read as a
 * wall of colour.
 */
export function SourceTag({ kind }: { kind: PlanKind }) {
  const name = KIND_TAG[kind];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[9.5px] font-bold uppercase leading-[14px] tracking-[0.06em]"
      style={{
        borderColor: "var(--color-hairline)",
        background: "var(--color-surface-soft)",
        color: "var(--color-ink-soft)",
      }}
    >
      <span aria-hidden className="size-1 rounded-full" style={{ background: TAG_ACCENT[name] }} />
      {name}
    </span>
  );
}

/** A red "OVERDUE" marker — the one state worth interrupting a scan for. */
export function OverdueTag({ label = "Overdue" }: { label?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-bold uppercase leading-[14px] tracking-[0.06em]"
      style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}
    >
      {label}
    </span>
  );
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-11" → "11 Aug". Pure string math — no timezone re-parse, so this
 *  can never shift the IST day the server already resolved. */
export function fmtYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const [, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return null;
  return `${Number(d)} ${MONTH_ABBR[mi]}`;
}
