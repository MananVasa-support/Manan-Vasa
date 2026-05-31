import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  isGoogleConfigured,
  type CalendarTask,
} from "./calendar";

/**
 * Reconcile a task's Google Calendar event to its current state. Idempotent
 * and best-effort — any failure is logged, never thrown, so it can run inside
 * `after()` without affecting the task save.
 *
 * Handles create, update, reassign (move between doers' calendars), and
 * archive (remove). A doer who hasn't connected Google simply doesn't sync.
 */
export async function reconcileTaskEvent(taskId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  try {
    const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
    if (!t) return;

    const eventId = t.googleEventId;
    const syncedDoer = t.googleSyncedDoerId;

    // Archived → tear down any existing event, clear the pointers.
    if (t.archived) {
      if (eventId && syncedDoer) {
        const tok = await doerToken(syncedDoer);
        if (tok) await deleteEvent(tok, eventId).catch(() => {});
      }
      if (eventId) await clearPointers(taskId);
      return;
    }

    // Reassigned → remove the event from the previous doer's calendar first.
    if (eventId && syncedDoer && syncedDoer !== t.doerId) {
      const oldTok = await doerToken(syncedDoer);
      if (oldTok) await deleteEvent(oldTok, eventId).catch(() => {});
    }

    const tok = await doerToken(t.doerId);
    if (!tok) {
      // Current doer isn't connected. Drop any stale pointer from the old doer.
      if (eventId && syncedDoer !== t.doerId) await clearPointers(taskId);
      return;
    }

    const ct = toCalendarTask(t);
    if (eventId && syncedDoer === t.doerId) {
      await updateEvent(tok, eventId, ct);
    } else {
      const newId = await createEvent(tok, ct);
      await db
        .update(tasks)
        .set({ googleEventId: newId, googleSyncedDoerId: t.doerId })
        .where(eq(tasks.id, taskId));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[google-sync] reconcile failed", taskId, err instanceof Error ? err.message : err);
  }
}

/** Delete a task's event — call BEFORE hard-deleting the row (which loses the
 *  pointers). Best-effort. */
export async function removeTaskEvent(t: {
  googleEventId: string | null;
  googleSyncedDoerId: string | null;
}): Promise<void> {
  if (!isGoogleConfigured() || !t.googleEventId || !t.googleSyncedDoerId) return;
  try {
    const tok = await doerToken(t.googleSyncedDoerId);
    if (tok) await deleteEvent(tok, t.googleEventId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[google-sync] remove failed", err instanceof Error ? err.message : err);
  }
}

async function doerToken(doerId: string): Promise<string | null> {
  const [e] = await db
    .select({ token: employees.googleRefreshToken })
    .from(employees)
    .where(eq(employees.id, doerId))
    .limit(1);
  return e?.token ?? null;
}

async function clearPointers(taskId: string): Promise<void> {
  await db
    .update(tasks)
    .set({ googleEventId: null, googleSyncedDoerId: null })
    .where(eq(tasks.id, taskId));
}

function toCalendarTask(t: typeof tasks.$inferSelect): CalendarTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    subject: t.subject,
    client: t.client,
    dueAt: t.dueAt,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    allDay: t.allDay,
    recurrenceRule: t.recurrenceRule,
  };
}
