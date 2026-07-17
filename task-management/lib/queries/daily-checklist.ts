import "server-only";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, weeklyGoals, weeklyGoalActuals, tasks } from "@/db/schema";
import type { TaskStatus, TaskPriority } from "@/db/enums";
import { istYmd } from "@/lib/weekly-goals/week";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { effectiveDueAtSql, pickEffectiveDue } from "@/lib/tasks/effective-due";

/**
 * Has the employee CLOSED OUT today's commitments (Sir's checkout order)? True
 * once `daily_plan_day.closed_at` is stamped (via closeMyDay). Powers the punch-
 * out close-out gate. Treated as satisfied when the person planned nothing today.
 */
export async function isDayClosedOut(employeeId: string, ymd: string = todayYmd()): Promise<boolean> {
  const [day] = await db
    .select({ closedAt: dailyPlanDay.closedAt })
    .from(dailyPlanDay)
    .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, ymd)))
    .limit(1);
  if (day?.closedAt) return true;
  // Nothing planned today ⇒ nothing to close out (don't trap clock-out).
  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return (counted[0]?.n ?? 0) === 0;
}

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
  taskId: string | null;
  taskNo: number | null;
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
/**
 * How many items the employee has COMMITTED to today's checklist (personal
 * `daily_checklist` rows for `ymd`). This is the strict planning signal — it does
 * NOT count merely-assigned tasks. Drives the compulsory login checklist gate,
 * which requires ≥ MIN_DAILY_ITEMS before the app opens.
 */
export async function countPlannedItems(
  employeeId: string,
  ymd: string = todayYmd(),
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return row?.n ?? 0;
}

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
  /** Priority quadrant — powers the "important" badge + sort tiebreaker. */
  priority: TaskPriority;
  /** EFFECTIVE due date (revised ?? due_at) as an IST ymd, or null if unset. */
  dueAt: string | null;
  /** Effective due is strictly before today. */
  overdue: boolean;
  /** Effective due is today. */
  dueToday: boolean;
}

/** Eisenhower rank: important-first, then urgent (0 = most important). */
function importanceRank(p: TaskPriority): number {
  switch (p) {
    case "imp_urgent":
      return 0;
    case "imp_not_urgent":
      return 1;
    case "not_imp_urgent":
      return 2;
    default:
      return 3;
  }
}

export async function listOpenTasksForChecklist(
  employeeId: string,
  now: Date = new Date(),
  opts: { horizonDays?: number } = {},
): Promise<OpenTaskOption[]> {
  const ymd = todayYmd(now);
  // Sir's To-Do rule: on the planner, only surface OVERDUE + due-within-N-days
  // tasks (hide far-future "kachra"). `horizonDays` unset ⇒ no horizon (the login
  // gate + mobile keep every open task).
  const horizonCutoff =
    opts.horizonDays == null
      ? null
      : new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + (opts.horizonDays + 1) * 86_400_000);
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      revisedTargetDate: tasks.revisedTargetDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.doerId, employeeId),
        eq(tasks.archived, false),
        isNull(tasks.abandonedAt),
        sql`${tasks.status} not in ('done','approved','cancelled')`,
        horizonCutoff
          ? sql`${effectiveDueAtSql()} < ${horizonCutoff.toISOString()}::timestamptz`
          : sql`true`,
        sql`not exists (
          select 1 from ${dailyChecklist} dc
          where dc.task_id = ${tasks.id}
            and dc.employee_id = ${employeeId}
            and dc.plan_date = ${ymd}
        )`,
      ),
    )
    .limit(50);

  // Enrich each open task with its EFFECTIVE due (revised ?? due_at, per the
  // app-wide overdue rule) as an IST ymd + overdue/dueToday flags, so the
  // planner can surface unfinished work and pull-by-due-date/importance.
  const enriched: OpenTaskOption[] = rows.map((r) => {
    const eff = pickEffectiveDue(r);
    const dueYmd = eff ? istYmd(eff) : null;
    return {
      id: r.id,
      taskNo: r.taskNo,
      title: r.title,
      client: r.client,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      dueAt: dueYmd,
      overdue: dueYmd != null && dueYmd < ymd,
      dueToday: dueYmd === ymd,
    };
  });

  // Smart default sort: overdue → due-today → due-soon → no-date, with
  // importance as the tiebreaker inside each bucket, and earlier due first.
  const bucket = (t: OpenTaskOption) => (t.overdue ? 0 : t.dueToday ? 1 : t.dueAt ? 2 : 3);
  enriched.sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
      importanceRank(a.priority) - importanceRank(b.priority),
  );
  return enriched;
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
      taskId: dailyChecklist.taskId,
      taskNo: tasks.taskNo,
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    // Carry the source task's number for display + drop rows whose task was
    // abandoned into the Recycle Bin (they shouldn't resurface as "unfinished").
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        lt(dailyChecklist.planDate, ymd),
        eq(dailyChecklist.done, false),
        sql`(${dailyChecklist.taskId} is null or ${tasks.abandonedAt} is null)`,
      ),
    )
    .orderBy(desc(dailyChecklist.planDate));
  return rows as OverdueItem[];
}
