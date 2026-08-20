/**
 * The shared shape of the manager activity board — deliberately FREE of
 * `server-only` and of any database import.
 *
 * WHY THIS FILE EXISTS. `lib/queries/manager-activity-board.ts` opens with
 * `import "server-only"`, which is what stops Drizzle and the connection pool
 * being pulled into a browser bundle. The client table imported four types AND
 * one value — `ACTIVITY_TARGETS` — from it. The four types erase at compile
 * time and cost nothing, but a VALUE import is a real module edge: the bundler
 * has to include the module to get the constant, and `server-only` then throws
 * the build.
 *
 * That is the whole failure. The data path was never wrong — the client calls a
 * `"use server"` action, which is the sanctioned way for a client component to
 * reach server code — so the fix is not to restructure the fetch, it is to stop
 * a plain object literal living behind a server-only door.
 *
 * Anything BOTH sides need goes here. The query module re-exports it, so server
 * callers are unaffected and there is still one definition.
 */

/** Flat target baselines. Per Sir's spec: goals 15, tasks 25, commitments 15. */
export const ACTIVITY_TARGETS = { goals: 15, tasks: 25, commitments: 15 } as const;

export interface ActivitySplit {
  /** A — originated by this row's manager. */
  delegate: number;
  /** B — originated by anyone else (the member included). */
  counterpart: number;
  /** A + B. Every item counts once, so this is the member's real total. */
  total: number;
}

export interface MemberActivityRow {
  employeeId: string;
  employeeName: string;
  /** True for the manager's own row, which always sorts first. */
  isSelf: boolean;
  goals: ActivitySplit;
  tasks: ActivitySplit;
  commitments: ActivitySplit;
  /** Grand total across all three families. */
  grandTotal: number;
}

export interface ManagerActivityRow {
  managerId: string;
  managerName: string;
  directReports: number;
  /** Family totals across Self + every direct report. */
  goals: number;
  tasks: number;
  commitments: number;
  /** goals + tasks + commitments. */
  total: number;
  members: MemberActivityRow[];
}

export interface ManagerActivityBoard {
  period: "3d" | "7d" | "month" | "year";
  /** Inclusive IST date bounds the counts were taken over, as YYYY-MM-DD. */
  from: string;
  to: string;
  rows: ManagerActivityRow[];
}

/* ── Hover preview ─────────────────────────────────────────────────────────
   The item list behind one activity cell. Lives in the CONTRACT module, not
   beside the query, for the same reason ACTIVITY_TARGETS does: the popover is a
   client component, and a value import from a `server-only` module puts a real
   edge in the client graph and fails the production build. */

/** How many items a popover shows before deferring to its "View all" footer. */
export const PREVIEW_LIMIT = 5;

/** Which of the three families a cell belongs to. */
export type ActivityCategory = "goals" | "tasks" | "commitments";

/** Which slice of a member's items a cell counts. `gt` is delegate + counterpart. */
export type ActivitySplitKey = "delegate" | "counterpart" | "gt";

/** Colour hint for the item's badge. Null renders the badge plain. */
export type ActivityPreviewTone = "urgent" | "done" | "pending" | null;

export interface ActivityPreviewItem {
  id: string;
  /** The item's own text — goal subject, task description, commitment title. */
  title: string;
  /** Badge line: owner name, priority label, or Done/Pending. */
  meta: string | null;
  /** Right-aligned SLA note — "6d overdue", "Due today", "Due 21 Aug". */
  trailing: string | null;
  tone: ActivityPreviewTone;
  /** Colours the SLA pill. Null renders it neutral. */
  trailingTone: "overdue" | "today" | null;
}

export interface ActivityPreview {
  /** Everything matching the cell, so the footer can name the real number. */
  total: number;
  /** At most PREVIEW_LIMIT of them. */
  items: ActivityPreviewItem[];
}

/* ── Period ────────────────────────────────────────────────────────────────
   The board's time window. A KEY, not a day count: "This Month" and "This
   Year" are anchored to the calendar, so they cannot be expressed as "N days
   back" — the window has to be computed from today's date, not subtracted
   from it. */

export const ACTIVITY_PERIODS = [
  { id: "3d", label: "Last 3 Days" },
  { id: "7d", label: "Last 7 Days" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
] as const;

export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number]["id"];

export const ACTIVITY_PERIOD_IDS = ACTIVITY_PERIODS.map((p) => p.id) as readonly ActivityPeriod[];

export const DEFAULT_ACTIVITY_PERIOD: ActivityPeriod = "7d";

/** Narrow an untrusted `?period=` value, falling back to the default. */
export function toActivityPeriod(v: unknown): ActivityPeriod {
  return ACTIVITY_PERIOD_IDS.includes(v as ActivityPeriod)
    ? (v as ActivityPeriod)
    : DEFAULT_ACTIVITY_PERIOD;
}

/**
 * The inclusive IST date bounds for a period, as YYYY-MM-DD.
 *
 * Pure string/date math on a `todayYmd` the CALLER supplies, so it carries no
 * clock of its own: the server passes `istYmd(now)` and the same function is
 * safe to import from the client bundle. Keeping it here rather than beside the
 * query is also what stops the board and the hover preview from computing two
 * different windows for the same selection.
 */
export function activityWindow(
  period: ActivityPeriod,
  todayYmd: string,
): { from: string; to: string } {
  const to = todayYmd;
  if (period === "month") return { from: `${todayYmd.slice(0, 7)}-01`, to };
  if (period === "year") return { from: `${todayYmd.slice(0, 4)}-01-01`, to };
  const days = period === "3d" ? 3 : 7;
  const d = new Date(`${todayYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return { from: d.toISOString().slice(0, 10), to };
}

/** `n` whole days back from `ymd`, inclusive. Used to widen a window so weekly
 *  goals whose week STARTED before it still count as overlapping. */
export function daysBefore(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
