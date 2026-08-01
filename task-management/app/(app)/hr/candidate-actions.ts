"use server";

import { randomUUID } from "node:crypto";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { candidateIntake, interviewPositions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { ALL_CRITERION_IDS } from "@/lib/hr/candidate/evaluation-checklist";
import { intakeProgress } from "@/lib/hr/candidate/intake-schema";
import { sendRecruiterIntakeEmail } from "@/lib/email/hr-recruiter-email";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const CANDIDATE_STATUSES = ["new", "shortlisted", "rejected", "hired"] as const;

const DraftSchema = z.object({
  id: z.string().uuid().optional(),
  values: z.record(z.string(), z.string()).default({}),
  instances: z.record(z.string(), z.array(z.string())).default({}),
  photoPath: z.string().max(400).optional(),
  signaturePath: z.string().max(400).optional(),
});

/**
 * AUTOSAVE — create-or-update the candidate's draft row. Never touches
 * submitted_at (editing a completed record keeps it complete). Returns the id so
 * the wizard can keep saving to the same row.
 */
export async function saveCandidateDraft(input: z.input<typeof DraftSchema>): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid draft." };
  const v = parsed.data;
  const values = v.values;

  const payload = {
    fullName: (values["personal.fullName"] ?? "").slice(0, 200),
    positionApplied: values["personal.position"] || null,
    mobile: values["personal.mobile"] || null,
    email: values["personal.email"] || null,
    data: values as Record<string, unknown>,
    instances: v.instances as Record<string, unknown>,
    photoPath: v.photoPath ?? null,
    signaturePath: v.signaturePath ?? null,
    updatedAt: new Date(),
  };

  try {
    if (v.id) {
      await db.update(candidateIntake).set(payload).where(eq(candidateIntake.id, v.id));
      revalidatePath("/hr/candidates");
      return { ok: true, id: v.id };
    }
    const [row] = await db
      .insert(candidateIntake)
      .values({ ...payload, createdById: me.id })
      .returning({ id: candidateIntake.id });
    if (!row) return { ok: false, error: "Could not save the candidate." };
    revalidatePath("/hr/candidates");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/** Mark a candidate's form complete (the final "Save candidate"). Idempotent. */
export async function submitCandidateDraft(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid candidate." };
  await db
    .update(candidateIntake)
    .set({ submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(candidateIntake.id, id));

  // Notify the referring recruiter (if a Recruiter Email was captured). Fail-soft:
  // a lookup or email failure must never block the submit.
  try {
    const [row] = await db
      .select({
        data: candidateIntake.data,
        fullName: candidateIntake.fullName,
        positionApplied: candidateIntake.positionApplied,
      })
      .from(candidateIntake)
      .where(eq(candidateIntake.id, id))
      .limit(1);
    const values = (row?.data ?? {}) as Record<string, string>;
    const to = (values["declaration.recruiterEmail"] ?? "").trim();
    if (to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      await sendRecruiterIntakeEmail({
        to,
        recruiterName: values["declaration.name"] || undefined,
        candidateName: row?.fullName || values["personal.fullName"] || "A candidate",
        position: row?.positionApplied || values["personal.position"] || undefined,
      });
    }
  } catch {
    // fail-soft — submission already succeeded.
  }

  revalidatePath("/hr/candidates");
  return { ok: true };
}

export interface CandidateDraft {
  id: string;
  name: string;
  pct: number;
  updatedAt: Date;
}

/** In-progress drafts (not submitted, has content) — for the New/Continue chooser. */
export async function listCandidateDrafts(): Promise<CandidateDraft[]> {
  await requireUser();
  const rows = await db
    .select({
      id: candidateIntake.id,
      fullName: candidateIntake.fullName,
      data: candidateIntake.data,
      instances: candidateIntake.instances,
      photoPath: candidateIntake.photoPath,
      signaturePath: candidateIntake.signaturePath,
      updatedAt: candidateIntake.updatedAt,
    })
    .from(candidateIntake)
    .where(isNull(candidateIntake.submittedAt))
    .orderBy(desc(candidateIntake.updatedAt))
    .limit(50);
  return rows
    .map((r) => {
      const values = (r.data ?? {}) as Record<string, string>;
      const instances = (r.instances ?? {}) as Record<string, string[]>;
      return {
        id: r.id,
        name: r.fullName || "Unnamed",
        pct: intakeProgress(values, instances, Boolean(r.photoPath), Boolean(r.signaturePath)),
        updatedAt: r.updatedAt,
      };
    })
    .filter((d) => d.pct > 0 || d.name !== "Unnamed");
}

export interface CandidateDraftState {
  id: string;
  values: Record<string, string>;
  instances: Record<string, string[]>;
  photoPath: string | null;
  signaturePath: string | null;
  submitted: boolean;
}

/** Full saved state to resume or edit a candidate in the wizard. */
export async function getCandidateDraft(id: string): Promise<CandidateDraftState | null> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return null;
  const [r] = await db
    .select({
      id: candidateIntake.id,
      data: candidateIntake.data,
      instances: candidateIntake.instances,
      photoPath: candidateIntake.photoPath,
      signaturePath: candidateIntake.signaturePath,
      submittedAt: candidateIntake.submittedAt,
    })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, id))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    values: (r.data ?? {}) as Record<string, string>,
    instances: (r.instances ?? {}) as Record<string, string[]>,
    photoPath: r.photoPath,
    signaturePath: r.signaturePath,
    submitted: r.submittedAt != null,
  };
}

