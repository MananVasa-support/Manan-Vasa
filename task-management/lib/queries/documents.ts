import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  createdAt: Date;
  /** Short-lived signed download URL (null if signing failed). */
  url: string | null;
}

/** Document library, newest first, each with a fresh signed download URL. */
export async function listDocuments(): Promise<DocumentRow[]> {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedByName: employees.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(employees, eq(documents.uploadedById, employees.id))
    .orderBy(desc(documents.createdAt))
    .limit(500);

  const admin = getSupabaseAdmin();
  const out: DocumentRow[] = [];
  for (const r of rows) {
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(r.storagePath, 3600);
    out.push({
      id: r.id,
      title: r.title,
      description: r.description,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      uploadedByName: r.uploadedByName ?? null,
      createdAt: r.createdAt,
      url: data?.signedUrl ?? null,
    });
  }
  return out;
}
