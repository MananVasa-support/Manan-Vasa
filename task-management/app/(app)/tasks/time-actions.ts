"use server";

/**
 * Task Time Intelligence — Server Actions. Thin transport wrappers around the
 * shared engine (lib/tasks/time/engine.ts): auth + rate-limit + cache
 * revalidation. The rules, event log, session ledger and rollup all live in the
 * engine so the web + (future) mobile clients never diverge.
 */
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { timeIntelEnabled } from "@/lib/tasks/time/flags";
import {
  startWork,
  pauseWork,
  markDone,
  decideApproval,
} from "@/lib/tasks/time/engine";
import type { TimeResult, ApprovalVerdict } from "@/lib/tasks/time/types";

const OFF: TimeResult = { ok: false, error: "invalid", message: "Time tracking is disabled." };

function revalidate(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/tasks/time");
}

export async function startWorkAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await startWork({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function pauseWorkAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await pauseWork({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function markDoneAction(taskId: string): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await markDone({ id: me.id, name: me.name, isAdmin: me.isAdmin }, taskId);
  if (res.ok) revalidate(taskId);
  return res;
}

export async function decideApprovalAction(
  taskId: string,
  verdict: ApprovalVerdict,
  comment?: string,
): Promise<TimeResult> {
  if (!timeIntelEnabled()) return OFF;
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: "invalid", message: limited.error };
  const res = await decideApproval(
    { id: me.id, name: me.name, isAdmin: me.isAdmin },
    taskId,
    verdict,
    comment,
  );
  if (res.ok) revalidate(taskId);
  return res;
}