/** Update a candidate's pipeline status. */
export async function setCandidateStatus(
  id: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Invalid status." };
  await db.update(candidateIntake).set({ status, updatedAt: new Date() }).where(eq(candidateIntake.id, id));
  revalidatePath("/hr/pre-interview/basic-details");
  return { ok: true };
}

/** Upload a candidate file (passport photo / signature) → returns storage path. */
export async function uploadCandidateFile(fd: FormData): Promise<Result<{ path: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "File too large (max 8 MB)." };
  const kind = String(fd.get("kind") ?? "file");
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `candidate-intake/${kind}/${randomUUID()}.${ext || "bin"}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  return { ok: true, path };
}

// ── Rich HR letters ("Edit freely") — inline image upload ──

/** Image MIME types accepted for inline embedding in a rich letter. */
const LETTER_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
/** Immediate-embed signed-URL TTL: 1 hour (the editor re-uploads/persists paths on save). */
const LETTER_IMAGE_SIGNED_TTL_SECONDS = 60 * 60;

/**
 * Upload an image to embed inline in a rich ("Google Docs") HR letter. Clones
 * the candidate-file pattern: validates the image type + size (≤ 8 MB), stores
 * it in the private `documents` bucket under hr-letters/inline/<uuid>.<ext>, and
 * returns the storage `path` plus a short-lived `signedUrl` so the TipTap editor
 * can render it immediately. HR-workspace + rate-limit guarded.
 */
export async function uploadLetterImage(fd: FormData): Promise<Result<{ path: string; signedUrl: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No image provided." };
  const type = (file.type || "").toLowerCase();
  if (!LETTER_IMAGE_TYPES.has(type)) {
    return { ok: false, error: "Unsupported image type (use PNG, JPEG, WebP or GIF)." };
  }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Image too large (max 8 MB)." };

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `hr-letters/inline/${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: type, upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  const { data, error: signErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, LETTER_IMAGE_SIGNED_TTL_SECONDS);
  if (signErr || !data?.signedUrl) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `Could not sign the image URL: ${signErr?.message ?? "unknown error"}` };
  }
  return { ok: true, path, signedUrl: data.signedUrl };
}

export interface CandidateRow {
  id: string;
  fullName: string;
  positionApplied: string | null;
  mobile: string | null;
  email: string | null;
  status: string;
  submitted: boolean;
  pct: number;
  createdAt: Date;
  // Derived from the already-selected `data` jsonb (load-neutral) — lets the
  // Management Assessment screen auto-fetch Role/Department + pre-fill recruiter.
  department: string | null;
  gender: string | null;
  position: string | null;
  recruiterName: string | null;
}

