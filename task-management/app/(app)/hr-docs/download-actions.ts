"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentInstances } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * HR Letters / Documents — read-side download helper (Phase 3 UI support).
 *
 * The rendered PDFs live in the PRIVATE documents bucket, so a raw
 * `rendered_pdf_path` is not directly fetchable. This mints a short-lived signed
 * URL for one instance's archived PDF, gated to the owning employee or an admin —
 * exactly the same visibility rule as getDocumentStatus / listEmployeeDocuments.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

/** Mint a 1-hour signed URL for an issued document's PDF. Owner or admin only. */
export async function getDocumentDownloadUrl(
  instanceId: string,
): Promise<Result<{ url: string }>> {
  const me = await requireUser();
  if (!UUID.safeParse(instanceId).success) return { ok: false, error: "Invalid document." };

  const [row] = await db
    .select({
      employeeId: documentInstances.employeeId,
      renderedPdfPath: documentInstances.renderedPdfPath,
    })
    .from(documentInstances)
    .where(eq(documentInstances.id, instanceId))
    .limit(1);
  if (!row) return { ok: false, error: "Document not found." };

  const admin = me.isAdmin || isSuperAdmin(me.email);
  if (!admin && row.employeeId !== me.id) return { ok: false, error: "Forbidden" };
  if (!row.renderedPdfPath) return { ok: false, error: "This document has not been issued yet." };

  try {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.renderedPdfPath, 60 * 60);
    if (error || !data?.signedUrl) return { ok: false, error: "Could not create the download link." };
    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, error: "Could not create the download link." };
  }
}
