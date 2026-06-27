import "server-only";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals, weeklyGoalActuals, tasks } from "@/db/schema";
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
  taskId: string | null;
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
      taskId: dailyChecklist.taskId,
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
 * The employee's OPEN (not done/approved, not archived) tasks — the right-hand
 * "Tasks" drag source on the Plan-Your-Day page. Excludes tasks already pulled
 * into today's checklist. Newest first, capped.
 */
export interface OpenTaskOption {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  subject: string | null;
  status: TaskStatus;
}

export async function listOpenTasksForChecklist(
  employeeId: string,
  now: Date = new Date(),
): Promise<OpenTaskOption[]> {
  const ymd = todayYmd(now);
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`not exists (
          select 1 from ${dailyChecklist} dc
          where dc.task_id = ${tasks.id}
            and dc.employee_id = ${employeeId}
            and dc.plan_date = ${ymd}
        )`,
      ),
    )
    .orderBy(desc(tasks.createdAt))
    .limit(50);
  return rows as OpenTaskOption[];
}

/**
 * All active current-week weekly goals with their target, cumulative %, today's
 * logged actual, and whether they've been pulled into today's plan. Powers the
 * right-hand "Weekly Goals" panel — which is BOTH a drag source AND where the
 * employee logs today's progress (the daily actuals). Falls back to the most
 * recent week with goals (same carry-forward rule as listPullableGoals).
 */
export interface PlannerGoal {
  id: string;
  client: string | null;
  subject: string | null;
  targetDone: string | null;
  weight: number;
  pctDone: number;
  todayPct: number | null;
  todayNote: string | null;
  pulledToday: boolean;
}

async function plannerGoalsForWeek(employeeId: string, weekStart: string, ymd: string): Promise<PlannerGoal[]> {
  const rows = await db
    .select({
      id: weeklyGoals.id,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
      weight: weeklyGoals.weight,
      pctDone: weeklyGoals.pctDone,
      todayPct: weeklyGoalActuals.pct,
      todayNote: weeklyGoalActuals.note,
      pulled: sql<boolean>`exists (
        select 1 from ${dailyChecklist} dc
        where dc.goal_id = ${weeklyGoals.id} and dc.employee_id = ${employeeId} and dc.plan_date = ${ymd}
      )`,
    })
    .from(weeklyGoals)
    .leftJoin(
      weeklyGoalActuals,
      and(eq(weeklyGoalActuals.goalId, weeklyGoals.id), eq(weeklyGoalActuals.entryDate, ymd)),
    )
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.weekStart, weekStart),
        eq(weeklyGoals.archived, false),
      ),
    )
    .orderBy(asc(weeklyGoals.position), asc(weeklyGoals.createdAt));
  return rows.map((r) => ({
    id: r.id,
    client: r.client,
    subject: r.subject,
    targetDone: r.targetDone,
    weight: r.weight,
    pctDone: r.pctDone,
    todayPct: r.todayPct,
    todayNote: r.todayNote,
    pulledToday: r.pulled,
  }));
}

export async function listGoalsForPlanner(employeeId: string, now: Date = new Date()): Promise<PlannerGoal[]> {
  const ymd = todayYmd(now);
  const thisWeek = currentWeekStart(now);
  const current = await plannerGoalsForWeek(employeeId, thisWeek, ymd);
  if (current.length > 0) return current;
  const [recent] = await db
    .select({ ws: weeklyGoals.weekStart })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.archived, false)))
    .orderBy(desc(weeklyGoals.weekStart))
    .limit(1);
  if (recent && recent.ws !== thisWeek) return plannerGoalsForWeek(employeeId, recent.ws, ymd);
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
