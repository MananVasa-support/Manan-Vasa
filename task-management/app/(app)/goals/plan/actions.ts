"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, weeklyGoals, goals, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { applyTaskStatusChange } from "@/lib/tasks/set-status";
import { todayYmd, ymdForOffset, clampDayOffset, countPlannedItems } from "@/lib/queries/daily-checklist";
import { MIN_ATTENDANCE_ITEMS } from "@/lib/daily-checklist/constants";
import { goalsCanvasOn } from "@/lib/goals/flag";
import { getPlanDayPayload } from "./payload";
import { resolvePlanTarget } from "@/lib/goals/plan-target";
import { goalScopeFor, canManageGoalFor } from "@/lib/weekly-goals/hierarchy";
import type { PlanDayPayload, PlanItem, PlanKind } from "@/components/goals/plan/types";

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
 *     Phase 5 (GOALS_CANVAS_ON + migration 0141): the cascade id ALSO lands in
 *     `cascade_goal_id`, flag-guarded with a legacy fallback while unapplied.
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

/**
 * ONE ITEM LIVES ON EXACTLY ONE DAY (Sir 2026-08).
 *
 * Each add-path used to de-dupe only within the TARGET day
 * (`employee + plan_date + ref`), so the very same goal or task could be pushed
 * onto Today AND Tomorrow AND Day-after at once — three rows, three places to
 * tick it off.
 *
 * This looks across the whole planning horizon for an existing, NOT-YET-DONE row
 * for the same source and, if it finds one, MOVES it (re-dates the single row)
 * onto the target day instead of inserting a second one. That is also exactly
 * what "move it from tomorrow to today" should do, so adding and moving are the
 * same gesture and can never disagree.
 *
 * Rows that are already DONE are left alone — they are history for the day they
 * were completed on, not something to drag forward.
 */
async function moveIfPlannedElsewhere(
  employeeId: string,
  ymd: string,
  ref: { taskId?: string; goalId?: string; cascadeGoalId?: string },
  kind: PlanKind,
): Promise<PlanItem | null> {
  const col = ref.taskId
    ? dailyChecklist.taskId
    : ref.goalId
      ? dailyChecklist.goalId
      : dailyChecklist.cascadeGoalId;
  const value = ref.taskId ?? ref.goalId ?? ref.cascadeGoalId;
  if (!value) return null;

  const [existing] = await db
    .select({ id: dailyChecklist.id, planDate: dailyChecklist.planDate })
    .from(dailyChecklist)
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        eq(col, value),
        eq(dailyChecklist.done, false),
        // Any planned day OTHER than the target. Past days are intentionally
        // included: re-adding a stale commitment should pull it forward, which
        // is what the Unfinished column already does.
        sql`${dailyChecklist.planDate} <> ${ymd}`,
      ),
    )
    .limit(1);
  if (!existing) return null;

  const { nextPosition } = await countAndNextPosition(employeeId, ymd);
  const [moved] = await db
    .update(dailyChecklist)
    .set({ planDate: ymd, position: nextPosition })
    .where(eq(dailyChecklist.id, existing.id))
    .returning(PLAN_ITEM_RETURNING);
  if (!moved) return null;
  return rowToPlanItem(moved, kind);
}

/**
 * The OWNER of a plan row, but only if the caller is allowed to act on it —
 * otherwise null. Lets a manager/admin manage a plan they built for someone in
 * their downline (move it to another day, rename it, drop it) using the same
 * authority as `resolvePlanTarget`.
 *
 * Deliberately NOT used by `setItemProgress` / `startMyDay` / `closeMyDay`:
 * reporting progress and starting a day are the DOER's own act, and a manager
 * ticking someone else's work done would falsify that person's record.
 */
