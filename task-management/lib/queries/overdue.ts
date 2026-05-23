import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, employees, tasks } from "@/lib/db";
import { PENDING_STATUSES, type TaskStatus } from "@/db/enums";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A single overdue task row, joined with its doer's name so the digest
 * can render "Jane: 'Send NOC' — 4 days overdue" without a second trip.
 */
export interface OverdueTask {
  id: string;
  shortId: string | null;
  subject: string;
  dueAt: Date;
  doerId: string;
  doerName: string;
  daysOverdue: number;
}

/**
 * Single-query fetch of every overdue, pending, non-archived task in the
 * system, grouped by doer.  Used by the daily digest cron (M2.3).
 *
 * "Overdue" = `status IN PENDING_STATUSES AND due_at IS NOT NULL AND
 * due_at < now() AND archived = false AND employees.is_active = true`.
 *
 * The doer-name join means we do NOT N+1 by employee; the caller can
 * iterate the returned Map and ship one email per employee with all
 * their overdue tasks attached.
 *
 * `subject` falls back to the task title when the optional subject
 * column is null — every task has a title so the digest never renders
 * "" for an item.
 */
export async function listOverdueByEmployee(
  now: Date = new Date(),
): Promise<Map<string, OverdueTask[]>> {
  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      dueAt: tasks.dueAt,
      doerId: tasks.doerId,
      doerName: employees.name,
    })
    .from(tasks)
    .innerJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        inArray(
          tasks.status,
          PENDING_STATUSES as unknown as readonly TaskStatus[],
        ),
        isNotNull(tasks.dueAt),
        lt(tasks.dueAt, now),
        eq(tasks.archived, false),
        eq(employees.isActive, true),
      ),
    )
    .orderBy(sql`${tasks.dueAt} ASC`);

  const map = new Map<string, OverdueTask[]>();
  for (const r of rows) {
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - r.dueAt.getTime()) / MS_PER_DAY),
    );
    const row: OverdueTask = {
      id: r.id,
      shortId: r.shortId,
      subject: r.subject && r.subject.trim().length > 0 ? r.subject : r.title,
      dueAt: r.dueAt,
      doerId: r.doerId,
      doerName: r.doerName,
      daysOverdue,
    };
    const bucket = map.get(r.doerId);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(r.doerId, [row]);
    }
  }
  return map;
}
