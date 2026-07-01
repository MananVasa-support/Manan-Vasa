import "server-only";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals, weeklyGoalActuals, tasks } from "@/db/schema";
import type { TaskStatus } from "@/db/enums";
import { istYmd } from "@/lib/weekly-goals/week";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";

/** Today's plan_date in IST (the team's clock). */
export function todayYmd(now: Date = new Date()): string {
  return istYmd(now);
}

/**
 * The UTC instant of IST-tomorrow-midnight for a given `YYYY-MM-DD` (IST) day.
 * A task is "for today" when its effective due date is strictly BEFORE this
 * instant — i.e. due today or overdue. (IST 00:00 = 18:30 UTC the day before.)
 */
function startOfTomorrowIstInstant(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1) - 5.5 * 3_600_000);
}

/**
 * A single line in the Daily Checklist. `source` is the ONE source of truth:
 *  - "assigned"  — a manager-assigned Task (live from the `tasks` table, NEVER
 *                  copied). id === the task id; completion writes back to the task.
 *  - "personal"  — the employee's own row in `daily_checklist` (ad-hoc item or a
 *                  pulled Weekly Goal). id === the daily_checklist row id.
 */
export interface DailyItem {
  id: string;
  source: "assigned" | "personal";
  title: string;
  client: string | null;
  subject: string | null;
  origin: "goal_related" | "standalone";
  goalId: string | null;
  taskId: string | null;
  taskNo: number | null;
  dueAt: Date | null;
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

/**
 * The manager-ASSIGNED tasks that make up an employee's day — read LIVE from the
 * `tasks` table (one record, one owner; never copied into the checklist). These
 * are the doer's open tasks whose effective due date is today or overdue. When a
 * manager assigns nothing, this is empty (the assigned section simply hides).
 */
export async function assignedTasksForToday(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<DailyItem[]> {
  const cutoff = startOfTomorrowIstInstant(ymd);
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      taskNo: tasks.taskNo,
      status: tasks.status,
      dueAt: effectiveDueAtSql(),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`${effectiveDueAtSql()} < ${cutoff.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(effectiveDueAtSql()), asc(tasks.createdAt));
  return rows.map((r, i) => ({
    id: r.id,
    source: "assigned" as const,
    title: r.title,
    client: r.client,
    subject: r.subject,
    origin: "standalone" as const,
    goalId: null,
    taskId: r.id,
    taskNo: r.taskNo,
    dueAt: r.dueAt,
    status: r.status,
    done: r.status === "done" || r.status === "approved",
    doneNote: null,
    movedFromDate: null,
    position: i,
  }));
}

/** The employee's OWN checklist rows (ad-hoc items + pulled goals). Legacy rows
 *  that merely copied a task (task_id set) are excluded — the live assigned view
 *  is now the single source of truth for task work, so copies never double up. */
async function personalItems(employeeId: string, ymd: string): Promise<DailyItem[]> {
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
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        eq(dailyChecklist.planDate, ymd),
        isNull(dailyChecklist.taskId),
      ),
    )
    .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt));
  return rows.map((r) => ({
    ...r,
    origin: r.origin as "goal_related" | "standalone",
    source: "personal" as const,
    taskNo: null,
    dueAt: null,
  }));
}

/**
 * Today's full checklist for an employee = manager-assigned tasks (live) FOLLOWED
 * BY the employee's personal items. The single merged surface the day view reads.
 */
export async function getTodayItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<DailyItem[]> {
  const [assigned, personal] = await Promise.all([
    assignedTasksForToday(employeeId, ymd),
    personalItems(employeeId, ymd),
  ]);
  return [...assigned, ...personal];
}

/** True when the employee has ANY planned work today — an assigned task OR a
 *  personal item. This is what the attendance gate now checks (plan EXISTS). */
export async function hasPlannedWork(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<boolean> {
  const cutoff = startOfTomorrowIstInstant(ymd);
  const [assigned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        sql`${effectiveDueAtSql()} < ${cutoff.toISOString()}::timestamptz`,
      ),
    );
  if ((assigned?.n ?? 0) > 0) return true;
  const [personal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return (personal?.n ?? 0) > 0;
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
