"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, tasks } from "@/lib/db";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskStatus,
  type TaskPriority,
} from "@/db/enums";
import {
  CreateTaskSchema,
  type CreateTaskInput,
  EditTaskFieldsSchema,
  type EditTaskFieldsInput,
  ApproveSchema,
  type ApproveInput,
  type ApproveParsed,
  ReassignSchema,
  type ReassignInput,
  TransferExternalSchema,
  type TransferExternalInput,
  CancelSchema,
  type CancelInput,
  CommentSchema,
  type CommentInput,
  SetApprovalStatusSchema,
  type SetApprovalStatusInput,
  SetRevisedTargetDateSchema,
  type SetRevisedTargetDateInput,
} from "@/lib/validators/task";
import { taskEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  canEditTaskFields,
  canApprove,
  canReassign,
  canTransferExternal,
  canCancel,
  canComment,
} from "@/lib/auth/task-permissions";
import { canTransitionTo, type ActorRole } from "@/lib/auth/status-transitions";
import {
  EDITABLE_TASK_FIELDS,
  type EditableTaskField,
} from "@/lib/events";
import {
  notify,
  notifyManyForTask,
  dedupeRecipients,
} from "@/lib/notifications/dispatch";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { getStatusDisplayMap } from "@/lib/queries/status-display";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Optimistic-lock predicate that survives Postgres↔JS timestamp drift.
 *
 * Postgres stores `timestamptz` at microsecond precision; postgres.js parses
 * timestamps into JS Date (millisecond precision, sub-ms truncated) and
 * serializes Date parameters back via `.toISOString()` (also ms). So
 * `eq(tasks.updated_at, expectedDate)` fails for any row whose `updated_at`
 * was written by Postgres `now()` (defaultNow inserts, legacy imports, etc.) —
 * the stored `.123456` never equals the round-tripped `.123000`. Truncating
 * the stored column to milliseconds before comparing closes the gap without
 * needing to migrate every row or alter the column type.
 *
 * We pass the parameter as an ISO-8601 string with an explicit `::timestamptz`
 * cast because raw `Date` interpolation inside `sql\`\`` would call
 * `.toString()` ("Fri May 15 2026 12:43:38 GMT+0530") which Postgres cannot
 * parse — Drizzle only knows to call `.toISOString()` when the column type
 * is in scope, which it isn't inside an arbitrary SQL fragment.
 */
function optimisticLockMatches(expectedDate: Date) {
  return sql`date_trunc('milliseconds', ${tasks.updatedAt}) = ${expectedDate.toISOString()}::timestamptz`;
}

/**
 * Picks the user-facing label for a task in a notification subject line.
 * Falls back through subject → title → "a task" so we never render an
 * empty string in someone's inbox.
 */
function taskLabel(t: { subject: string | null; title: string }): string {
  const s = t.subject?.trim();
  if (s) return s;
  const ti = t.title?.trim();
  if (ti) return ti;
  return "a task";
}

function revalidateTaskRoutes(): void {
  revalidatePath("/tasks");
  revalidatePath("/archived");
  revalidatePath("/"); // dashboard counts change too
}

export async function archiveTask(taskId: string): Promise<void> {
  if (!isUuid(taskId)) return;
  const me = await requireUser();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(tasks)
      .set({ archived: true })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (updated.length === 0) return;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "archived",
      fromValue: null,
      toValue: null,
    });
  });
  revalidateTaskRoutes();
}

export async function unarchiveTask(taskId: string): Promise<void> {
  if (!isUuid(taskId)) return;
  const me = await requireUser();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(tasks)
      .set({ archived: false })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (updated.length === 0) return;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "restored",
      fromValue: null,
      toValue: null,
    });
  });
  revalidateTaskRoutes();
}

/**
 * Move the task to a new status.  Honours the transition matrix
 * (lib/auth/status-transitions.ts) — refuses transitions the actor's
 * role can't perform.  Writes a `status_changed` audit event with the
 * from + to values.  Optimistic-lock: caller passes the expected
 * updated_at so concurrent edits cleanly fail with "stale".
 */
