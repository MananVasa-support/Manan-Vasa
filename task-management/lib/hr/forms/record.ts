import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getHrForm } from "./registry";
import {
  hrFormSubmissions,
  type HrFormResponse,
  type HrFormStatus,
} from "./schema";

/**
 * Record (or update) a form's index row. This is the ONE write path into
 * `hr_form_submissions` — every form that wants to appear in My/All Filled Forms
 * calls this from its own save action, right after it has written its own table.
 *
 * ORDERING MATTERS, and it is the caller's job: write your own table FIRST, then
 * call this. The owning table stays the source of truth, so if the index write
 * fails the form is still saved — the row just hasn't been indexed yet, which a
 * later save repairs. Doing it the other way round would let the index advertise
 * a submission that was never stored.
 *
 * Idempotent per (formKey, employeeId, sourceId): re-saving a form updates its
 * existing row instead of stacking duplicates, matching the create-or-update
 * behaviour the source forms already have. That's enforced by a partial unique
 * index in migration 0181 as well as the lookup here.
 */
export async function recordHrFormSubmission(input: {
  formKey: string;
  /** WHOSE form this is — the subject, not necessarily the person filling it. */
  employeeId: string;
  /** WHO is filling it (the signed-in user). */
  submittedById: string;
  /** `draft` for Save Draft, `submitted` for Submit. */
  status: HrFormStatus;
  /** The completed responses, already flattened to question/answer pairs. */
  responses: HrFormResponse[];
  /** The row id in the form's OWN table, so the index can point back at it. */
  sourceId?: string | null;
}): Promise<
  | {
      ok: true;
      id: string;
      /**
       * TRUE only on the transition into `submitted` — a fresh submit, or a
       * draft that has just been submitted. Re-saving an already-submitted form
       * returns FALSE.
       *
       * This exists so callers can fire submit-time side effects (mailing HR the
       * completed PDF) exactly once. Keying off the caller's own `status` would
       * re-send on every subsequent HR edit, because those come through as
       * `status: "submitted"` too. Only this function can tell the difference —
       * it is the one that read the prior row.
       */
      newlySubmitted: boolean;
    }
  | { ok: false; error: string }
> {
  const def = getHrForm(input.formKey);
  if (!def) return { ok: false, error: `Unknown form "${input.formKey}".` };

  // Only a real submit stamps the time. Re-saving a submitted form as a draft
  // must not resurrect it as unsubmitted, so the stamp is written once and the
  // status never walks backwards (see the update below).
  const now = new Date();
  const submittedAt = input.status === "submitted" ? now : null;

  try {
    const existing = input.sourceId
      ? await db
          .select({ id: hrFormSubmissions.id, status: hrFormSubmissions.status })
          .from(hrFormSubmissions)
          .where(
            and(
              eq(hrFormSubmissions.formKey, input.formKey),
              eq(hrFormSubmissions.employeeId, input.employeeId),
              eq(hrFormSubmissions.sourceId, input.sourceId),
            ),
          )
          .limit(1)
      : [];

    const prior = existing[0];
    if (prior) {
      const becameSubmitted =
        prior.status !== "submitted" && input.status === "submitted";
      // A form that has already been submitted stays submitted: an HR edit
      // afterwards updates the responses without demoting the row back to a
      // draft and yanking it out of the employee's Submitted list.
      const nextStatus: HrFormStatus =
        prior.status === "submitted" ? "submitted" : input.status;
      await db
        .update(hrFormSubmissions)
        .set({
          formName: def.name,
          section: def.section,
          submittedById: input.submittedById,
          status: nextStatus,
          responses: input.responses,
          sourceTable: def.sourceTable,
          updatedAt: now,
          // Stamp on the transition into submitted; leave an existing stamp be.
          ...(prior.status !== "submitted" && nextStatus === "submitted"
            ? { submittedAt: now }
            : {}),
        })
        .where(eq(hrFormSubmissions.id, prior.id));
      return { ok: true, id: prior.id, newlySubmitted: becameSubmitted };
    }

    const [row] = await db
      .insert(hrFormSubmissions)
      .values({
        formKey: def.key,
        formName: def.name,
        section: def.section,
        employeeId: input.employeeId,
        submittedById: input.submittedById,
        status: input.status,
        responses: input.responses,
        sourceTable: def.sourceTable,
        sourceId: input.sourceId ?? null,
        submittedAt,
      })
      .returning({ id: hrFormSubmissions.id });

    if (!row) return { ok: false, error: "Could not record the submission." };
    return { ok: true, id: row.id, newlySubmitted: input.status === "submitted" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not record the submission.",
    };
  }
}
