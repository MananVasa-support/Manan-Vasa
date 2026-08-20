"use client";

import * as React from "react";
import type { PlanKind } from "./types";

/**
 * The ONE source-tag vocabulary, shared by Plan My Day and My Day.
 *
 * Every row on either page carries one of these, spelled out in words, so a
 * user can tell at a glance where a line came from — without decoding a colour.
 * Both pages import this file, which is what stops the two surfaces from
 * drifting into different names for the same thing.
 *
 * FOUR TAGS, NOTHING ELSE (Sir): the screen answers "what do I have to do?", so
 * a line only needs to say where the work came from.
 *
 *   WMS TASK         — a real WMS task (`tasks`)
 *   GOAL             — anything that came through Goals: a cascade goal
 *                      (year/quarter/month) or the weekly goal task under it
 *   UNFINISHED       — planned on an earlier day and not completed
 *   DAILY COMMITMENT — typed by the employee, or assigned by their manager
 *
 * The old GOAL TASK / COMMITMENT / CARRYOVER spellings are gone: three of them
 * named the same four things twice over.
 */
export type SourceTagName = "GOAL" | "WMS TASK" | "DAILY COMMITMENT" | "UNFINISHED";

export const KIND_TAG: Record<PlanKind, SourceTagName> = {
  yearly: "GOAL",
  quarterly: "GOAL",
  monthly: "GOAL",
  weekly: "GOAL",
  task: "WMS TASK",
  unfinished: "UNFINISHED",
  adhoc: "DAILY COMMITMENT",
};

/** Per-tag accent, used only for the thin leading rule — the WORD is the signal. */
const TAG_ACCENT: Record<SourceTagName, string> = {
  GOAL: "var(--color-indigo-deep)",
  "WMS TASK": "var(--color-slate)",
  "DAILY COMMITMENT": "var(--color-green-deep)",
  UNFINISHED: "var(--color-amber-deep)",
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

/**
 * A red "OVERDUE" marker. Still used by the My Day surface, where there is no
 * overdue bucket to carry the meaning. Plan My Day deliberately does NOT use it:
 * its WMS column is bucketed BY overdueness, so a badge on every row would
 * repeat what the filter already said (Sir).
 */
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
