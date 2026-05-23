"use server";

import { revalidatePath } from "next/cache";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  departments,
  employeeEvents,
  employees,
  notifications,
  settingsEvents,
  taskEvents,
  tasks,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  InviteEmployeeSchema,
  EditEmployeeSchema,
  EmployeeIdSchema,
  type InviteEmployeeInput,
  type EditEmployeeInput,
} from "@/lib/validators/employee";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { sendInviteEmail } from "@/lib/email/resend";

/** Resolve the public site URL exactly once. Falls back to the prod
 *  Vercel host so a missing `NEXT_PUBLIC_SITE_URL` in dev doesn't yield
 *  `"undefined/welcome"` (which Firebase would reject). */
function requireSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  return "https://altus-corp-dashboard.vercel.app";
}

/** Run an async function up to `tries` times with linear backoff. Throws
 *  the last error if all attempts fail. */
async function retry<T>(
  fn: () => Promise<T>,
  { tries, delayMs }: { tries: number; delayMs: number },
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/** Map common firebase-admin auth errors to admin-friendly copy. Returns
 *  null when the error code is unrecognised so the caller can fall back
 *  to the raw message. */
function translateFirebaseAdminError(err: unknown): string | null {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "auth/email-already-exists":
      return "An account already exists with this email in Firebase. Reach out so I can clean up the orphan and retry.";
    case "auth/invalid-email":
      return "That email isn't in a format Firebase accepts.";
    case "auth/user-disabled":
      return "This Firebase account is disabled — reactivate it before inviting again.";
    case "auth/user-not-found":
      return "Firebase doesn't have an account for this email yet.";
    case "auth/insufficient-permission":
      return "The Firebase service account is missing the permissions needed to create users. Check FIREBASE_CLIENT_EMAIL's IAM role.";
    case "auth/internal-error":
      return "Firebase had an internal error. Retry in a few seconds.";
    default:
      return null;
  }
}

/**
 * Look up a department row by name (case-insensitive, trimmed). Returns
 * the row if found, or null if the input is empty / unmatched. Used by
 * employee invite/edit actions to keep `employees.department_id` in
 * sync with the legacy `employees.department` text column.
 */
async function resolveDepartmentByName(
  raw: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const [row] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(sql`lower(${departments.name}) = lower(${trimmed})`)
    .limit(1);
  return row ?? null;
}

