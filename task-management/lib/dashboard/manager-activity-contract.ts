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
  windowDays: number;
  /** Inclusive IST date bounds the counts were taken over, as YYYY-MM-DD. */
  from: string;
  to: string;
  rows: ManagerActivityRow[];
}
