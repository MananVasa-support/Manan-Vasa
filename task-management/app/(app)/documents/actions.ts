"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");
const DescSchema = z.string().trim().max(2000).optional();
const MAX_BYTES = 25 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export async function uploadDocument(form: FormData): Promise<Result<{ id: string }>> {
  const me = await requireUser();

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };
  const descRes = DescSchema.safeParse(form.get("description") ?? undefined);
  if (!descRes.success) return { ok: false, error: "Description too long" };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };

  const path = `${crypto.randomUUID()}/${safeName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        title: titleRes.data,
        description: descRes.data ?? null,
        storagePath: path,
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };
  revalidatePath("/documents");
  return { ok: true, id: inserted.id };
}

export async function updateDocument(
  id: string,
  fields: { title?: string; description?: string | null },
): Promise<Result> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const patch: { title?: string; description?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (fields.title !== undefined) {
    const t = TitleSchema.safeParse(fields.title);
    if (!t.success) return { ok: false, error: t.error.issues[0]!.message };
    patch.title = t.data;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description ? fields.description.trim().slice(0, 2000) : null;
  }
  await db.update(documents).set(patch).where(eq(documents.id, id));
  revalidatePath("/documents");
  return { ok: true };
}

export async function replaceDocumentFile(id: string, form: FormData): Promise<Result> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return { ok: false, error: "Document not found" };

  const admin = getSupabaseAdmin();
  const path = `${crypto.randomUUID()}/${safeName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  await db
    .update(documents)
    .set({ storagePath: path, mimeType: file.type || null, sizeBytes: file.size, updatedAt: new Date() })
    .where(eq(documents.id, id));
  // Best-effort cleanup of the old object.
  await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.storagePath]).catch(() => {});
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<Result> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return { ok: true };
  const admin = getSupabaseAdmin();
  await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.storagePath]).catch(() => {});
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/documents");
  return { ok: true };
}
