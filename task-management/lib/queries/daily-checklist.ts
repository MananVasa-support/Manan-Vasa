import "server-only";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals } from "@/db/schema";
import type { TaskStatus } from "@/db/enums";
import { istYmd } from "@/lib/weekly-goals/week";
import { currentWeekStart } from "@/lib/weekly-goals/week";

/** Today's plan_date in IST (the team's clock). */
export function todayYmd(now: Date = new Date()): string {
  return istYmd(now);
}

export interface DailyItem {
  id: string;
  title: string;
  client: string | null;
  subject: string | null;
  origin: "goal_related" | "standalone";
  goalId: string | null;
  status: TaskStatus;
  done: boolean;
  doneNote: string | null;
  movedFromDate: string | null;
  position: number;
}

export interface PullableGoal {
  id: string;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  weight: number;
}

export interface OverdueItem {
  id: string;
  title: string;
  client: string | null;
  subject: string | null;
  origin: "goal_related" | "standalone";
  goalId: string | null;
  planDate: string;
}

/** Today's committed checklist for an employee, in display order. */
export async function getTodayItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<DailyItem[]> {
  const rows = await db
    .select({
      id: dailyChecklist.id,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      origin: dailyChecklist.origin,
      goalId: dailyChecklist.goalId,
      status: dailyChecklist.status,
      done: dailyChecklist.done,
      doneNote: dailyChecklist.doneNote,
      movedFromDate: dailyChecklist.movedFromDate,
      position: dailyChecklist.position,
    })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)))
    .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt));
  return rows as DailyItem[];
}

/**
 * Active goals the employee has NOT yet pulled into today — the "Pull from your
 * Weekly Goals" list. Prefers THIS week's goals; if the employee hasn't set any
 * for the current week yet, it FALLS BACK to their most recent week with active
 * goals so unfinished goals carry forward into today's plan (otherwise someone
 * who set goals last week but not this week sees an empty pull list).
 */
async function pullableForWeek(
  employeeId: string,
  weekStart: string,
  ymd: string,
): Promise<PullableGoal[]> {
  return db
    .select({
      id: weeklyGoals.id,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      weight: weeklyGoals.weight,
    })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
        sql`not exists (
          select 1 from ${dailyChecklist} dc
          where dc.goal_id = ${weeklyGoals.id}
            and dc.employee_id = ${employeeId}
            and dc.plan_date = ${ymd}
        )`,
      ),
    )
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
}

export async function listPullableGoals(
  employeeId: string,
  now: Date = new Date(),
): Promise<PullableGoal[]> {
  const ymd = todayYmd(now);
  const thisWeek = currentWeekStart(now);
  const current = await pullableForWeek(employeeId, thisWeek, ymd);
  if (current.length > 0) return current;

  // No current-week goals → fall back to the most recent week the employee has
  // active goals in (carry forward last week's unfinished goals).
  const [recent] = await db
    .select({ ws: weeklyGoals.weekStart })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.archived, false)))
    .orderBy(desc(weeklyGoals.weekStart))
    .limit(1);
  if (recent && recent.ws !== thisWeek) {
    return pullableForWeek(employeeId, recent.ws, ymd);
  }
  return current;
}

/**
 * Unfinished items from earlier days (plan_date < today, done = false) — the
 * "rolled over from yesterday" strip. Most recent first.
 */
export async function getOverdueItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<OverdueItem[]> {
  const rows = await db
    .select({
      id: dailyChecklist.id,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      origin: dailyChecklist.origin,
      goalId: dailyChecklist.goalId,
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        lt(dailyChecklist.planDate, ymd),
        eq(dailyChecklist.done, false),
      ),
    )
    .orderBy(desc(dailyChecklist.planDate));
  return rows as OverdueItem[];
}
