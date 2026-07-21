"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { isLetterType, LETTER_DOCTYPE_PREFIX } from "@/lib/hr/letter-types";
import { safeFileName, validateUpload } from "@/lib/hr/upload";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Give the letter a title").max(200, "Title too long");

/** Letters are issued BY HR — only admins/super-admins upload or remove them.
 *  (Employees read their own on the Letters page.) */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** Upload one letter for an employee. Admin-only. FormData: employeeId,
 *  letterType, title, effectiveDate?, notes?, file. */
export async function uploadLetter(form: FormData): Promise<Result<{ id: string }>> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Pick an employee." };

  const letterType = String(form.get("letterType") ?? "");
  if (!isLetterType(letterType)) return { ok: false, error: "Pick a letter type." };

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  const effRaw = String(form.get("effectiveDate") ?? "").trim();
  const effectiveDate = effRaw && /^\d{4}-\d{2}-\d{2}$/.test(effRaw) ? effRaw : null;
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  const shape = validateUpload(file);
  if (!shape.ok) return shape;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId), columns: { id: true } });
  if (!emp) return { ok: false, error: "Employee not found." };

  const path = `hr-letters/${employeeId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(employeeDocuments)
      .values({
        employeeId,
        docType: letterType,
        title: titleRes.data,
        effectiveDate,
        storagePath: path,
        fileName: file.name.slice(0, 200),
        mimeType: file.type || null,
        sizeBytes: file.size,
        notes,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/letters");
  return { ok: true, id: inserted.id };
}

/** Delete a letter (admin-only). Guarded to the letter docType space so it can
 *  never remove a dossier (non-letter) document. */
export async function deleteLetter(id: string): Promise<Result> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const [row] = await db
    .select({ id: employeeDocuments.id, docType: employeeDocuments.docType, storagePath: employeeDocuments.storagePath })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Letter not found" };
  if (!row.docType.startsWith(LETTER_DOCTYPE_PREFIX)) return { ok: false, error: "Not a letter." };

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  revalidatePath("/letters");
  return { ok: true };
}
