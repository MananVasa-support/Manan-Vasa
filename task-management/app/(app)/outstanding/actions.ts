"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
  outstandingAttachments,
} from "@/db/schema";
import { OUTSTANDING_CYCLES } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { generateSchedule } from "@/lib/outstanding/schedule";
import type { ContractInput } from "@/lib/outstanding/types";
import { rollingHorizon, todayISO } from "@/lib/outstanding/horizon";
import {
  listInstallmentsForContract,
  type AdminInstallmentRow,
} from "@/lib/queries/outstanding";
import {
  CreateContractSchema,
  UpdateContractSchema,
  EditInstallmentSchema,
  AdhocInstallmentSchema,
  CreateCollectionSchema,
  type UpdateContractInput,
} from "@/lib/validators/outstanding";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ───────────────────────────────────────────────────────────────────────────
// v2 — contract-driven schedule (Milestone 3). The v1 ledger write actions
// (createOutstandingEntry / addOutstandingFollowup / setOutstandingWriteOff /
// deleteOutstandingEntry) were removed in the rebuild cleanup; the v2 surface
// below is what the rebuilt Outstanding Tracker uses.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Rebuild a contract's auto-generated installments from the schedule engine.
 * Override rows (is_override = true) are preserved — only the engine-owned
 * rows are deleted and re-created, so admin edits / ad-hoc rows survive a
 * re-materialization. Runs in a transaction so a partial rebuild never
 * leaves the contract with no installments.
 */
async function materializeInstallments(contractId: string): Promise<void> {
  const contract = await db.query.outstandingContracts.findFirst({
    where: eq(outstandingContracts.id, contractId),
  });
  if (!contract) return;

  const input: ContractInput = {
    id: contract.id,
    clientName: contract.clientName,
    cycle: contract.cycle,
    baseAmount: Number(contract.baseAmount),
    gstRate: contract.gstRate,
    startDate: contract.startDate,
    periods: contract.periods,
    endDate: contract.endDate,
    status: contract.status,
  };

  const specs = generateSchedule(input, rollingHorizon(todayISO()));

  await db.transaction(async (tx) => {
    await tx
      .delete(outstandingInstallments)
      .where(
        sql`${outstandingInstallments.contractId} = ${contractId} AND ${outstandingInstallments.isOverride} = false`,
      );
    if (specs.length > 0) {
      await tx.insert(outstandingInstallments).values(
        specs.map((s) => ({
          contractId,
          periodIndex: s.periodIndex,
          dueDate: s.dueDate,
          amount: s.amount.toFixed(2),
          isOverride: false,
        })),
      );
    }
  });
}

