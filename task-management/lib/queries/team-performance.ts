import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  employees,
  tasks,
  weeklyGoals,
  attendanceLogs,
  dailyChecklist,
} from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { currentWeekStart, istYmd } from "@/lib/weekly-goals/week";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { isSuperAdmin } from "@/lib/auth/super-admin";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
}

/** The people a viewer may see on the team board: admin/super → all active;
 *  manager → transitive downline + self; individual contributor → just self. */
export async function teamScopeFor(me: {
  id: string;
  isAdmin: boolean;
  email: string;
}): Promise<TeamMember[]> {
  const cols = {
    id: employees.id,
    name: employees.name,
    avatarUrl: employees.avatarUrl,
    department: employees.department,
  };
  if (me.isAdmin || isSuperAdmin(me.email)) {
    return withRetry(
      () => db.select(cols).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
      { ...RETRY, label: "team-roster-all" },
    );
  }
  const downline = await getDownlineIds(me.id).catch(() => []);
  const ids = Array.from(new Set([me.id, ...downline]));
  const rows = await withRetry(
    () => db.select(cols).from(employees).where(and(inArray(employees.id, ids), eq(employees.isActive, true))).orderBy(asc(employees.name)),
    { ...RETRY, label: "team-roster" },
  );
  return rows;
}

export interface TeamMemberPerf {
  employeeId: string;
  goalsCount: number;
  goalsDone: number;
  goalScorePct: number | null; // weight-aware effective % this week (null = no goals)
  assignedToday: number; // open assigned tasks due today or overdue
  overdueTasks: number; // open assigned tasks past effective due
  pendingTasks: number; // all open assigned tasks
  needHelp: number; // open tasks flagged need_info
  doneToday: number; // tasks completed today
  plannedToday: boolean; // has any planned work today (assigned or personal)
  lastInAt: Date | null;
  lastOutAt: Date | null;
}

/** IST day-boundary instants for the given day (UTC instants). */
function dayBounds(ymd: string): { startToday: Date; startTomorrow: Date } {
  const [y, m, d] = ymd.split("-").map(Number);
  const startToday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - 5.5 * 3_600_000);
  const startTomorrow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1) - 5.5 * 3_600_000);
  return { startToday, startTomorrow };
}

/** Per-member performance for a roster — batched (5 group-by queries), independent
 *  of roster size, each retry-wrapped. Reads the SAME task/goal/attendance records
 *  everything else uses — no duplicated state. */
export async function teamPerformance(
  employeeIds: string[],
  now: Date = new Date(),
): Promise<Map<string, TeamMemberPerf>> {
  const out = new Map<string, TeamMemberPerf>();
  if (employeeIds.length === 0) return out;
  const ids = employeeIds;
  const ymd = istYmd(now);
  const week = currentWeekStart(now);
  const { startToday, startTomorrow } = dayBounds(ymd);
  const eff = effectiveDueAtSql();
  const num = (v: unknown) => Number(v ?? 0);

  const [goalRows, taskRows, attRows, planRows] = await Promise.all([
    // Weekly goals THIS week — weight-aware effective %
    withRetry(
      () =>
        db
          .select({
            id: weeklyGoals.employeeId,
            effSum: sql<number>`coalesce(sum(coalesce(${weeklyGoals.acceptPct}, ${weeklyGoals.pctDone}) * ${weeklyGoals.weight}),0)`,
            wSum: sql<number>`coalesce(sum(${weeklyGoals.weight}),0)`,
            n: sql<number>`count(*)::int`,
            done: sql<number>`coalesce(sum(case when coalesce(${weeklyGoals.acceptPct}, ${weeklyGoals.pctDone}) >= 100 then 1 else 0 end),0)::int`,
          })
          .from(weeklyGoals)
          .where(and(inArray(weeklyGoals.employeeId, ids), eq(weeklyGoals.weekStart, week), eq(weeklyGoals.archived, false)))
          .groupBy(weeklyGoals.employeeId),
      { ...RETRY, label: "team-goals" },
    ),
    // Assigned tasks — pending / overdue / due-today / need-help, by doer
    withRetry(
      () =>
        db
          .select({
            id: tasks.doerId,
            pending: sql<number>`coalesce(sum(case when ${tasks.status} not in ('done','approved','cancelled') then 1 else 0 end),0)::int`,
            overdue: sql<number>`coalesce(sum(case when ${tasks.status} not in ('done','approved','cancelled') and ${eff} < ${startToday} then 1 else 0 end),0)::int`,
            assignedToday: sql<number>`coalesce(sum(case when ${tasks.status} not in ('done','approved','cancelled') and ${effectiveDueAtSql()} < ${startTomorrow} then 1 else 0 end),0)::int`,
            needHelp: sql<number>`coalesce(sum(case when ${tasks.status} = 'need_info' then 1 else 0 end),0)::int`,
            doneToday: sql<number>`coalesce(sum(case when ${tasks.status} in ('done','approved') and ${tasks.completedAt} >= ${startToday} then 1 else 0 end),0)::int`,
          })
          .from(tasks)
          .where(and(inArray(tasks.doerId, ids), eq(tasks.archived, false)))
          .groupBy(tasks.doerId),
      { ...RETRY, label: "team-tasks" },
    ),
    // Today's attendance — last in / last out
    withRetry(
      () =>
        db
          .select({
            id: attendanceLogs.employeeId,
            lastIn: sql<Date | null>`max(case when ${attendanceLogs.kind} = 'in' then ${attendanceLogs.loggedAt} end)`,
            lastOut: sql<Date | null>`max(case when ${attendanceLogs.kind} = 'out' then ${attendanceLogs.loggedAt} end)`,
          })
          .from(attendanceLogs)
          .where(and(inArray(attendanceLogs.employeeId, ids), eq(attendanceLogs.logDate, ymd)))
          .groupBy(attendanceLogs.employeeId),
      { ...RETRY, label: "team-attendance" },
    ),
    // Personal checklist items today (assigned handled via the task query above)
    withRetry(
      () =>
        db
          .select({ id: dailyChecklist.employeeId, n: sql<number>`count(*)::int` })
          .from(dailyChecklist)
          .where(and(inArray(dailyChecklist.employeeId, ids), eq(dailyChecklist.planDate, ymd), isNull(dailyChecklist.taskId)))
          .groupBy(dailyChecklist.employeeId),
      { ...RETRY, label: "team-plan" },
    ),
  ]);

  const goalById = new Map(goalRows.map((r) => [r.id, r]));
  const taskById = new Map(taskRows.filter((r) => r.id).map((r) => [r.id as string, r]));
  const attById = new Map(attRows.map((r) => [r.id, r]));
  const planById = new Map(planRows.map((r) => [r.id, num(r.n)]));

  for (const id of ids) {
    const g = goalById.get(id);
    const t = taskById.get(id);
    const a = attById.get(id);
    const wSum = num(g?.wSum);
    const assignedToday = num(t?.assignedToday);
    const personal = planById.get(id) ?? 0;
    out.set(id, {
      employeeId: id,
      goalsCount: num(g?.n),
      goalsDone: num(g?.done),
      goalScorePct: wSum > 0 ? Math.round(num(g?.effSum) / wSum) : null,
      assignedToday,
      overdueTasks: num(t?.overdue),
      pendingTasks: num(t?.pending),
      needHelp: num(t?.needHelp),
      doneToday: num(t?.doneToday),
      plannedToday: assignedToday > 0 || personal > 0,
      lastInAt: a?.lastIn ? new Date(a.lastIn) : null,
      lastOutAt: a?.lastOut ? new Date(a.lastOut) : null,
    });
  }
  return out;
}
