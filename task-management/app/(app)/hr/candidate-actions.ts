"use server";

import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { candidateIntake } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const CANDIDATE_STATUSES = ["new", "shortlisted", "rejected", "hired"] as const;

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().max(200).default(""),
  positionApplied: z.string().trim().max(200).optional(),
  mobile: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  photoPath: z.string().max(400).optional(),
  signaturePath: z.string().max(400).optional(),
});

/** Create OR update a candidate intake record (recruiter data-entry). */
export async function saveCandidateIntake(
  input: z.input<typeof SaveSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;

  const values = {
    fullName: v.fullName,
    positionApplied: v.positionApplied ?? null,
    mobile: v.mobile ?? null,
    email: v.email ?? null,
    data: v.data as Record<string, unknown>,
    photoPath: v.photoPath ?? null,
    signaturePath: v.signaturePath ?? null,
  };

  try {
    if (v.id) {
      await db
        .update(candidateIntake)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(candidateIntake.id, v.id));
      revalidatePath("/hr/pre-interview/basic-details");
      return { ok: true, id: v.id };
    }
    const [row] = await db
      .insert(candidateIntake)
      .values({ ...values, createdById: me.id })
      .returning({ id: candidateIntake.id });
    if (!row) return { ok: false, error: "Could not save the candidate." };
    revalidatePath("/hr/pre-interview/basic-details");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
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

export interface CandidateRow {
  id: string;
  fullName: string;
  positionApplied: string | null;
  mobile: string | null;
  email: string | null;
  status: string;
  createdAt: Date;
}

/** Recent candidate records for the list view. */
export async function listCandidateIntakes(): Promise<CandidateRow[]> {
  await requireUser();
  return db
    .select({
      id: candidateIntake.id,
      fullName: candidateIntake.fullName,
      positionApplied: candidateIntake.positionApplied,
      mobile: candidateIntake.mobile,
      email: candidateIntake.email,
      status: candidateIntake.status,
      createdAt: candidateIntake.createdAt,
    })
    .from(candidateIntake)
    .orderBy(desc(candidateIntake.createdAt))
    .limit(200);
}
