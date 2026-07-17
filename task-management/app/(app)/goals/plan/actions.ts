"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, weeklyGoals, goals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";
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

/**
 * Pull a PREVIOUSLY-UNFINISHED commitment (a prior-day daily_checklist row, done
 * = false) onto today — carrying its origin (weekly goal_id / task_id) so the
 * pipeline can still reflect completion back to the source. Skips if the same
 * goal/task is already on today's plan.
 */
export async function addUnfinishedToPlan(
  rowId: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(rowId).success) return { ok: false, error: "Invalid item." };

  const [src] = await db
    .select({
      employeeId: dailyChecklist.employeeId,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      origin: dailyChecklist.origin,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    .where(eq(dailyChecklist.id, rowId))
    .limit(1);
  if (!src || src.employeeId !== me.id) return { ok: false, error: "That item isn't yours." };

  const ymd = todayYmd();
  try {
    // Don't double-pull the same goal/task into today.
    if (src.goalId || src.taskId) {
      const [dupe] = await db
        .select({ id: dailyChecklist.id })
        .from(dailyChecklist)
        .where(
          and(
            eq(dailyChecklist.employeeId, me.id),
            eq(dailyChecklist.planDate, ymd),
            src.goalId ? eq(dailyChecklist.goalId, src.goalId) : eq(dailyChecklist.taskId, src.taskId!),
          ),
        )
        .limit(1);
      if (dupe) return { ok: true, item: null };
    }

    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        goalId: src.goalId,
        taskId: src.taskId,
        origin: src.origin,
        title: src.title,
        client: src.client,
        subject: src.subject,
        position: nextPosition,
        movedFromDate: src.planDate,
      })
      .onConflictDoNothing({
        target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId],
      })
      .returning();
    const kind: PlanKind = src.goalId ? "weekly" : src.taskId ? "task" : "unfinished";
    return { ok: true, item: row ? rowToPlanItem(row, kind) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * "Abandon" a task from the daily loop → the Recycle Bin. It leaves the plan
 * sources + task lists; a manager can later restore or permanently delete it.
 * The doer (or an admin) can abandon their own task.
 */
export async function abandonTask(taskId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task." };

  const [t] = await db
    .select({ doerId: tasks.doerId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return { ok: false, error: "Task not found." };
  if (t.doerId !== me.id && !me.isAdmin) return { ok: false, error: "That task isn't yours." };

  try {
    await db
      .update(tasks)
      .set({ abandonedAt: new Date(), abandonedById: me.id, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    return { ok: true };
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

/* ─────────────────────── day lifecycle (Plan My Day) ─────────────────────── */

/**
 * "Start my day" — persist that the plan is committed. Idempotent per day (a
 * unique index on employee_id+plan_date; re-clicking keeps the first started_at
 * and just clears any stale closed_at so re-planning re-opens the day).
 */
export async function startMyDay(): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();
  try {
    await db
      .insert(dailyPlanDay)
      .values({ employeeId: me.id, planDate: ymd, startedAt: new Date() })
      .onConflictDoUpdate({
        target: [dailyPlanDay.employeeId, dailyPlanDay.planDate],
        set: { startedAt: sql`coalesce(${dailyPlanDay.startedAt}, now())`, closedAt: null, updatedAt: new Date() },
      });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-open the plan (back to morning drag-drop) — clears started/closed for today. */
export async function reopenPlan(): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();
  try {
    await db
      .update(dailyPlanDay)
      .set({ startedAt: null, closedAt: null, updatedAt: new Date() })
      .where(and(eq(dailyPlanDay.employeeId, me.id), eq(dailyPlanDay.planDate, ymd)));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** "Finish day" — stamp the end-of-day close-out as complete. */
export async function closeMyDay(): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();
  try {
    await db
      .insert(dailyPlanDay)
      .values({ employeeId: me.id, planDate: ymd, startedAt: new Date(), closedAt: new Date() })
      .onConflictDoUpdate({
        target: [dailyPlanDay.employeeId, dailyPlanDay.planDate],
        set: { startedAt: sql`coalesce(${dailyPlanDay.startedAt}, now())`, closedAt: new Date(), updatedAt: new Date() },
      });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Close-out marking for a single commitment: an optional 0-100% progress + a
 * done tick. Setting 100% ticks done; ticking done fills 100%. Own rows only.
 */
export async function setItemProgress(
  itemId: string,
  input: { done: boolean; pct: number | null; note?: string | null },
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  let pct = input.pct == null ? null : Math.max(0, Math.min(100, Math.round(input.pct)));
  let done = !!input.done;
  // Keep the tick and the percent coherent.
  if (pct === 100) done = true;
  if (done && pct == null) pct = 100;
  if (!done && pct === 100) pct = 99; // a 100% item is "done" by definition

  // Optional close-out note (Sir's rule 5) — undefined ⇒ leave the note as-is.
  const noteRaw = input.note;
  const note = noteRaw === undefined ? undefined : (noteRaw ?? "").toString().slice(0, 500) || null;

  try {
    const [updated] = await db
      .update(dailyChecklist)
      .set({
        done,
        donePct: pct,
        status: done ? "done" : "not_started",
        ...(note === undefined ? {} : { doneNote: note }),
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id, taskId: dailyChecklist.taskId, goalId: dailyChecklist.goalId });
    if (!updated) return { ok: false, error: "That item isn't on your plan." };

    // ── The pipeline (Sir): a commitment at 100% reflects back to its SOURCE so
    // nothing accumulates — the origin task flips done, the origin weekly goal
    // hits 100%. Best-effort: a reflect failure must NOT undo the mark itself.
    if (done && pct === 100) {
      await reflectCompletion(me, updated.taskId, updated.goalId).catch(() => {});
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Push a 100%-done commitment back onto its origin task / weekly goal. */
async function reflectCompletion(
  me: { id: string; name: string; isAdmin: boolean },
  taskId: string | null,
  goalId: string | null,
): Promise<void> {
  if (taskId) {
    const [t] = await db
      .select({ doerId: tasks.doerId, updatedAt: tasks.updatedAt, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    // Only the doer closes their own task, and don't fight an approval verdict.
    if (t && t.doerId === me.id && !["done", "approved", "cancelled"].includes(t.status)) {
      await applyTaskStatusChange(
        { id: me.id, name: me.name, isAdmin: me.isAdmin },
        taskId,
        "done",
        t.updatedAt.toISOString(),
      );
    }
  }
  if (goalId) {
    await db
      .update(weeklyGoals)
      .set({ pctDone: 100, pctUpdatedById: me.id, pctUpdatedAt: new Date(), updatedById: me.id, updatedAt: new Date() })
      .where(and(eq(weeklyGoals.id, goalId), eq(weeklyGoals.employeeId, me.id)));
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