async function ownerIfPermitted(
  me: { id: string; isAdmin: boolean },
  itemId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ employeeId: dailyChecklist.employeeId })
    .from(dailyChecklist)
    .where(eq(dailyChecklist.id, itemId))
    .limit(1);
  if (!row) return null;
  if (row.employeeId === me.id) return row.employeeId;
  const scope = await goalScopeFor({ id: me.id, isAdmin: me.isAdmin });
  return canManageGoalFor(scope, row.employeeId) ? row.employeeId : null;
}

/**
 * Explicit RETURNING list — NEVER use bare `.returning()` on daily_checklist:
 * that enumerates every schema column, including 0141's `cascade_goal_id`,
 * which may be UNAPPLIED in prod until GOALS_CANVAS_ON ships (see db/schema.ts).
 * This list is exactly what `rowToPlanItem` consumes.
 */
const PLAN_ITEM_RETURNING = {
  id: dailyChecklist.id,
  title: dailyChecklist.title,
  client: dailyChecklist.client,
  subject: dailyChecklist.subject,
  origin: dailyChecklist.origin,
  done: dailyChecklist.done,
};

type PlanItemRow = {
  id: string;
  title: string;
  client: string | null;
  subject: string | null;
  origin: string;
  done: boolean;
};

function rowToPlanItem(r: PlanItemRow, kind: PlanKind): PlanItem {
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
  dayOffset: number = 0,
  forEmployeeId?: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(goalId).success) return { ok: false, error: "Invalid goal." };
  // Whose day is being planned — falls back to my own when not permitted.
  const { employeeId: ownerId } = await resolvePlanTarget(me, forEmployeeId);

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
  if (!goal || goal.employeeId !== ownerId) return { ok: false, error: "That goal isn't theirs." };

  const ymd = ymdForOffset(dayOffset);
  try {
    // Already planned on ANOTHER day → move it here rather than duplicating.
    const moved = await moveIfPlannedElsewhere(ownerId, ymd, { goalId: goal.id }, "weekly");
    if (moved) return { ok: true, item: moved };

    const { count, nextPosition } = await countAndNextPosition(ownerId, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: ownerId,
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
      .returning(PLAN_ITEM_RETURNING);
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
  dayOffset: number = 0,
  forEmployeeId?: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(goalId).success) return { ok: false, error: "Invalid goal." };
  const { employeeId: ownerId } = await resolvePlanTarget(me, forEmployeeId);

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
  if (!goal || goal.employeeId !== ownerId) return { ok: false, error: "That goal isn't theirs." };

  const kind: PlanKind =
    goal.period === "year" ? "yearly" : goal.period === "quarter" ? "quarterly" : "monthly";
  const ymd = ymdForOffset(dayOffset);
  try {
    // Already planned on ANOTHER day → move it here rather than duplicating.
    // (Cascade goals only carry `cascade_goal_id` once migration 0141 is applied;
    // before that there is no id to match on and this simply finds nothing.)
    const moved = await moveIfPlannedElsewhere(ownerId, ymd, { cascadeGoalId: goal.id }, kind);
    if (moved) return { ok: true, item: moved };

    const { count, nextPosition } = await countAndNextPosition(ownerId, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const base = {
      employeeId: me.id,
      planDate: ymd,
      origin: "standalone",
      title: goal.title,
      subject: goal.area,
      position: nextPosition,
    };

    // Phase 5 (GOALS_CANVAS_ON only): keep the cascade provenance — store the
    // goals.id in 0141's cascade_goal_id so completion can reflect back to the
    // source (see reflectIncremental). GUARDED: if the 0141 migration hasn't
    // been applied yet the insert fails on the unknown column and we fall
    // through to the legacy title-only insert — behaviour degrades, never breaks.
    if (goalsCanvasOn()) {
      try {
        const [row] = await db
          .insert(dailyChecklist)
          .values({ ...base, cascadeGoalId: goal.id })
          // Same cascade goal can't be pulled twice into one day (0141 unique index).
          .onConflictDoNothing({
            target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.cascadeGoalId],
          })
          .returning(PLAN_ITEM_RETURNING);
        return { ok: true, item: row ? rowToPlanItem(row, kind) : null };
      } catch {
        // 0141 unapplied — legacy path below.
      }
    }

    const [row] = await db.insert(dailyChecklist).values(base).returning(PLAN_ITEM_RETURNING);
    return { ok: true, item: row ? rowToPlanItem(row, kind) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Pull one of the employee's open Tasks onto today's plan. */
export async function addTaskToPlan(
  taskId: string,
  dayOffset: number = 0,
  forEmployeeId?: string,
): Promise<ActionResult<{ item: PlanItem | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(taskId).success) return { ok: false, error: "Invalid task." };
  const { employeeId: ownerId } = await resolvePlanTarget(me, forEmployeeId);

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
  // The task must belong to the person whose day we're planning.
  if (!task || task.doerId !== ownerId) return { ok: false, error: "That task isn't theirs." };

  const ymd = ymdForOffset(dayOffset);
  try {
    // Don't pull the same task twice into one day.
    const [dupe] = await db
      .select({ id: dailyChecklist.id })
      .from(dailyChecklist)
      .where(
        and(
          eq(dailyChecklist.employeeId, ownerId),
          eq(dailyChecklist.planDate, ymd),
          eq(dailyChecklist.taskId, taskId),
        ),
      )
      .limit(1);
    if (dupe) return { ok: true, item: null };

    // Already planned on ANOTHER day → move it here rather than duplicating.
    const moved = await moveIfPlannedElsewhere(ownerId, ymd, { taskId }, "task");
    if (moved) return { ok: true, item: moved };

    const { count, nextPosition } = await countAndNextPosition(ownerId, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: ownerId,
        planDate: ymd,
        taskId: task.id,
        origin: "standalone",
        title: task.title,
        client: task.client,
        subject: task.subject,
        position: nextPosition,
      })
      .returning(PLAN_ITEM_RETURNING);
    return { ok: true, item: row ? rowToPlanItem(row, "task") : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pull a PREVIOUSLY-UNFINISHED commitment (a prior-day daily_checklist row, done
 * = false) onto the target day — carrying its origin (weekly goal_id / task_id)
 * so the pipeline can still reflect completion back to the source.
 *
 * BUG-FIX (Sir 2026-08): this MOVES the row (updates its plan_date) rather than
 * copying it. The old copy left the original earlier-day row in place, so the
 * item never left the "Unfinished" column (esp. plain typed items, which the
 * de-dupe couldn't match). A move re-dates the one row onto the target day →
 * `getOverdueItems` (plan_date < today) no longer returns it. If the same
 * goal/task already sits on the target day, the carried row is redundant and is
 * simply deleted.
 */
export async function addUnfinishedToPlan(
  rowId: string,
  dayOffset: number = 0,
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
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    .where(eq(dailyChecklist.id, rowId))
    .limit(1);
  if (!src || src.employeeId !== me.id) return { ok: false, error: "That item isn't yours." };

  const ymd = ymdForOffset(dayOffset);
  if (src.planDate === ymd) return { ok: true, item: null }; // already on that day
  try {
    // Same goal/task already on the target day → the carried row is redundant;
    // delete it so it just leaves "Unfinished" (no duplicate on the plan).
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
      if (dupe) {
        await db
          .delete(dailyChecklist)
          .where(and(eq(dailyChecklist.id, rowId), eq(dailyChecklist.employeeId, me.id)));
        return { ok: true, item: null };
      }
    }

    const { count, nextPosition } = await countAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    // MOVE, don't copy — re-date the single row onto the target day.
    const [row] = await db
      .update(dailyChecklist)
      .set({
        planDate: ymd,
        movedFromDate: src.planDate,
        position: nextPosition,
        done: false,
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, rowId), eq(dailyChecklist.employeeId, me.id)))
      .returning(PLAN_ITEM_RETURNING);
    const kind: PlanKind = src.goalId ? "weekly" : src.taskId ? "task" : "adhoc";
    return { ok: true, item: row ? rowToPlanItem(row, kind) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Transfer a commitment already on the plan to a FUTURE day (tomorrow /
 * day-after) — "push it forward" from the plan or the close-out review. Same
 * move-not-copy mechanic as {@link addUnfinishedToPlan}: it re-dates the one
 * row, stamps `movedFromDate`, and (if the target day already holds the same
 * goal/task) deletes the redundant row instead. `toOffset` is 1 (tomorrow) or 2
 * (day after); 0 is rejected — you can't transfer to today.
 */
export async function transferPlanItem(
  itemId: string,
  toOffset: number,
): Promise<ActionResult<{ movedTo: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  // Any planner day is a valid destination INCLUDING today (0) — Sir moves work
  // back as often as forward ("from tomorrow to today"). The old guard rejected
  // offset 0, so a pushed item could never be pulled back.
  const offset = clampDayOffset(toOffset);

  const [src] = await db
    .select({
      employeeId: dailyChecklist.employeeId,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      planDate: dailyChecklist.planDate,
    })
    .from(dailyChecklist)
    .where(eq(dailyChecklist.id, itemId))
    .limit(1);
  // Mine, or someone's whose plan I'm allowed to manage.
  const ownerId = src ? await ownerIfPermitted(me, itemId) : null;
  if (!src || !ownerId) return { ok: false, error: "That item isn't yours." };

  const ymd = ymdForOffset(offset);
  if (src.planDate === ymd) return { ok: true, movedTo: ymd };
  try {
    if (src.goalId || src.taskId) {
      const [dupe] = await db
        .select({ id: dailyChecklist.id })
        .from(dailyChecklist)
        .where(
          and(
            eq(dailyChecklist.employeeId, ownerId),
            eq(dailyChecklist.planDate, ymd),
            src.goalId ? eq(dailyChecklist.goalId, src.goalId) : eq(dailyChecklist.taskId, src.taskId!),
          ),
        )
        .limit(1);
      if (dupe) {
        await db
          .delete(dailyChecklist)
          .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, ownerId)));
        return { ok: true, movedTo: ymd };
      }
    }
    const { count, nextPosition } = await countAndNextPosition(ownerId, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `That day already has ${MAX_ITEMS_PER_DAY} items.` };
    await db
      .update(dailyChecklist)
      .set({
        planDate: ymd,
        movedFromDate: src.planDate,
        position: nextPosition,
        done: false,
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, ownerId)));
    return { ok: true, movedTo: ymd };
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
  dayOffset: number = 0,
  forEmployeeId?: string,
): Promise<ActionResult<{ item: PlanItem }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (titleRaw ?? "").toString().trim();
  if (title.length < 2) return { ok: false, error: "Type what you'll deliver today." };
  if (title.length > 280) return { ok: false, error: "Keep it under 280 characters." };
  const { employeeId: ownerId } = await resolvePlanTarget(me, forEmployeeId);

  const ymd = ymdForOffset(dayOffset);
  try {
    const { count, nextPosition } = await countAndNextPosition(ownerId, ymd);
    if (count >= MAX_ITEMS_PER_DAY)
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: ownerId,
        planDate: ymd,
        origin: "standalone",
        title,
        position: nextPosition,
      })
      .returning(PLAN_ITEM_RETURNING);
    return { ok: true, item: rowToPlanItem(row!, "adhoc") };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Persist the plan's order after a drag-reorder (own rows only). */
export async function reorderPlan(
  orderedIds: string[],
  dayOffset: number = 0,
  forEmployeeId?: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ids = z.array(z.string().uuid()).max(MAX_ITEMS_PER_DAY).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };
  if (ids.data.length === 0) return { ok: true };
  const { employeeId: ownerId } = await resolvePlanTarget(me, forEmployeeId);
  const ymd = ymdForOffset(dayOffset);
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
        and dc.employee_id = ${ownerId}
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
 *
 * ENFORCES THE MINIMUM SERVER-SIDE. The button is disabled below `minItems`,
 * but that is a client check and this stamp is now what unlocks attendance —
 * anyone who can call this action could otherwise open their own clock-in with
 * an empty plan. Same constant the attendance gate reads, so the button, this
 * guard and the punch can never disagree about what "planned" means.
 *
 * Counts COMMITTED items only (`countPlannedItems` = today's daily_checklist
 * rows), matching the number the planner shows you. Merely-assigned tasks do
 * not count here: starting your day is an act of committing, and the whole
 * point is that you chose these five.
 */
export async function startMyDay(): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const ymd = todayYmd();

  const committed = await countPlannedItems(me.id, ymd).catch(() => MIN_ATTENDANCE_ITEMS);
  if (committed < MIN_ATTENDANCE_ITEMS) {
    const short = MIN_ATTENDANCE_ITEMS - committed;
    return {
      ok: false,
      error: `Plan at least ${MIN_ATTENDANCE_ITEMS} things before you start your day — you have ${committed}, add ${short} more.`,
    };
  }

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
    //
    // Phase 5 fork (design §4.4 item 5, gated decision Q7): with GOALS_CANVAS_ON
    // the reflection becomes INCREMENTAL — partial % also rolls up (monotonic).
    // The un-flagged branch below is the byte-identical legacy 100%-only path:
    // with the flag OFF, no number a manager reads changes.
    if (goalsCanvasOn()) {
      await reflectIncremental(me, updated.id, updated.taskId, updated.goalId, { done, pct }).catch(
        () => {},
      );
    } else if (done && pct === 100) {
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
      .set({
        pctDone: 100,
        // STATUS TOO (Sir): setting only pct_done left the weekly goal reading
        // "Not started" at 100% — the board shows status, so ticking a plan item
        // 100% looked like it had done nothing to the goal it came from.
        status: "done",
        pctUpdatedById: me.id,
        pctUpdatedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(and(eq(weeklyGoals.id, goalId), eq(weeklyGoals.employeeId, me.id)));
  }
}

/**
 * Phase 5 — INCREMENTAL reflection (runs ONLY behind GOALS_CANVAS_ON; the
 * legacy 100%-only `reflectCompletion` above stays byte-identical for the
 * un-flagged path).
 *
 * Semantics (design §4.4 item 5 + locked decisions):
 *  · 100% ⇒ exactly the legacy reflection (task flips done, weekly hits 100).
 *  · Partial % on a WEEKLY-goal commitment nudges the weekly's own self-rating
 *    MONOTONICALLY — `greatest(pct_done, pct)` can raise, never lower, a rating
 *    the owner already logged — and stamps pct_updated_at (the Saturday-commit
 *    "filled" signal). This propagates the owner's MANUAL day mark; it is NOT
 *    a derived actual÷target number (locked decision 2 intact) and NOT the
 *    rollup projection (locked decision 1 intact — no derived rollup is ever
 *    written to pctDone/acceptPct).
 *  · A CASCADE-goal commitment (0141 `cascade_goal_id` provenance) reflects the
 *    same monotonic mark onto its `goals` row. GUARDED: reading the column is
 *    wrapped so an unapplied 0141 migration silently disables this leg.
 */
async function reflectIncremental(
  me: { id: string; name: string; isAdmin: boolean },
  itemId: string,
  taskId: string | null,
  goalId: string | null,
  mark: { done: boolean; pct: number | null },
): Promise<void> {
  const pct = mark.pct;

  if (mark.done && pct === 100) {
    // Full completion — the legacy pipeline, unchanged.
    await reflectCompletion(me, taskId, goalId);
  } else if (goalId && pct != null && pct > 0) {
    // Partial progress → monotonic nudge on the weekly source (own rows only).
    await db
      .update(weeklyGoals)
      .set({
        pctDone: sql`greatest(${weeklyGoals.pctDone}, ${pct})`,
        // Partial progress moves it off "Not started"; only 100% (handled by
        // reflectCompletion above) marks it done.
        status: "initiated",
        pctUpdatedById: me.id,
        pctUpdatedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(and(eq(weeklyGoals.id, goalId), eq(weeklyGoals.employeeId, me.id)));
  }

  // Cascade provenance leg — column may not exist yet (0141 unapplied): the
  // SELECT throws, we swallow, and the cascade reflection is quietly off.
  if (pct != null && pct > 0) {
    try {
      const [row] = await db
        .select({ cascadeGoalId: dailyChecklist.cascadeGoalId })
        .from(dailyChecklist)
        .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
        .limit(1);
      const cascadeGoalId = row?.cascadeGoalId ?? null;
      if (cascadeGoalId) {
        await db
          .update(goals)
          .set({
            pctDone: sql`greatest(${goals.pctDone}, ${pct})`,
            updatedById: me.id,
            updatedAt: new Date(),
          })
          .where(and(eq(goals.id, cascadeGoalId), eq(goals.employeeId, me.id)));
      }
    } catch {
      // 0141 unapplied — provenance reflection unavailable, never fatal.
    }
  }
}

/** Remove a commitment from today's plan (own rows only). */
export async function removePlanItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  // Mine, or a plan I manage for someone in my downline.
  const ownerId = await ownerIfPermitted(me, itemId);
  if (!ownerId) return { ok: false, error: "That item isn't on your plan." };

  try {
    const removed = await db
      .delete(dailyChecklist)
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, ownerId)))
      .returning({ id: dailyChecklist.id });
    if (removed.length === 0) return { ok: false, error: "That item isn't on your plan." };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Rename a commitment on today's plan — fix a typo/spelling in what you typed.
 * Scoped to the caller's OWN daily_checklist row. This edits the plan row's
 * title only (the personal daily snapshot); it does not rewrite a linked
 * weekly-goal / task record. Same 2–280 length rules as adding a commitment.
 */
export async function renamePlanItem(itemId: string, titleRaw: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  const title = (titleRaw ?? "").toString().trim();
  if (title.length < 2) return { ok: false, error: "Type what you'll deliver today." };
  if (title.length > 280) return { ok: false, error: "Keep it under 280 characters." };
  const ownerId = await ownerIfPermitted(me, itemId);
  if (!ownerId) return { ok: false, error: "That item isn't on your plan." };

  try {
    const updated = await db
      .update(dailyChecklist)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, ownerId)))
      .returning({ id: dailyChecklist.id });
    if (updated.length === 0) return { ok: false, error: "That item isn't on your plan." };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ───────────────── Phase 5 — canvas Day-stage lazy loader ───────────────── */

/**
 * Load the caller's OWN Plan-Your-Day payload for the canvas Day zoom stage
 * (design §2.1 daily fold-in + §3.3 lazy detail bundles — fetched once when the
 * Day stage mounts, NOT eagerly joined into the cascade spine query).
 *
 * The day is strictly personal: `viewedEmployeeId` is only ever COMPARED to the
 * authed user (never used as a query scope), so a spoofed id can at worst hide
 * my own data — no downline/peer leak is possible.
 */
export async function loadPlanDay(
  viewedEmployeeId: string,
): Promise<ActionResult<{ self: boolean; payload: PlanDayPayload | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  if (!UUID.safeParse(viewedEmployeeId).success) return { ok: false, error: "Invalid person." };
  if (viewedEmployeeId !== me.id) return { ok: true, self: false, payload: null };
  try {
    return { ok: true, self: true, payload: await getPlanDayPayload(me.id) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