export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
  expectedUpdatedAt: string,
  note?: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };
  if (!TASK_STATUSES.includes(status))
    return { ok: false, error: "invalid", message: "Unknown status" };

  const me = await requireUser();

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  // Compute role + check transition.
  const role: ActorRole = me.isAdmin
    ? "admin"
    : current.doerId === me.id
      ? "doer"
      : current.initiatorId === me.id
        ? "initiator"
        : current.createdById === me.id
          ? "creator"
          : "stranger";

  if (!canTransitionTo(current.status, status, role)) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({
      status,
      updatedAt: now,
      // If status moves to "done", stamp completedAt; if moving away from
      // done into rework, clear it.
      completedAt: status === "done" ? now : current.status === "done" ? null : current.completedAt,
    })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "status_changed",
    fromValue: { status: current.status },
    toValue: { status },
    note: note?.trim() || null,
  });

  // Fan-out: every other participant (creator/initiator/doer minus me).
  // Tier-3 fix — the notification body MUST be JSON meta so email/Slack/
  // WhatsApp templates can pluck `toStatus` + `fromStatus` and render the
  // real transition (the templates default `toStatus` to "done" which
  // made every status_changed email lie). Also resolve the new-status
  // human label server-side so the title never includes raw enum tokens
  // like "follow_up_2".
  const trimmedNote = note?.trim() || undefined;
  const statusDisplay = await getStatusDisplayMap();
  const newStatusLabel = statusDisplay[status]?.label ?? status;
  const label = taskLabel({ subject: current.subject, title: current.title });
  await notifyManyForTask(taskId, {
    actorId: me.id,
    kind: "status_changed",
    title: `${me.name} changed status on '${label}' to ${newStatusLabel}`,
    body: JSON.stringify({
      toStatus: status,
      fromStatus: current.status,
      ...(trimmedNote ? { note: trimmedNote } : {}),
    }),
    recipients: [current.createdById, current.initiatorId, current.doerId],
  });

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function setTaskPriority(
  taskId: string,
  priority: TaskPriority,
): Promise<void> {
  if (!isUuid(taskId)) return;
  if (!TASK_PRIORITIES.includes(priority)) return;
  const me = await requireUser();
  await db.transaction(async (tx) => {
    const current = await tx.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { id: true, priority: true },
    });
    if (!current) return;
    if (current.priority === priority) return; // no-op idempotency
    const updated = await tx
      .update(tasks)
      .set({ priority })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (updated.length === 0) return;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "priority_changed",
      fromValue: { priority: current.priority },
      toValue: { priority },
    });
  });
  revalidateTaskRoutes();
}

export async function reassignDoer(
  taskId: string,
  doerId: string,
): Promise<void> {
  if (!isUuid(taskId)) return;
  if (!isUuid(doerId)) return;
  const me = await requireUser();
  await db.transaction(async (tx) => {
    const current = await tx.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { id: true, doerId: true },
    });
    if (!current) return;
    if (current.doerId === doerId) return; // no-op idempotency
    const updated = await tx
      .update(tasks)
      .set({ doerId })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });
    if (updated.length === 0) return;
    await tx.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "reassigned",
      fromValue: { doerId: current.doerId },
      toValue: { doerId },
    });
  });
  revalidateTaskRoutes();
}

