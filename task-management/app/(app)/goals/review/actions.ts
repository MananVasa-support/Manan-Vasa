"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, goalReviews } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadWritableGoalRow, loadManageableGoalRow } from "@/lib/goals/scope";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateReview(periodKey?: string | null) {
  revalidatePath("/goals/review");
  revalidatePath("/goals/cascade");
  if (periodKey) revalidatePath(`/goals/cascade/${periodKey}`);
}

/* ------------------------------------------------------------------ */
/* Manager review — accept % + notes (dual-rating)                     */
/* ------------------------------------------------------------------ */

const ReviewSchema = z.object({
  id: z.string().uuid(),
  acceptPct: z.number().int().min(0).max(100).nullable(),
  reviewNotes: z.string().max(4000).nullish(),
});

export async function reviewGoal(
  input: z.infer<typeof ReviewSchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  // Reviewing someone else's goal requires manager/admin authority over them.
  const loaded = await loadManageableGoalRow(d.id, {
    id: me.id,
    isAdmin,
    email: me.email,
  });
  if (!loaded.ok) return loaded;
  const row = loaded.row;

  await db
    .update(goals)
    .set({
      acceptPct: d.acceptPct,
      reviewNotes: d.reviewNotes ?? null,
      reviewedById: me.id,
      reviewedAt: new Date(),
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, d.id));

  // Append an audit trail row (primary state stays on the goal).
  await db.insert(goalReviews).values({
    goalId: d.id,
    period: row.period,
    selfPct: row.pctDone,
    managerPct: d.acceptPct,
    reviewerId: me.id,
    note: d.reviewNotes ?? null,
    evidenceUrl: row.evidenceUrl,
  });

  revalidateReview(row.periodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Evidence upload — owner (or manager) attaches a file/link           */
/* ------------------------------------------------------------------ */

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
// Block script-y / inline-renderable types that could run from the storage host.
const BLOCKED_EXT = /\.(html?|htm|svg|xht|xhtml|js|mjs|exe|bat|cmd|sh|com|scr)$/i;

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "evidence";
}

/**
 * Attach evidence to a cascade goal. Accepts EITHER an uploaded file (stored in
 * the private `documents` bucket, path saved in `evidence_url`) OR a pasted URL.
 * Owners and managers may attach; the review page resolves storage paths into
 * short-lived signed URLs on read.
 */
export async function uploadGoalEvidence(form: FormData): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const id = String(form.get("goalId") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid goal" };

  const loaded = await loadWritableGoalRow(id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const link = String(form.get("link") ?? "").trim();
  const file = form.get("file");

  let evidenceUrl: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, error: "File exceeds 25 MB." };
    if (BLOCKED_EXT.test(file.name)) return { ok: false, error: "That file type isn't allowed." };
    const path = `goals/evidence/${loaded.row.employeeId}/${crypto.randomUUID()}/${safeName(file.name)}`;
    const admin = getSupabaseAdmin();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
    evidenceUrl = `bucket:${path}`;
  } else if (link) {
    evidenceUrl = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  } else {
    return { ok: false, error: "Pick a file or paste a link." };
  }

  await db
    .update(goals)
    .set({ evidenceUrl, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, id));
  revalidateReview(loaded.row.periodKey);
  return { ok: true };
}