/** Create a contract (any signed-in employee) and materialize its schedule. */
export async function createOutstandingContract(input: {
  clientName: string;
  contactPhone?: string;
  productId?: string;
  entityId?: string;
  responsibleId?: string;
  expectedModeId?: string;
  cycle: (typeof OUTSTANDING_CYCLES)[number];
  baseAmount: number;
  gstRate: number;
  startDate: string;
  periods?: number | null;
  endDate?: string | null;
  pdcReceived: boolean;
  comments?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // A full payment is a single installment by definition.
  const periods = d.cycle === "full_payment" ? 1 : d.periods ?? null;

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingContracts)
      .values({
        clientName: d.clientName,
        contactPhone: d.contactPhone || null,
        productId: d.productId ?? null,
        entityId: d.entityId ?? null,
        responsibleId: d.responsibleId ?? null,
        expectedModeId: d.expectedModeId ?? null,
        cycle: d.cycle,
        baseAmount: d.baseAmount.toFixed(2),
        gstRate: d.gstRate,
        startDate: d.startDate,
        periods,
        endDate: d.endDate ?? null,
        pdcReceived: d.pdcReceived,
        comments: d.comments || null,
        createdById: me.id,
      })
      .returning({ id: outstandingContracts.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await materializeInstallments(inserted.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

/** Edit a contract (admin) and re-materialize its schedule. */
export async function updateOutstandingContract(
  id: string,
  fields: UpdateContractInput,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid contract id" };
  }
  const parsed = UpdateContractSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.query.outstandingContracts.findFirst({
    where: eq(outstandingContracts.id, id),
  });
  if (!existing) return { ok: false, error: "Contract not found" };

  const patch: Partial<typeof outstandingContracts.$inferInsert> = { updatedAt: new Date() };
  if (d.clientName !== undefined) patch.clientName = d.clientName;
  if (d.contactPhone !== undefined) patch.contactPhone = d.contactPhone || null;
  if (d.productId !== undefined) patch.productId = d.productId;
  if (d.entityId !== undefined) patch.entityId = d.entityId;
  if (d.responsibleId !== undefined) patch.responsibleId = d.responsibleId;
  if (d.expectedModeId !== undefined) patch.expectedModeId = d.expectedModeId;
  if (d.cycle !== undefined) patch.cycle = d.cycle;
  if (d.baseAmount !== undefined) patch.baseAmount = d.baseAmount.toFixed(2);
  if (d.gstRate !== undefined) patch.gstRate = d.gstRate;
  if (d.startDate !== undefined) patch.startDate = d.startDate;
  if (d.periods !== undefined) patch.periods = d.periods;
  if (d.endDate !== undefined) patch.endDate = d.endDate;
  if (d.pdcReceived !== undefined) patch.pdcReceived = d.pdcReceived;
  if (d.comments !== undefined) patch.comments = d.comments || null;

  // full_payment always means a single period regardless of what's sent.
  const effectiveCycle = d.cycle ?? existing.cycle;
  if (effectiveCycle === "full_payment") patch.periods = 1;

  try {
    await db.update(outstandingContracts).set(patch).where(eq(outstandingContracts.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await materializeInstallments(id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

async function setContractStatus(
  id: string,
  status: "written_off" | "closed",
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid contract id" };
  }

  try {
    await db
      .update(outstandingContracts)
      .set({ status, updatedAt: new Date() })
      .where(eq(outstandingContracts.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Mark a contract as written off (admin). */
export async function writeOffContract(id: string): Promise<ActionResult> {
  return setContractStatus(id, "written_off");
}

/** Mark a contract as closed (admin). */
export async function closeContract(id: string): Promise<ActionResult> {
  return setContractStatus(id, "closed");
}

/** Override a single installment's due date / amount (admin). */
export async function editInstallment(
  id: string,
  fields: { dueDate?: string; amount?: number },
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid installment id" };
  }
  const parsed = EditInstallmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const patch: Partial<typeof outstandingInstallments.$inferInsert> = {
    isOverride: true,
    updatedAt: new Date(),
  };
  if (parsed.data.dueDate !== undefined) patch.dueDate = parsed.data.dueDate;
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount.toFixed(2);

  try {
    await db.update(outstandingInstallments).set(patch).where(eq(outstandingInstallments.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Add a one-off (override) installment to a contract (admin). */
export async function addAdhocInstallment(
  contractId: string,
  fields: { dueDate: string; amount: number },
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Invalid contract id" };
  }
  const parsed = AdhocInstallmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingInstallments)
      .values({
        contractId,
        periodIndex: null,
        dueDate: parsed.data.dueDate,
        amount: parsed.data.amount.toFixed(2),
        isOverride: true,
      })
      .returning({ id: outstandingInstallments.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

/**
 * Fetch a contract's installments (admin). Thin server-action wrapper around
 * the read query so the client-side installment editor can lazy-load rows
 * when a contract's editor is opened.
 */
export async function fetchInstallmentsForContract(
  contractId: string,
): Promise<ActionResult<{ rows: AdminInstallmentRow[] }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Invalid contract id" };
  }

  try {
    const rows = await listInstallmentsForContract(contractId);
    return { ok: true, rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}

/** Delete a single installment (admin). */
export async function deleteInstallment(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid installment id" };
  }

  try {
    await db.delete(outstandingInstallments).where(eq(outstandingInstallments.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Record a collection / receipt (any signed-in employee). */
export async function createCollection(input: {
  clientName: string;
  contractId?: string | null;
  amount: number;
  paymentModeId: string;
  responsibleId: string;
  collectedAt?: string;
  comments?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingCollections)
      .values({
        clientName: d.clientName,
        contractId: d.contractId ?? null,
        amount: d.amount.toFixed(2),
        paymentModeId: d.paymentModeId,
        responsibleId: d.responsibleId,
        collectedAt: d.collectedAt ?? todayISO(),
        comments: d.comments || null,
        createdById: me.id,
      })
      .returning({ id: outstandingCollections.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

// ── Attachments ────────────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Allowlist mirrors the documents library: images + pdf + common office docs.
const ATTACHMENT_MIME_ALLOWLIST = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

function safeAttachmentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

// Mirrors DISALLOWED_EXTENSIONS in app/(app)/documents/actions.ts. Kept as a
// literal copy (not imported) because that regex is a module-private constant
// in the documents server action — replicated here to keep the two upload
// guards consistent. If documents.ts ever exports it, switch to an import.
const DISALLOWED_ATTACHMENT_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget)$/i;

/** Upload a contract/collection attachment (any signed-in employee). */
export async function uploadOutstandingAttachment(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ownerType = form.get("ownerType");
  if (ownerType !== "contract" && ownerType !== "collection") {
    return { ok: false, error: "Invalid owner type" };
  }
  const ownerId = form.get("ownerId");
  if (typeof ownerId !== "string" || !z.string().uuid().safeParse(ownerId).success) {
    return { ok: false, error: "Invalid owner id" };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File exceeds 25 MB." };
  }
  if (DISALLOWED_ATTACHMENT_EXTENSIONS.test(file.name)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  if (!file.type || !ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
    return { ok: false, error: "This file type is not allowed." };
  }

  const path = `outstanding/${ownerType}/${crypto.randomUUID()}/${safeAttachmentName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingAttachments)
      .values({
        ownerType,
        ownerId,
        storagePath: path,
        fileName: file.name.slice(0, 255),
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedById: me.id,
      })
      .returning({ id: outstandingAttachments.id });
  } catch (err: unknown) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: "DB: insert returned no row" };
  }

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

export interface OutstandingAttachmentView {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
}

/** List attachments for an owner with fresh signed download URLs. */
export async function listOutstandingAttachments(
  ownerType: "contract" | "collection",
  ownerId: string,
): Promise<OutstandingAttachmentView[]> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return [];

  if (!z.string().uuid().safeParse(ownerId).success) return [];

  const rows = await db
    .select({
      id: outstandingAttachments.id,
      fileName: outstandingAttachments.fileName,
      mimeType: outstandingAttachments.mimeType,
      sizeBytes: outstandingAttachments.sizeBytes,
      storagePath: outstandingAttachments.storagePath,
    })
    .from(outstandingAttachments)
    .where(
      sql`${outstandingAttachments.ownerType} = ${ownerType} AND ${outstandingAttachments.ownerId} = ${ownerId}`,
    );
  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  const { data: signed } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storagePath),
      3600,
    );
  const urlByPath = new Map<string, string>();
  (signed ?? []).forEach((s, i) => {
    const path = rows[i]?.storagePath;
    if (path && s.signedUrl) urlByPath.set(path, s.signedUrl);
  });

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    url: urlByPath.get(r.storagePath) ?? null,
  }));
}

