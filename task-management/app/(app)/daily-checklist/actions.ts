"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dailyChecklist, weeklyGoals } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { todayYmd, type DailyItem } from "@/lib/queries/daily-checklist";
import type { DailyChecklistItem } from "@/db/schema";

/** Hard cap on checklist items per day (keeps one runaway day bounded). */
const MAX_ITEMS_PER_DAY = 50;

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

/**
 * Today's row count + the next append position, in one round-trip. Used both to
 * enforce the per-day cap and to give a new row a non-colliding position.
 */
async function todayCountAndNextPosition(
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
    const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY) {
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    }
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
        position: nextPosition,
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
    const { count, nextPosition } = await todayCountAndNextPosition(me.id, ymd);
    if (count >= MAX_ITEMS_PER_DAY) {
      return { ok: false, error: `You can plan at most ${MAX_ITEMS_PER_DAY} items a day.` };
    }
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
    const updated = await db
      .update(dailyChecklist)
      .set({
        done,
        status: done ? "done" : "not_started",
        doneNote: note?.trim() ? note.trim().slice(0, 500) : null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id });
    if (updated.length === 0) return { ok: false, error: "That item isn't on your checklist." };
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
    const removed = await db
      .delete(dailyChecklist)
      .where(and(eq(dailyChecklist.id, itemId), eq(dailyChecklist.employeeId, me.id)))
      .returning({ id: dailyChecklist.id });
    if (removed.length === 0) return { ok: false, error: "That item isn't on your checklist." };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Carry forward all unfinished checklist items from earlier days onto today.
 * Re-dates each open item forward (preserving its first-seen date in
 * `moved_from_date`) so it travels until done. Carried items get fresh,
 * SEQUENTIAL positions appended after today's current max so they never collide
 * with today's own positions. Done items keep their original day for the nightly
 * history. Returns how many were carried. (Carry-forward = simply forwarding
 * unfinished checklist items — it has no attendance meaning.)
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

    // Append after today's current max position so carried items get a clean
    // sequential run (1..n after the base) instead of inheriting their old
    // — and possibly colliding — positions.
    const { nextPosition: base } = await todayCountAndNextPosition(me.id, ymd);
    const moved = (await db.execute(sql`
      with carried as (
        select id,
               (${base} - 1) + row_number() over (
                 order by plan_date asc, position asc, committed_at asc
               ) as new_position
        from ${dailyChecklist}
        where employee_id = ${me.id}
          and plan_date < ${ymd}
          and done = false
      )
      update ${dailyChecklist} dc
      set plan_date = ${ymd},
          position = carried.new_position,
          moved_from_date = coalesce(dc.moved_from_date, dc.plan_date),
          updated_at = now()
      from carried
      where dc.id = carried.id
      returning dc.id, dc.title, dc.client, dc.subject, dc.origin, dc.goal_id,
                dc.status, dc.done, dc.done_note, dc.moved_from_date, dc.position
    `)) as unknown as Array<{
      id: string; title: string; client: string | null; subject: string | null;
      origin: string; goal_id: string | null; status: string; done: boolean;
      done_note: string | null; moved_from_date: string | null; position: number;
    }>;
    const items: DailyItem[] = moved.map((r) => ({
      id: r.id,
      title: r.title,
      client: r.client,
      subject: r.subject,
      origin: r.origin === "goal_related" ? "goal_related" : "standalone",
      goalId: r.goal_id,
      status: r.status as DailyItem["status"],
      done: r.done,
      doneNote: r.done_note,
      movedFromDate: r.moved_from_date,
      position: r.position,
    }));
    // No revalidatePath — keeps the gate stable mid-plan (see addStandaloneItem).
    return { ok: true, moved: items.length, items };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