export async function createTask(input: CreateTaskInput): Promise<
  | { ok: true; id: string; ids: string[] }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  let parsed;
  try {
    parsed = CreateTaskSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: msg };
  }

  // Tier-3 fanout: normalise to an array so we always loop. Backward-compat
  // callers (existing tests + any legacy callsite) pass `doerId`; the new
  // form passes `doerIds`. The refine() rule guarantees exactly one is set.
  const doerIds = parsed.doerIds ?? (parsed.doerId ? [parsed.doerId] : []);
  if (doerIds.length === 0) {
    return { ok: false, error: "At least one doer is required" };
  }

  const createdIds: string[] = [];
  const label = taskLabel({
    subject: parsed.subject ?? null,
    title: parsed.title,
  });

  for (const doerId of doerIds) {
    // M4 — generate id client-side so short_id can be derived deterministically
    // from the same UUID.  UNIQUE constraint on tasks.short_id catches the
    // rare collision; retry with the next 10-char slice of the dashless UUID.
    const taskId = crypto.randomUUID();
    let attempt = 0;
    let row: { id: string } | undefined;
    while (attempt < 23) {
      const shortId =
        attempt === 0
          ? deriveShortId(taskId)
          : nextShortIdCandidate(taskId, attempt);
      if (!shortId) {
        return { ok: false, error: "Could not derive short_id (uuid exhausted)" };
      }
      try {
        [row] = await db
          .insert(tasks)
          .values({
            id: taskId,
            title: parsed.title,
            description: parsed.description,
            subject: parsed.subject,
            notes: parsed.notes,
            doerId,
            initiatorId: parsed.initiatorId,
            priority: parsed.priority,
            dueAt: parsed.dueAt,
            tags: parsed.tags ?? null,
            // Tier-4 — GCal-style scheduling fields. All null on a one-off
            // task; the form sends real values when the user opens the
            // Schedule section.
            startsAt: parsed.startsAt ?? null,
            endsAt: parsed.endsAt ?? null,
            allDay: parsed.allDay ?? false,
            recurrence: parsed.recurrence ?? null,
            createdById: me.id,
            shortId,
            // status defaults to "not_started"; archived defaults to false;
            // createdAt + updatedAt default to now().
          })
          .returning({ id: tasks.id });
        break;
      } catch (err: unknown) {
        const e = err as { code?: string; constraint?: string; message?: string };
        if (e?.code === "23505" && e?.constraint === "tasks_short_id_uidx") {
          attempt++;
          continue;
        }
        return { ok: false, error: `DB: ${e?.message ?? String(err)}` };
      }
    }

    if (!row) {
      return {
        ok: false,
        error:
          attempt >= 23
            ? "Could not allocate unique short_id after 23 attempts"
            : "Insert returned no row",
      };
    }

    await db.insert(taskEvents).values({
      taskId: row.id,
      actorId: me.id,
      eventType: "created",
      toValue: {
        title: parsed.title,
        doerId,
        initiatorId: parsed.initiatorId,
        priority: parsed.priority,
        dueAt: parsed.dueAt.toISOString(),
        tags: parsed.tags ?? null,
      },
    });

    // Fan-out: doer is now assigned; initiator is on the hook for review.
    // Both are explicit per-recipient kinds so emails can use distinct copy.
    if (doerId !== me.id) {
      await notify({
        userId: doerId,
        kind: "task_assigned",
        title: `${me.name} assigned you '${label}'`,
        taskId: row.id,
        actorId: me.id,
      });
    }
    if (parsed.initiatorId !== me.id && parsed.initiatorId !== doerId) {
      await notify({
        userId: parsed.initiatorId,
        kind: "task_initiated",
        title: `${me.name} made you initiator on '${label}'`,
        taskId: row.id,
        actorId: me.id,
      });
    }

    createdIds.push(row.id);
  }

  revalidateTaskRoutes();
  // `id` kept as a string for backward compat with single-doer callers.
  return { ok: true, id: createdIds[0]!, ids: createdIds };
}

/**
 * Edits the editable subset of fields on a task.
 *
 * Optimistic-concurrency: caller passes `expectedUpdatedAt`; if the
 * row's current `updated_at` differs, the update affects zero rows
 * and we return `{ ok: false, error: "stale" }`.  The caller should
 * reload the page.
 *
 * Permission: creator OR initiator (while pending) OR admin.
 * RLS is the canonical defense; we also guard in app code so the
 * user gets a sensible message instead of an opaque DB error.
 */
