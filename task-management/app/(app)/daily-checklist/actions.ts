"use server";

import { revalidatePath } from "next/cache";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { todayYmd, type DailyItem } from "@/lib/queries/daily-checklist";
import type { DailyChecklistItem } from "@/db/schema";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/daily-checklist";
const UUID = z.string().uuid();

/** Map a DB row → the client-facing DailyItem shape. */
function toItem(r: DailyChecklistItem): DailyItem {
  return {
    id: r.id,
    title: r.title,
    client: r.client,
    subject: r.subject,
    origin: r.origin === "goal_related" ? "goal_related" : "standalone",
    goalId: r.goalId,
    status: r.status,
    done: r.done,
    doneNote: r.doneNote,
    movedFromDate: r.movedFromDate,
    position: r.position,
  };
}

/** Next position for today's list (append to the end). */
async function nextPosition(employeeId: string, ymd: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return (row?.max ?? 0) + 1;
}

/** Pull a current-week Weekly Goal onto today's checklist (goal-related item). */
export async function pullGoalToToday(
  goalId: string,
): Promise<ActionResult<{ item: DailyItem | null }>> {
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
  if (!goal || goal.employeeId !== me.id) {
    return { ok: false, error: "That goal isn't yours." };
  }

  const ymd = todayYmd();
  try {
    const rows = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        goalId: goal.id,
        origin: "goal_related",
        title: goal.targetDone?.trim() || goal.subject?.trim() || "Weekly goal",
        client: goal.client,
        subject: goal.subject,
        position: await nextPosition(me.id, ymd),
      })
      // Same goal can't be pulled twice into one day (unique index).
      .onConflictDoNothing({
        target: [dailyChecklist.employeeId, dailyChecklist.planDate, dailyChecklist.goalId],
      })
      .returning();
    // NOTE: no revalidatePath here. The daily-plan GATE is rendered by the (app)
    // layout based on needsDailyPlan(); revalidating would re-run the layout and
    // drop the gate the instant the 5th item lands — kicking the user in before
    // they click "Start my day". Page mode refreshes via router.refresh() itself.
    return { ok: true, item: rows[0] ? toItem(rows[0]) : null };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add a typed ad-hoc (stand-alone) item to today. */
export async function addStandaloneItem(
  formData: FormData,
): Promise<ActionResult<{ item: DailyItem }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (formData.get("title") ?? "").toString().trim();
  if (title.length < 2) return { ok: false, error: "Type what you'll do (a couple of words)." };
  if (title.length > 280) return { ok: false, error: "Keep it under 280 characters." };

  const ymd = todayYmd();
  try {
    const [row] = await db
      .insert(dailyChecklist)
      .values({
        employeeId: me.id,
        planDate: ymd,
        origin: "standalone",
        title,
        position: await nextPosition(me.id, ymd),
      })
      .returning();
    // No revalidatePath — see addStandaloneItem note: keeps the gate from
    // dropping mid-plan. Page mode refreshes via router.refresh().
    return { ok: true, item: toItem(row!) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Close an item out (night) — done/not-done + optional note. */
export async function closeItem(
  itemId: string,
  done: boolean,
  note?: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  try {
    await db
      .update(dailyChecklist)
      .set({
        done,
        status: done ? "done" : "not_started",
        doneNote: note?.trim() ? note.trim().slice(0, 500) : null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)));
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Remove an item from the checklist (own items only). */
export async function removeItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(itemId).success) return { ok: false, error: "Invalid item." };

  try {
    await db
      .delete(dailyChecklist)
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)));
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Roll all unfinished items from earlier days onto today. Re-dates each open
 * item forward (preserving its first-seen date in `moved_from_date`) so it
 * travels until done. Done items keep their original day for the nightly
 * history. Returns how many were moved.
 */
export async function moveOverdueToToday(): Promise<
  ActionResult<{ moved: number; items: DailyItem[] }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ymd = todayYmd();
  try {
    // Drop any overdue row whose goal is already on today's list (would violate
    // the per-day unique goal index), then re-date the rest forward.
    await db.execute(sql`
      delete from ${dailyChecklist} od
      where od.employee_id = ${me.id}
        and od.plan_date < ${ymd}
        and od.done = false
        and od.goal_id is not null
        and exists (
          select 1 from ${dailyChecklist} t
          where t.employee_id = ${me.id} and t.plan_date = ${ymd} and t.goal_id = od.goal_id
        )
    `);
    const moved = await db
      .update(dailyChecklist)
      .set({
        planDate: ymd,
        movedFromDate: sql`coalesce(${dailyChecklist.movedFromDate}, ${dailyChecklist.planDate})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dailyChecklist.employeeId, me.id),
          lt(dailyChecklist.planDate, ymd),
          eq(dailyChecklist.done, false),
        ),
      )
      .returning();
    // No revalidatePath — keeps the gate stable mid-plan (see addStandaloneItem).
    return { ok: true, moved: moved.length, items: moved.map(toItem) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