export async function inviteEmployee(input: InviteEmployeeInput): Promise<{
  ok: boolean;
  id?: string;
  /** Set when the row + Firebase user were created OK but the invite email
   *  failed to send. The admin can re-send from the row's overflow menu. */
  warning?: string;
  error?: string;
}> {
  const me = await requireAdmin();

  const parsed = InviteEmployeeSchema.parse(input);

  // Case-insensitive dup check — historical imports may have mixed-case
  // emails even though new ones are normalized by Zod.
  const existing = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${parsed.email}`,
  });
  if (existing) {
    return { ok: false, error: "An employee with this email already exists." };
  }

  // 1. Create Firebase user
  const auth = getFirebaseAdminAuth();
  let fbUid: string;
  try {
    const fbUser = await auth.createUser({
      email: parsed.email,
      emailVerified: false,
      disabled: false,
    });
    fbUid = fbUser.uid;
  } catch (err: any) {
    return {
      ok: false,
      error: translateFirebaseAdminError(err) ?? `Firebase: ${err.message ?? err}`,
    };
  }

  // 2. Set the custom claim required by Supabase Third-Party Auth. Retry
  //    a few times with backoff before giving up — the original "the
  //    Cloud Function will retry" assumption was wrong (no such function
  //    exists in this repo) and a silent failure here locks the user out
  //    of RLS-protected reads.
  try {
    await retry(
      () => auth.setCustomUserClaims(fbUid, { role: "authenticated" }),
      { tries: 3, delayMs: 250 },
    );
  } catch (err) {
    console.error(
      `[inviteEmployee] setCustomUserClaims failed for ${fbUid} — continuing without role claim`,
      err,
    );
  }

  // Resolve the matching department FK (case-insensitive) so the new
  // canonical column stays in lock-step with the legacy text column.
  const matchedDept = await resolveDepartmentByName(parsed.department);
  const departmentText = matchedDept
    ? matchedDept.name
    : parsed.department && parsed.department.trim() !== ""
      ? parsed.department.trim()
      : null;

  // 3. Insert employees row
  let inserted;
  try {
    [inserted] = await db.insert(employees).values({
      name:         parsed.name,
      email:        parsed.email,
      role:         parsed.role,
      department:   departmentText,
      departmentId: matchedDept?.id ?? null,
      isAdmin:      parsed.isAdmin,
      firebaseUid:  fbUid,
      invitedAt:    new Date(),
    }).returning();
  } catch (err: any) {
    // Roll back the Firebase user since the DB write failed
    await auth.deleteUser(fbUid).catch(() => {});
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }
  if (!inserted) {
    await auth.deleteUser(fbUid).catch(() => {});
    return { ok: false, error: "DB: insert returned no row" };
  }

  // 4. Generate the password-reset (invite) link and email it. We DON'T
  //    roll back the row + Firebase user if the email fails — the admin
  //    can re-send from the row's overflow menu. But we DO surface the
  //    failure to the caller via `warning` so they know to retry.
  let emailWarning: string | undefined;
  try {
    const link = await auth.generatePasswordResetLink(parsed.email, {
      url: `${requireSiteUrl()}/welcome?intent=invite`,
    });
    const { error: sendError } = await sendInviteEmail({
      email:       parsed.email,
      inviteeName: parsed.name,
      inviterName: me.name,
      inviteLink:  link,
    });
    if (sendError) {
      emailWarning = `Created the account but the invite email failed: ${sendError}. Use "Resend invite" to retry.`;
      console.error("[inviteEmployee] sendInviteEmail returned error", sendError);
    }
  } catch (err: any) {
    emailWarning = `Created the account but couldn't generate the invite link: ${err?.message ?? err}. Use "Resend invite" to retry.`;
    console.error("[inviteEmployee] generatePasswordResetLink/sendInviteEmail threw", err);
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: inserted.id,
      actorId: me.id,
      eventType: "invited",
      toValue: {
        name: inserted.name,
        email: inserted.email,
        role: inserted.role,
        department: inserted.department,
        isAdmin: inserted.isAdmin,
      },
    });
  } catch (err) {
    console.error("[inviteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true, id: inserted.id, warning: emailWarning };
}

export async function editEmployee(
  employeeId: string,
  fields: EditEmployeeInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();

  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }

  const parsed = EditEmployeeSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Self-demote guard — an admin can't strip their own admin role here.
  // (We don't block other field edits on self; just the role flag.)
  if (
    parsedId.data === me.id &&
    parsed.data.isAdmin === false
  ) {
    return { ok: false, error: "Can't remove your own admin role." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found" };

  // Build the patch — only include keys that were actually supplied.
  // (Zod's `.optional()` leaves omitted keys absent, so we can safely spread.)
  const patch: Partial<typeof employees.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.department !== undefined) {
    // Treat empty string as null for the nullable column.  Resolve to
    // a department FK if the name matches; otherwise keep the text but
    // clear the FK so we don't keep a stale id.
    const d = parsed.data.department;
    if (d === null || d === "" || d === undefined) {
      patch.department = null;
      patch.departmentId = null;
    } else {
      const matched = await resolveDepartmentByName(d);
      patch.department = matched ? matched.name : d.trim();
      patch.departmentId = matched?.id ?? null;
    }
  }
  if (parsed.data.isAdmin !== undefined) patch.isAdmin = parsed.data.isAdmin;

  // M4 — multi-channel fields.  WhatsApp phone is normalised to null
  // when empty/null; other flags are passed through verbatim.
  if (parsed.data.whatsappPhone !== undefined) {
    const v = parsed.data.whatsappPhone;
    patch.whatsappPhone = v === null || v === "" ? null : v;
  }
  if (parsed.data.whatsappOptedIn !== undefined) {
    patch.whatsappOptedIn = parsed.data.whatsappOptedIn;
  }
  if (parsed.data.emailOptIn !== undefined) {
    patch.emailOptIn = parsed.data.emailOptIn;
  }
  if (parsed.data.slackOptIn !== undefined) {
    patch.slackOptIn = parsed.data.slackOptIn;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes to save." };
  }

  try {
    await db.update(employees).set(patch).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  // NOTE: we deliberately do NOT touch Firebase custom claims when isAdmin
  // changes. The app derives admin status from the employees row, so the
  // claim is incidental — set once on user creation, not on role flips.

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      const next = patch[key];
      const prev = (emp as Record<string, unknown>)[key as string];
      if (prev !== next) {
        fromValue[key as string] = prev ?? null;
        toValue[key as string] = next ?? null;
      }
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId: me.id,
        eventType: "edited",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[editEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}

/**
 * Generate the Firebase password-reset link for an existing employee
 * and return it so the admin can ship it manually (DM / WhatsApp /
 * paste-into-an-email-they-control). This is the bypass for when
 * Resend is down or the recipient's domain isn't on Resend's verified
 * sender list yet.
 *
 * Does NOT touch the employees row, does NOT log an audit event — it's
 * a read-only credential-handoff. Admin-only. Returns the link as a
 * raw string so the client can drop it on the clipboard.
 */
export async function getInviteLink(
  employeeId: string,
): Promise<{ ok: boolean; link?: string; error?: string }> {
  await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: parsedId.error.issues[0]?.message ?? "Invalid employee id",
    };
  }
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found." };
  if (!emp.isActive) {
    return { ok: false, error: "Employee is deactivated — reactivate first." };
  }
  if (!emp.firebaseUid) {
    return {
      ok: false,
      error: "This employee has no Firebase account yet — contact support.",
    };
  }
  try {
    const link = await getFirebaseAdminAuth().generatePasswordResetLink(
      emp.email,
      { url: `${requireSiteUrl()}/welcome?intent=invite` },
    );
    return { ok: true, link };
  } catch (err: any) {
    return {
      ok: false,
      error:
        translateFirebaseAdminError(err) ??
        (err?.message ?? String(err)),
    };
  }
}

export async function resendInvite(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.joinedAt !== null) return { ok: false, error: "Employee has already joined." };
  try {
    const link = await getFirebaseAdminAuth().generatePasswordResetLink(emp.email, {
      url: `${requireSiteUrl()}/welcome?intent=invite`,
    });
    const { error } = await sendInviteEmail({
      email:       emp.email,
      inviteeName: emp.name,
      inviterName: me.name,
      inviteLink:  link,
    });
    if (error) return { ok: false, error };
  } catch (err: any) {
    return { ok: false, error: translateFirebaseAdminError(err) ?? (err.message ?? String(err)) };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "invite_resent",
    });
  } catch (err) {
    console.error("[resendInvite] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function deactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (!emp.isActive) return { ok: false, error: "Employee is already deactivated." };

  try {
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { disabled: true });
    } catch (err: any) {
      // Roll back the DB update so the two systems stay in sync.
      await db
        .update(employees)
        .set({ isActive: true })
        .where(eq(employees.id, emp.id))
        .catch(() => {});
      return { ok: false, error: `Firebase: ${err.message ?? err}` };
    }
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "deactivated",
      fromValue: { isActive: true },
      toValue: { isActive: false },
    });
  } catch (err) {
    console.error("[deactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function reactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.isActive) return { ok: false, error: "Employee is already active." };

  try {
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { disabled: false });
    } catch (err: any) {
      await db
        .update(employees)
        .set({ isActive: false })
        .where(eq(employees.id, emp.id))
        .catch(() => {});
      return { ok: false, error: `Firebase: ${err.message ?? err}` };
    }
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "reactivated",
      fromValue: { isActive: false },
      toValue: { isActive: true },
    });
  } catch (err) {
    console.error("[reactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hard delete (admin power tool)
//
// Permanently removes the employees row, the Firebase user, and every row
// that referenced them as doer/initiator/creator/actor. Audit history about
// those tasks is destroyed by design — this is the GDPR right-to-erasure
// shape, NOT the deactivate flow. The deletion itself is logged to
// settings_events under the *deleting admin's* actor_id so the act of
// erasure is preserved even though the erased identity is gone.
//
// Order matters because the schema's RESTRICT FKs block several paths:
//   1. settings_events.actor_id  (RESTRICT)
//   2. employee_events.actor_id  (RESTRICT — employee_id cascades from step 5)
//   3. task_events.actor_id      (RESTRICT — task_id cascades from step 4)
//   4. tasks owned by them       (RESTRICT chain on doer / initiator / created_by)
//   5. employees row             (cascades notifications, push_subs, their own
//                                  lifecycle employee_events)
//   6. Firebase user
// ---------------------------------------------------------------------------

export interface EmployeeDeletionImpact {
  ok: boolean;
  error?: string;
  /** Tasks where this employee is doer / initiator / creator — all deleted. */
  tasks: number;
  /** task_events authored by this employee — deleted. */
  taskEventsAsActor: number;
  /** employee_events lifecycle entries ABOUT them — cascaded. */
  employeeEventsAboutThem: number;
  /** employee_events authored by them — deleted. */
  employeeEventsAsActor: number;
  /** settings_events authored by them — deleted. */
  settingsEventsAsActor: number;
  /** Their own inbox notifications — cascaded. */
  notifications: number;
}

/**
 * Counts what `deleteEmployee` would destroy. Admin-only. Pure read; no
 * mutations. Use this to populate the confirmation dialog before the
 * destructive call lands.
 */
export async function getEmployeeDeletionImpact(
  employeeId: string,
): Promise<EmployeeDeletionImpact> {
  await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: parsedId.error.issues[0]?.message ?? "Invalid employee id",
      tasks: 0,
      taskEventsAsActor: 0,
      employeeEventsAboutThem: 0,
      employeeEventsAsActor: 0,
      settingsEventsAsActor: 0,
      notifications: 0,
    };
  }
  const id = parsedId.data;

  const [[t], [te], [eeAbout], [eeActor], [se], [n]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        or(
          eq(tasks.doerId, id),
          eq(tasks.initiatorId, id),
          eq(tasks.createdById, id),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskEvents)
      .where(eq(taskEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.employeeId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(settingsEvents)
      .where(eq(settingsEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.userId, id)),
  ]);

  return {
    ok: true,
    tasks: Number(t?.n ?? 0),
    taskEventsAsActor: Number(te?.n ?? 0),
    employeeEventsAboutThem: Number(eeAbout?.n ?? 0),
    employeeEventsAsActor: Number(eeActor?.n ?? 0),
    settingsEventsAsActor: Number(se?.n ?? 0),
    notifications: Number(n?.n ?? 0),
  };
}

/**
 * Hard-delete an employee and every row that depended on them. Requires the
 * admin to pass `confirmationEmail` exactly equal to the target's email —
 * client-side belt + server-side suspenders for "I really mean it".
 *
 * Returns the destruction counts on success so the caller can surface a
 * confirmation toast ("Deleted Hetesh — 12 tasks, 47 events").
 */
export async function deleteEmployee(
  employeeId: string,
  confirmationEmail: string,
): Promise<{
  ok: boolean;
  error?: string;
  deleted?: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };
}> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't delete your own account." };
  }
  const id = parsedId.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) return { ok: false, error: "Employee not found." };

  if (
    typeof confirmationEmail !== "string" ||
    confirmationEmail.trim().toLowerCase() !== emp.email.toLowerCase()
  ) {
    return { ok: false, error: "Confirmation email does not match." };
  }

  // Snapshot identity BEFORE we wipe the row so we can audit the deletion.
  const snapshot = {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role,
    department: emp.department,
    firebaseUid: emp.firebaseUid,
  };

  let counts: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };

  try {
    counts = await db.transaction(async (tx) => {
      // 1. settings_events authored by them — RESTRICT, must precede employees.
      const seDeleted = await tx
        .delete(settingsEvents)
        .where(eq(settingsEvents.actorId, id))
        .returning({ id: settingsEvents.id });

      // 2. employee_events where they're the actor — RESTRICT. The lifecycle
      //    entries ABOUT them (employee_id = id) cascade with step 5.
      const eeDeleted = await tx
        .delete(employeeEvents)
        .where(eq(employeeEvents.actorId, id))
        .returning({ id: employeeEvents.id });

      // 3. task_events authored by them — RESTRICT. Events tied to tasks we
      //    delete in step 4 cascade automatically (task_events.task_id is
      //    ON DELETE CASCADE), so this only catches events on OTHER tasks.
      const teDeleted = await tx
        .delete(taskEvents)
        .where(eq(taskEvents.actorId, id))
        .returning({ id: taskEvents.id });

      // 4. tasks owned by them (RESTRICT chain) — cascades their remaining
      //    task_events and notifications-with-this-task_id.
      const tDeleted = await tx
        .delete(tasks)
        .where(
          or(
            eq(tasks.doerId, id),
            eq(tasks.initiatorId, id),
            eq(tasks.createdById, id),
          ),
        )
        .returning({ id: tasks.id });

      // 5. The employees row itself. Cascades:
      //    - notifications WHERE user_id = id  (their inbox)
      //    - push_subscriptions WHERE user_id = id
      //    - employee_events WHERE employee_id = id  (lifecycle about-them)
      await tx.delete(employees).where(eq(employees.id, id));

      return {
        tasks: tDeleted.length,
        taskEvents: teDeleted.length,
        employeeEvents: eeDeleted.length,
        settingsEvents: seDeleted.length,
      };
    });
  } catch (err: any) {
    return { ok: false, error: `DB: ${err?.message ?? err}` };
  }

  // 6. Firebase user. Best-effort — the DB is already consistent, so a
  //    Firebase failure leaves at most an orphan disabled account.
  if (snapshot.firebaseUid) {
    try {
      await getFirebaseAdminAuth().deleteUser(snapshot.firebaseUid);
    } catch (err) {
      console.warn(
        `[deleteEmployee] firebase deleteUser(${snapshot.firebaseUid}) failed — clean up manually`,
        err,
      );
    }
  }

  // 7. Audit the erasure itself under the deleting admin's actor_id. Scoped
  //    to "employees" + the deleted id so /admin/activity can surface it
  //    alongside other employee-scoped events.
  try {
    await db.insert(settingsEvents).values({
      scope: "employees",
      targetId: snapshot.id,
      actorId: me.id,
      eventType: "employee_deleted",
      fromValue: snapshot,
      toValue: counts,
    });
  } catch (err) {
    console.error("[deleteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  return { ok: true, deleted: counts };
}