/** Recent candidate records for the list view (drafts + completed). */
export async function listCandidateIntakes(): Promise<CandidateRow[]> {
  await requireUser();
  const rows = await db
    .select({
      id: candidateIntake.id,
      fullName: candidateIntake.fullName,
      positionApplied: candidateIntake.positionApplied,
      mobile: candidateIntake.mobile,
      email: candidateIntake.email,
      status: candidateIntake.status,
      data: candidateIntake.data,
      instances: candidateIntake.instances,
      photoPath: candidateIntake.photoPath,
      signaturePath: candidateIntake.signaturePath,
      submittedAt: candidateIntake.submittedAt,
      createdAt: candidateIntake.createdAt,
    })
    .from(candidateIntake)
    .orderBy(desc(candidateIntake.createdAt))
    .limit(200);
  return rows.map((r) => {
    const values = (r.data ?? {}) as Record<string, string>;
    const instances = (r.instances ?? {}) as Record<string, string[]>;
    return {
      id: r.id,
      fullName: r.fullName,
      positionApplied: r.positionApplied,
      mobile: r.mobile,
      email: r.email,
      status: r.status,
      submitted: r.submittedAt != null,
      pct: intakeProgress(values, instances, Boolean(r.photoPath), Boolean(r.signaturePath)),
      createdAt: r.createdAt,
      department: values["personal.department"] ?? null,
      gender: values["personal.gender"] ?? null,
      position: values["personal.position"] ?? null,
      recruiterName: values["declaration.name"] ?? null,
    };
  });
}

// ── Interview Positions master (the "Position Applied For" dropdown) ──

/** Active positions, ordered, as plain labels — feeds the form dropdown. */
export async function listInterviewPositions(): Promise<string[]> {
  await requireUser();
  const rows = await db
    .select({ label: interviewPositions.label })
    .from(interviewPositions)
    .where(eq(interviewPositions.isActive, true))
    .orderBy(asc(interviewPositions.sortOrder), asc(interviewPositions.label));
  return rows.map((r) => r.label);
}

/** Add a new position (HR admins). Re-activates a soft-deleted one of the same name. */
export async function addInterviewPosition(label: string): Promise<Result<{ label: string }>> {
  const me = await requireWorkspaceAdmin("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!clean) return { ok: false, error: "Enter a position name." };
  try {
    await db
      .insert(interviewPositions)
      .values({ label: clean, sortOrder: 500 })
      .onConflictDoUpdate({ target: interviewPositions.label, set: { isActive: true } });
    revalidatePath("/hr/intake");
    return { ok: true, label: clean };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the position." };
  }
}

/** Soft-delete a position (HR admins) — hidden from the picker; old records keep it. */
export async function deleteInterviewPosition(label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireWorkspaceAdmin("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  await db
    .update(interviewPositions)
    .set({ isActive: false })
    .where(eq(interviewPositions.label, label));
  revalidatePath("/hr/intake");
  return { ok: true };
}

// ── Candidate Evaluation Checklist (Pre-Interview) ──

/** Save per-criterion star ratings (0..10, 0.5 steps) onto a candidate's record. */
export async function saveCandidateEvaluation(
  candidateId: string,
  ratings: Record<string, number>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(candidateId).success) return { ok: false, error: "Pick a candidate first." };
  const valid = new Set(ALL_CRITERION_IDS);
  const clean: Record<string, number> = {};
  for (const [id, raw] of Object.entries(ratings)) {
    if (!valid.has(id) || typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const v = Math.round(Math.min(10, Math.max(0, raw)) * 2) / 2; // clamp + snap to 0.5
    if (v > 0) clean[id] = v;
  }
  await db
    .update(candidateIntake)
    .set({ evaluation: { ratings: clean }, updatedAt: new Date() })
    .where(eq(candidateIntake.id, candidateId));
  revalidatePath("/hr/evaluation");
  return { ok: true };
}

/** Minimal candidate header (name + position) for the Evaluation Record view. */
export async function getCandidateBasics(id: string): Promise<{ fullName: string; positionApplied: string | null } | null> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return null;
  const [r] = await db
    .select({ fullName: candidateIntake.fullName, positionApplied: candidateIntake.positionApplied })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, id))
    .limit(1);
  return r ?? null;
}

/** Load a candidate's saved evaluation ratings (criterionId -> 0..10). */
export async function getCandidateEvaluation(candidateId: string): Promise<Record<string, number>> {
  await requireUser();
  if (!z.string().uuid().safeParse(candidateId).success) return {};
  const [row] = await db
    .select({ evaluation: candidateIntake.evaluation })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, candidateId))
    .limit(1);
  const ev = row?.evaluation as { ratings?: unknown } | null | undefined;
  const out: Record<string, number> = {};
  if (ev && typeof ev.ratings === "object" && ev.ratings) {
    for (const [id, v] of Object.entries(ev.ratings as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[id] = v;
    }
  }
  return out;
}
