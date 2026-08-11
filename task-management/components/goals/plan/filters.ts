/**
 * WMS-task filtering + attention-first ordering for the Available Work column.
 *
 * PURE — plain string/number math on IST `YYYY-MM-DD` labels, no Date parsing of
 * user data and no server imports, so the `"use client"` board imports it freely
 * and the unit tests can drive it directly.
 *
 * WHY ymd STRINGS: every due date on a SourceItem is already the EFFECTIVE due
 * (revised ?? due_at) rendered as an IST day by `listOpenTasksForChecklist`.
 * Comparing those labels lexicographically is the same comparison the server
 * made, so a card that says "Overdue" always lands in the Overdue filter — a
 * `new Date(...)` round-trip here would re-introduce the timezone shift the
 * server deliberately removed.
 */

import type { TaskPriority, TaskStatus } from "@/db/enums";
import type { SourceItem } from "./types";

export type DueFilter = "all" | "overdue" | "today" | "tomorrow" | "week" | "custom";
export type PriorityFilter = "all" | TaskPriority;
export type StatusFilter = "all" | "open" | "in_progress" | "blocked" | "completed";

export interface WmsFilter {
  due: DueFilter;
  priority: PriorityFilter;
  status: StatusFilter;
  /** Only read when `due === "custom"`. Either bound may be empty (open-ended). */
  from: string;
  to: string;
}

export const DEFAULT_WMS_FILTER: WmsFilter = {
  due: "all",
  priority: "all",
  status: "all",
  from: "",
  to: "",
};

/* ── ymd math ─────────────────────────────────────────────────────────────── */

/** Shift an IST `YYYY-MM-DD` by whole days. UTC-only arithmetic → no DST/offset
 *  drift, and the result is the same calendar-day label IST would produce. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return t.toISOString().slice(0, 10);
}

/** Monday→Sunday bounds of the week containing `ymd` (the app's week start —
 *  matches `currentWeekStart`, so "This Week" here means the same week the
 *  Weekly Goals surfaces mean). */
export function weekBoundsYmd(ymd: string): { start: string; end: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0=Sun
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = shiftYmd(ymd, -backToMonday);
  return { start, end: shiftYmd(start, 6) };
}

/* ── status grouping ──────────────────────────────────────────────────────── */

/**
 * The four plain-language buckets over the REAL `TASK_STATUSES` enum. The app
 * has no "Open/In Progress/Blocked" statuses of its own — these group the
 * statuses that exist, so the filter always describes live data:
 *   Open        — nobody has picked it up yet
 *   In Progress — work has started (incl. the legacy follow_up_1/2/3 rows)
 *   Blocked     — parked on someone/something else
 *   Completed   — finished (or approved)
 */
export const STATUS_GROUP: Record<Exclude<StatusFilter, "all">, readonly TaskStatus[]> = {
  open: ["dont_know", "not_started"],
  in_progress: ["initiated", "follow_up", "follow_up_1", "follow_up_2", "follow_up_3"],
  blocked: ["on_hold", "need_info", "need_help"],
  completed: ["done", "approved"],
};

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
};

export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  all: "All",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This Week",
  custom: "Custom",
};

/* ── predicates ───────────────────────────────────────────────────────────── */

export function matchesDue(item: SourceItem, f: WmsFilter, today: string): boolean {
  const due = item.dueYmd ?? null;
  switch (f.due) {
    case "all":
      return true;
    case "overdue":
      return due != null && due < today;
    case "today":
      return due === today;
    case "tomorrow":
      return due === shiftYmd(today, 1);
    case "week": {
      const { start, end } = weekBoundsYmd(today);
      return due != null && due >= start && due <= end;
    }
    case "custom": {
      if (due == null) return false;
      if (f.from && due < f.from) return false;
      if (f.to && due > f.to) return false;
      return true;
    }
  }
}

export function matchesStatus(item: SourceItem, f: StatusFilter): boolean {
  if (f === "all") return true;
  const s = item.status;
  return s != null && (STATUS_GROUP[f] as readonly string[]).includes(s);
}

export function matchesPriority(item: SourceItem, f: PriorityFilter): boolean {
  return f === "all" || item.priority === f;
}

export function applyWmsFilter(items: SourceItem[], f: WmsFilter, today: string): SourceItem[] {
  return items.filter(
    (i) => matchesDue(i, f, today) && matchesPriority(i, f.priority) && matchesStatus(i, f.status),
  );
}

/** True when anything is narrowed — drives the "Clear" affordance. */
export function isFilterActive(f: WmsFilter): boolean {
  return f.due !== "all" || f.priority !== "all" || f.status !== "all";
}

/* ── ordering ─────────────────────────────────────────────────────────────── */

/** Eisenhower rank (0 = most important) — mirrors the server-side tiebreaker. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  imp_urgent: 0,
  imp_not_urgent: 1,
  not_imp_urgent: 2,
  not_imp_not_urgent: 3,
};

/**
 * Default ordering — "work that needs attention" first, in the stated
 * precedence: 1. Overdue · 2. Due Today · 3. High priority, with due date
 * breaking ties last.
 *
 * UNDATED WORK GETS ITS OWN BUCKET, below everything dated. Without it a
 * Critical task with no due date outranks a dated one purely on priority and
 * floats to the top of the list — which is both wrong (nothing is at risk yet)
 * and a silent disagreement with the server-side sort in
 * `listOpenTasksForChecklist`, which has always sunk undated tasks last.
 *
 * Applied AFTER filtering (not just once on the server) so a narrowed list is
 * still ranked by urgency rather than by whatever order it was fetched in.
 */
export function sortByAttention(items: SourceItem[], today: string): SourceItem[] {
  const bucket = (i: SourceItem) => {
    const due = i.dueYmd ?? null;
    if (due == null) return 3; // undated — last, whatever its priority
    if (due < today) return 0; // overdue
    if (due === today) return 1; // due today
    return 2;
  };
  const rank = (i: SourceItem) => (i.priority ? PRIORITY_RANK[i.priority] : 9);
  return [...items].sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      rank(a) - rank(b) ||
      (a.dueYmd ?? "9999-99-99").localeCompare(b.dueYmd ?? "9999-99-99"),
  );
}
