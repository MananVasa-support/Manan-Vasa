import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import type { TaskPriority } from "@/db/enums";
import { currentWeekStart } from "@/lib/weekly-goals/week";

/**
 * Mandatory weekly-goals fill gate (design §11).
 *
 * A goal is "filled" once its progress is recorded — `pct_updated_at IS NOT
 * NULL` (stamped by `setWeeklyGoalPct`). A user is gated while they have any
 * current-week, non-archived goal that is still un-filled. Uses the existing
 * `weekly_goals_employee_week_idx`; sub-millisecond.
 */

/** One un-filled current-week goal, for the fill page's list. */
export interface UnfilledWeekGoal {
  id: string;
  position: number;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  priority: TaskPriority;
  targetDate: string | null;
  pctDone: number;
  explanation: string | null;
}

function unfilledWhere(employeeId: string, weekStart: string) {
  return and(
    eq(weeklyGoals.employeeId, employeeId),
    eq(weeklyGoals.weekStart, weekStart),
    eq(weeklyGoals.archived, false),
    isNull(weeklyGoals.pctUpdatedAt),
  );
}

/**
 * True when the employee has ≥1 un-filled current-week goal — i.e. the gate
 * must redirect them to /weekly-goals/fill. EXISTS query, fastest possible.
 */
export async function hasUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const weekStart = currentWeekStart(now);
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart))
    .limit(1);
  return rows.length > 0;
}

/** How many current-week goals the employee still needs to fill. */
export async function countUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<number> {
  const weekStart = currentWeekStart(now);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart));
  return row?.n ?? 0;
}

/**
 * The employee's un-filled current-week goals in Sr.-No. order — the rows the
 * fill page renders for inline %-Done + explanation entry.
 */
export async function listUnfilledWeekGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<UnfilledWeekGoal[]> {
  const weekStart = currentWeekStart(now);
  return db
    .select({
      id: weeklyGoals.id,
      position: weeklyGoals.position,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      priority: weeklyGoals.priority,
      targetDate: weeklyGoals.targetDate,
      pctDone: weeklyGoals.pctDone,
      explanation: weeklyGoals.explanation,
    })
    .from(weeklyGoals)
    .where(unfilledWhere(employeeId, weekStart))
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
}
