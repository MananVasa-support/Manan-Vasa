"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals, goals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { todayYmd } from "@/lib/queries/daily-checklist";
import type { PlanItem, PlanKind } from "@/components/goals/plan/types";

/**
 * Server actions for the redesigned Plan-Your-Day planner (Module 4).
 *
 * Every commitment persists to `daily_checklist` — the SAME table the compulsory
 * plan gate counts (`countPlannedItems`) — so what the planner shows and what the
 * gate enforces can never drift. Provenance is kept exactly as the legacy surface:
 *   - a WEEKLY goal → `goal_id` set, `origin='goal_related'` (FK → weekly_goals).
 *   - a cascade goal (month/quarter/year) → stored as a standalone commitment
 *     (`daily_checklist.goal_id` only references weekly_goals, so the cascade id
 *     can't live there — the goal's title carries the intent). Origin 'standalone'.
 *   - a TASK → `task_id` set, `origin='standalone'`.
 *   - ad-hoc text → neither, `origin='standalone'`.
 *
 * NOTE (deliberate, mirrors daily-checklist/actions): these mutating actions do
 * NOT `revalidatePath`. Revalidating re-runs the (app) layout — which, once the
 * PLAN gate is switched on, would drop the gate the instant the Nth item lands and
 * bounce the user mid-plan. The client updates optimistically from the returned
 * item and only navigates away when the user clicks "Start my day".
 */

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const UUID = z.string().uuid();
/** Hard cap per day — keeps one runaway plan bounded (matches daily-checklist). */
const MAX_ITEMS_PER_DAY = 50;

/** Today's row count + the next append position, in one round-trip. */
async function countAndNextPosition(
  employeeId: string,
  ymd: string,
): Promise<{ count: number; nextPosition: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int`,
    })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return { count: row?.count ?? 0, nextPosition: (row?.max ?? 0) + 1 };
}

function rowToPlanItem(
  r: typeof dailyChecklist.$inferSelect,
  kind: PlanKind,
): PlanItem {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subject ?? r.client ?? null,
    origin: r.origin === "goal_related" ? "goal_related" : "standalone",
    kind,
    done: r.done,
  };
}

/** Pull a current/most-recent-week Weekly Goal onto today's plan. */
export async function addWeeklyGoalToPlan(
  goalId: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(goalId).success) return { ok: false, error: "Invalid goal." };

  const [goal] = await db
    .select({
      id: weeklyGoals.id,
      employeeId: weeklyGoals.employeeId,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      targetDone: weeklyGoals.targetDone,
    })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, goalId))
    .limit(1);
  if (!goal || goal.employeeId !== me.id) return { ok: false, error: "That goal isn't yours." };

  const ymd = todayYmd();
  try {
    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        goalId: goal.id,
        origin: "goal_related",
        title: goal.targetDone?.trim() || goal.subject?.trim() || "Weekly goal",
        client: goal.client,
        subject: goal.subject,
        position: nextPosition,
      })
      // Same weekly goal can't be pulled twice into one day (unique index).
      .onConflictDoNothing({
        target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId],
      })
      .returning();
    return { ok: true, item: row ? rowToPlanItem(row, "weekly") : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pull a cascade goal (year / quarter / month, from the `goals` tree) onto today
 * as a standalone commitment. `daily_checklist.goal_id` only references
 * weekly_goals, so the cascade id can't be stored there — the goal's title
 * carries the intent (origin 'standalone').
 */
export async function addCascadeGoalToPlan(
  goalId: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(goalId).success) return { ok: false, error: "Invalid goal." };

  const [goal] = await db
    .select({
      id: goals.id,
      employeeId: goals.employeeId,
      period: goals.period,
      title: goals.title,
      area: goals.area,
    })
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1);
  if (!goal || goal.employeeId !== me.id) return { ok: false, error: "That goal isn't yours." };

  const kind: PlanKind =
    goal.period === "year" ? "yearly" : goal.period === "quarter" ? "quarterly" : "monthly";
  const ymd = todayYmd();
  try {
    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        origin: "standalone",
        title: goal.title,
        subject: goal.area,
        position: nextPosition,
      })
      .returning();
    return { ok: true, item: row ? rowToPlanItem(row, kind) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Pull one of the employee's open Tasks onto today's plan. */
export async function addTaskToPlan(
  taskId: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task." };

  const [task] = await db
    .select({
      id: tasks.id,
      doerId: tasks.doerId,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task || task.doerId !== me.id) return { ok: false, error: "That task isn't yours." };

  const ymd = todayYmd();
  try {
    // Don't pull the same task twice into one day.
    const [dupe] = await db
      .select({ id: dailyChecklist.id })
      .from(dailyChecklist)
      .where(
        and(
          eq(dailyChecklist.employeeId, me.id),
          eq(dailyChecklist.planDate, ymd),
          eq(dailyChecklist.taskId, taskId),
        ),
      )
      .limit(1);
    if (dupe) return { ok: true, item: null };

    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        taskId: task.id,
        origin: "standalone",
        title: task.title,
        client: task.client,
        subject: task.subject,
        position: nextPosition,
      })
      .returning();
    return { ok: true, item: row ? rowToPlanItem(row, "task") : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add a typed ad-hoc commitment ("what will you deliver today"). */
export async function addAdhocToPlan(
  titleRaw: string,
): Promise<ActionResult<{ item: PlanItem }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (titleRaw ?? "").toString().trim();
  if (title.length < 2) return { ok: false, error: "Type what you'll deliver today." };
  if (title.length > 280) return { ok: false, error: "Keep it under 280 characters." };

  const ymd = todayYmd();
  try {
    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        origin: "standalone",
        title,
        position: nextPosition,
      })
      .returning();
    return { ok: true, item: rowToPlanItem(row!, "adhoc") };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Persist the plan's order after a drag-reorder (own rows only). */
export async function reorderPlan(orderedIds: string[]): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ids = z.array(z.string().uuid()).max(MAX_ITEMS_PER_DAY).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };
  if (ids.data.length === 0) return { ok: true };
  const ymd = todayYmd();
  try {
    // One statement: position = index in the supplied array, scoped to my rows.
    await db.execute(sql`
      update ${dailyChecklist} dc
      set position = o.ord, updated_at = now()
      from (
        select id, ord::int as ord
        from unnest(${sql`array[${sql.join(
          ids.data.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`}) with ordinality as t(id, ord)
      ) o
      where dc.id = o.id
        and dc.employee_id = ${me.id}
        and dc.plan_date = ${ymd}
    `);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove a commitment from today's plan (own rows only). */
export async function removePlanItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  try {
    const removed = await db
      .delete(dailyChecklist)
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id });
    if (removed.length === 0) return { ok: false, error: "That item isn't on your plan." };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