export async function editTaskFields(
  taskId: string,
  fields: EditTaskFieldsInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | { ok: false; error: "invalid" | "not-found" | "forbidden" | "stale"; message?: string }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed;
  try {
    parsed = EditTaskFieldsSchema.parse(fields);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canEditTaskFields({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  // Compute diff against current row.  Only changed fields go into the
  // update + audit rows.  zod has already trimmed strings and parsed
  // dueAt into a Date.
  const diff: Partial<Record<EditableTaskField, unknown>> = {};
  for (const field of EDITABLE_TASK_FIELDS) {
    if (!(field in parsed)) continue;
    const next = (parsed as Record<string, unknown>)[field];
    const prev = (current as Record<string, unknown>)[field];

    const a = next instanceof Date ? next.toISOString() : next;
    const b = prev instanceof Date ? prev.toISOString() : prev;
    if (a !== b) diff[field] = next;
  }

  if (Object.keys(diff).length === 0) {
    // No-op: nothing to update.  Treat as success.
    return { ok: true };
  }

  // Optimistic lock + bump updated_at in one statement.
  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({ ...(diff as Partial<typeof tasks.$inferInsert>), updatedAt: now })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    return { ok: false, error: "stale" };
  }

  // One audit row per changed field.
  for (const [field, value] of Object.entries(diff)) {
    const fromValue = (current as Record<string, unknown>)[field];
    await db.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "field_updated",
      fromValue: {
        field,
        value: fromValue instanceof Date ? fromValue.toISOString() : fromValue,
      },
      toValue: {
        field,
        value: value instanceof Date ? (value as Date).toISOString() : value,
      },
    });
  }

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Approve or decline a task that the doer has marked done.
 * - Permission: initiator OR admin, status must be "done".
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: writes approved_by_id, approved_at, approval_note +
 *   a `status_changed` task_events row.
 *
 * Note: M2.2 deliberately does NOT permit edits to an approval after the
 * fact (per spec "Edit audit rows (any) — — (no one)").  If the
 * initiator changes their mind, they decline the existing decision and
 * the doer reworks, producing a second `status_changed` row.
 */
export async function approveTask(
  taskId: string,
  input: ApproveInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed: ApproveParsed;
  try {
    parsed = ApproveSchema.parse(input) as ApproveParsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canApprove({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({
      status: parsed.decision, // "approved" | "not_approved"
      approvedById: me.id,
      approvedAt: now,
      approvalNote: parsed.note?.trim() || null,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "status_changed",
    fromValue: { status: current.status },
    toValue: { status: parsed.decision },
    note: parsed.note?.trim() || null,
  });

  // Fan-out: tell the doer the verdict.  Approve → "approved" kind,
  // decline → "declined" kind so the recipient's UI can colour each
  // distinctly and the email subject can differ.  Body is the note.
  const label = taskLabel({ subject: current.subject, title: current.title });
  if (current.doerId !== me.id) {
    if (parsed.decision === "approved") {
      await notify({
        userId: current.doerId,
        kind: "approved",
        title: `${me.name} approved '${label}'`,
        body: parsed.note?.trim() || null,
        taskId,
        actorId: me.id,
      });
    } else {
      await notify({
        userId: current.doerId,
        kind: "declined",
        title: `${me.name} declined '${label}'`,
        body: parsed.note?.trim() || null,
        taskId,
        actorId: me.id,
      });
    }
  }

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Reassign the doer.  Optionally resets status to not_started.
 * - Permission: doer OR initiator OR admin, and the task must be in the
 *   pending lane (the existing canReassign predicate enforces this).
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: sets transferred_from_id to the previous doer; writes
 *   a `reassigned` task_events row carrying from + to doer ids.  If
 *   resetStatus is set and the task isn't already not_started, also
 *   writes a `status_changed` row (since the matrix treats status
 *   changes and reassigns as distinct concerns).
 */
export async function reassignTask(
  taskId: string,
  input: ReassignInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed;
  try {
    parsed = ReassignSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canReassign({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  if (parsed.newDoerId === current.doerId) {
    // No-op: assigning to the same doer.
    return { ok: true };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const shouldReset =
    parsed.resetStatus === true && current.status !== "not_started";

  const updated = await db
    .update(tasks)
    .set({
      doerId: parsed.newDoerId,
      transferredFromId: current.doerId,
      updatedAt: now,
      ...(shouldReset ? { status: "not_started" as const } : {}),
    })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "reassigned",
    fromValue: { doerId: current.doerId },
    toValue: { doerId: parsed.newDoerId, resetStatus: shouldReset },
  });

  if (shouldReset) {
    await db.insert(taskEvents).values({
      taskId,
      actorId: me.id,
      eventType: "status_changed",
      fromValue: { status: current.status },
      toValue: { status: "not_started" },
    });
  }

  // Fan-out: new doer gets "to you"; old doer gets "away from you";
  // initiator (if distinct from both) gets a generic reassigned note.
  const label = taskLabel({ subject: current.subject, title: current.title });
  if (parsed.newDoerId !== me.id) {
    await notify({
      userId: parsed.newDoerId,
      kind: "reassigned",
      title: `${me.name} reassigned '${label}' to you`,
      taskId,
      actorId: me.id,
    });
  }
  if (current.doerId !== me.id && current.doerId !== parsed.newDoerId) {
    await notify({
      userId: current.doerId,
      kind: "reassigned",
      title: `${me.name} reassigned '${label}' away from you`,
      taskId,
      actorId: me.id,
    });
  }
  // Loop in the initiator so they know who owns the task now.
  const initiatorRecipients = dedupeRecipients(
    [current.initiatorId],
    me.id,
  ).filter((id) => id !== parsed.newDoerId && id !== current.doerId);
  for (const userId of initiatorRecipients) {
    await notify({
      userId,
      kind: "reassigned",
      title: `${me.name} reassigned '${label}'`,
      taskId,
      actorId: me.id,
    });
  }

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Move the task to "transferred" (work has left the system — handed
 * off to an external party).  A non-empty note is REQUIRED.
 * - Permission: initiator OR admin, status must be non-terminal.
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: writes a `transferred_external` task_events row carrying
 *   the note.
 */
export async function transferTaskExternal(
  taskId: string,
  input: TransferExternalInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed;
  try {
    parsed = TransferExternalSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canTransferExternal({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({ status: "transferred" as const, updatedAt: now })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "transferred_external",
    fromValue: { status: current.status },
    toValue: { status: "transferred" },
    note: parsed.note,
  });

  // Fan-out: every participant (creator/initiator/doer minus me).
  const label = taskLabel({ subject: current.subject, title: current.title });
  await notifyManyForTask(taskId, {
    actorId: me.id,
    kind: "transferred",
    title: `${me.name} transferred '${label}' externally`,
    body: parsed.note,
    recipients: [current.createdById, current.initiatorId, current.doerId],
  });

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Cancel the task — terminates without external transfer.
 * - Permission: initiator OR admin, status must be non-terminal.
 * - Optimistic-lock: caller passes expectedUpdatedAt.
 * - Side effect: writes a `status_changed` task_events row with optional
 *   note.  (Cancellation is treated as a status transition, not a separate
 *   event type, since the matrix already models it.)
 */
export async function cancelTask(
  taskId: string,
  input: CancelInput,
  expectedUpdatedAt: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden" | "stale";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed;
  try {
    parsed = CancelSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canCancel({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const expectedDate = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedDate.getTime())) {
    return { ok: false, error: "invalid", message: "Bad expectedUpdatedAt" };
  }

  const now = new Date();
  const updated = await db
    .update(tasks)
    .set({ status: "cancelled" as const, updatedAt: now })
    .where(and(eq(tasks.id, taskId), optimisticLockMatches(expectedDate)))
    .returning({ id: tasks.id });

  if (updated.length === 0) return { ok: false, error: "stale" };

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "status_changed",
    fromValue: { status: current.status },
    toValue: { status: "cancelled" },
    note: parsed.note?.trim() || null,
  });

  // Fan-out: every participant.
  const label = taskLabel({ subject: current.subject, title: current.title });
  await notifyManyForTask(taskId, {
    actorId: me.id,
    kind: "cancelled",
    title: `${me.name} cancelled '${label}'`,
    body: parsed.note?.trim() || null,
    recipients: [current.createdById, current.initiatorId, current.doerId],
  });

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Append a comment to the task's audit timeline.
 * - Permission: any task participant (creator/initiator/doer) or admin.
 * - No status change; no optimistic-lock against tasks (comments don't
 *   mutate the task row).  Always writes one `commented` task_events row
 *   with the body in `to_value.body` (jsonb stays flexible — future
 *   commit may include mention metadata).
 */
export async function addComment(
  taskId: string,
  input: CommentInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  if (!isUuid(taskId)) return { ok: false, error: "invalid", message: "Bad task id" };

  const me = await requireUser();

  let parsed;
  try {
    parsed = CommentSchema.parse(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid input";
    return { ok: false, error: "invalid", message: msg };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (
    !canComment({
      employee: { id: me.id, isAdmin: me.isAdmin },
      task: {
        createdById: current.createdById,
        initiatorId: current.initiatorId,
        doerId: current.doerId,
        status: current.status,
      },
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "commented",
    toValue: { body: parsed.body },
  });

  // Fan-out: every participant except me; body is the first 140 chars.
  const label = taskLabel({ subject: current.subject, title: current.title });
  const preview = parsed.body.length > 140 ? `${parsed.body.slice(0, 140)}…` : parsed.body;
  await notifyManyForTask(taskId, {
    actorId: me.id,
    kind: "commented",
    title: `${me.name} commented on '${label}'`,
    body: preview,
    recipients: [current.createdById, current.initiatorId, current.doerId],
  });

  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

// ───────────────────────────── Tier-3 admin-only ─────────────────────────
//
// approval_status + revised_target_date are admin-only columns added in
// migration 0019. They sit alongside the existing status column rather
// than reusing it, so the doer's "status" lifecycle stays independent
// from the initiator/admin's verdict (approved | not_approved | …).

/**
 * Set or clear `approval_status` on a task. Admin-only.
 * Pass `approvalStatus: null` to clear a previous verdict.
 */
export async function setTaskApprovalStatus(
  taskId: string,
  input: SetApprovalStatusInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  if (!isUuid(taskId)) {
    return { ok: false, error: "invalid", message: "Bad task id" };
  }
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "forbidden" };

  let parsed;
  try {
    parsed = SetApprovalStatusSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error: "invalid",
      message: err instanceof Error ? err.message : "Invalid input",
    };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  if (current.approvalStatus === parsed.approvalStatus) {
    return { ok: true }; // no-op
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({ approvalStatus: parsed.approvalStatus, updatedAt: now })
    .where(eq(tasks.id, taskId));

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "field_updated",
    fromValue: { field: "approvalStatus", value: current.approvalStatus },
    toValue: {
      field: "approvalStatus",
      value: parsed.approvalStatus,
      ...(parsed.note ? { note: parsed.note } : {}),
    },
  });

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * Set or clear `revised_target_date` on a task. Admin-only.
 * The original `due_at` is never modified — admins set the revised
 * target alongside it so the original commitment stays auditable.
 */
export async function setTaskRevisedTargetDate(
  taskId: string,
  input: SetRevisedTargetDateInput,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "not-found" | "forbidden";
      message?: string;
    }
> {
  if (!isUuid(taskId)) {
    return { ok: false, error: "invalid", message: "Bad task id" };
  }
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "forbidden" };

  let parsed;
  try {
    parsed = SetRevisedTargetDateSchema.parse(input);
  } catch (err) {
    return {
      ok: false,
      error: "invalid",
      message: err instanceof Error ? err.message : "Invalid input",
    };
  }

  const current = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });
  if (!current) return { ok: false, error: "not-found" };

  const prevIso = current.revisedTargetDate?.toISOString() ?? null;
  const nextIso = parsed.revisedTargetDate?.toISOString() ?? null;
  if (prevIso === nextIso) {
    return { ok: true }; // no-op
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({ revisedTargetDate: parsed.revisedTargetDate, updatedAt: now })
    .where(eq(tasks.id, taskId));

  await db.insert(taskEvents).values({
    taskId,
    actorId: me.id,
    eventType: "field_updated",
    fromValue: { field: "revisedTargetDate", value: prevIso },
    toValue: { field: "revisedTargetDate", value: nextIso },
  });

  revalidateTaskRoutes();
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
