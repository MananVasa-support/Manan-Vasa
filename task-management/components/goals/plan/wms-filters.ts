/**
 * Due-date / priority / status filtering for the WMS To-Do column.
 *
 * PURE — plain string math on IST `YYYY-MM-DD` labels, no server imports and no
 * Date parsing of user data, so the `"use client"` board imports it freely.
 *
 * WHY ymd STRINGS: every due date on a SourceItem is already the EFFECTIVE due
 * (revised ?? due_at) rendered as an IST day by `listOpenTasksForChecklist`.
 * Comparing those labels is the same comparison the server made, so a card that
 * reads "Overdue" always lands in the Overdue filter — a `new Date(...)`
 * round-trip here would re-introduce the timezone shift the server removed.
 */

import type { TaskPriority, TaskStatus } from "@/db/enums";
import type { SourceItem } from "./types";

export type DueFilter = "all" | "overdue" | "today" | "week";
export type PriorityFilter = "all" | TaskPriority;
export type StatusFilter = "all" | "open" | "in_progress" | "blocked";

export interface WmsFilter {
  due: DueFilter;
  priority: PriorityFilter;
  status: StatusFilter;
}

export const DEFAULT_WMS_FILTER: WmsFilter = { due: "all", priority: "all", status: "all" };

export const DUE_LABEL: Record<DueFilter, string> = {
  all: "All",
  overdue: "Overdue",
  today: "Due Today",
  week: "This Week",
};

export const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
};

/**
 * The three plain-language buckets over the REAL `TASK_STATUSES` enum. The app
 * has no "Open / In Progress / Blocked" statuses of its own — these group the
 * statuses that exist, so the filter always describes live data. Terminal
 * statuses (done / approved) are absent on purpose: this column only ever
 * holds OPEN tasks, so a "Completed" option could only ever show nothing.
 */
export const STATUS_GROUP: Record<Exclude<StatusFilter, "all">, readonly TaskStatus[]> = {
  open: ["dont_know", "not_started"],
  in_progress: ["initiated", "follow_up", "follow_up_1", "follow_up_2", "follow_up_3"],
  blocked: ["on_hold", "need_info", "need_help"],
};

/* ── ymd math ─────────────────────────────────────────────────────────────── */

/** Shift an IST `YYYY-MM-DD` by whole days. UTC-only arithmetic → no offset drift. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** Monday→Sunday bounds of the week containing `ymd` — the app's week start,
 *  so "This Week" here means the same week the Weekly Goals surfaces mean. */
export function weekBoundsYmd(ymd: string): { start: string; end: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 = Sunday
  const start = shiftYmd(ymd, -(dow === 0 ? 6 : dow - 1));
  return { start, end: shiftYmd(start, 6) };
}

/* ── predicates ───────────────────────────────────────────────────────────── */

export function matchesDue(item: SourceItem, due: DueFilter, today: string): boolean {
  const d = item.dueYmd ?? null;
  switch (due) {
    case "all":
      return true;
    case "overdue":
      return d != null && d < today;
    case "today":
      return d === today;
    case "week": {
      const { start, end } = weekBoundsYmd(today);
      return d != null && d >= start && d <= end;
    }
  }
}

export function matchesStatus(item: SourceItem, f: StatusFilter): boolean {
  if (f === "all") return true;
  const s = item.status;
  return s != null && (STATUS_GROUP[f] as readonly string[]).includes(s);
}

export function applyWmsFilter(items: SourceItem[], f: WmsFilter, today: string): SourceItem[] {
  return items.filter(
    (i) =>
      matchesDue(i, f.due, today) &&
      (f.priority === "all" || i.priority === f.priority) &&
      matchesStatus(i, f.status),
  );
}

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
 * Attention-first ordering: overdue → due today → everything dated → undated,
 * with priority breaking ties inside each bucket and due date last.
 *
 * UNDATED WORK GETS ITS OWN BUCKET. Without it, a Critical task with no due
 * date outranks every dated task on priority alone and leads the column —
 * which is wrong (nothing is at risk yet) and disagrees with the server sort in
 * `listOpenTasksForChecklist`, which has always sunk undated tasks last.
 *
 * Applied AFTER filtering so a narrowed list stays ranked by urgency.
 */
export function sortByAttention(items: SourceItem[], today: string): SourceItem[] {
  const bucket = (i: SourceItem) => {
    const d = i.dueYmd ?? null;
    if (d == null) return 3;
    if (d < today) return 0;
    if (d === today) return 1;
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
