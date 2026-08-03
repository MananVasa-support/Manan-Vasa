"use server";

/**
 * Server Actions for the per-task Checklist. Every mutation is authed +
 * rate-limited and revalidates the owning task's detail page so the server
 * component re-reads the list.
 */
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { taskChecklistItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

const MAX_LABEL = 300;

/** Append a checklist item to a task (next sort order). */
export async function addChecklistItem(taskId: string, label: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a checklist item." };
  if (clean.length > MAX_LABEL) return { ok: false, error: `Keep it under ${MAX_LABEL} characters.` };
  if (!taskId) return { ok: false, error: "Missing task." };

  const [last] = await db
    .select({ sortOrder: taskChecklistItems.sortOrder })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(desc(taskChecklistItems.sortOrder))
    .limit(1);
  const nextOrder = (last?.sortOrder ?? -1) + 1;

  await db.insert(taskChecklistItems).values({
    taskId,
    label: clean,
    sortOrder: nextOrder,
    createdById: me.id,
  });

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Toggle an item's done state, stamping/clearing doneAt + doneById. */
export async function toggleChecklistItem(itemId: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId, done: taskChecklistItems.done })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  const nextDone = !item.done;
  await db
    .update(taskChecklistItems)
    .set({
      done: nextDone,
      doneAt: nextDone ? new Date() : null,
      doneById: nextDone ? me.id : null,
    })
    .where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

/** Rename an item's label. */
export async function renameChecklistItem(itemId: string, label: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = label.trim();
  if (!clean) return { ok: false, error: "Enter a checklist item." };
  if (clean.length > MAX_LABEL) return { ok: false, error: `Keep it under ${MAX_LABEL} characters.` };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  await db
    .update(taskChecklistItems)
    .set({ label: clean })
    .where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}

/** Delete an item. */
export async function deleteChecklistItem(itemId: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const [item] = await db
    .select({ taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "Item not found." };

  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId));

  revalidatePath(`/tasks/${item.taskId}`);
  return { ok: true };
}
