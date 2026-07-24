import "server-only";

// Plain server-only module holding ALL the hr-docs action LOGIC. The public
// "use server" surface (app/(app)/hr-docs/actions.ts) is a tiny wrapper around
// these, so the client↔"use server" boundary never has to process a large file
// (which hangs webpack dev). Nothing here is a server action — no client imports
// this module directly.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  letterTemplates,
  documentInstances,
  documentSignatures,
  employees,
  designations,
  type LetterTemplate,
  type DocumentInstance,
  type Employee,
} from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
// lib/email/resend is server-only and pulls in the React email-template graph
// (@/emails/*). Importing it statically makes Next analyse that whole graph when
// a CLIENT component imports actions from this file → dev compile HANG. So the
// resend client is imported LAZILY in the email block, and this tiny helper
// replaces the imported errorMessage util.
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
import { resolveMerge, formatMergeDate } from "@/lib/hr-docs/merge";
import { getDocType, isDocTypeKey, type HrCategory } from "@/lib/hr-docs/types";
// NOTE: render.ts pulls in pdfkit (bundles thousands of font glyphs → webpack
// compile HANG if it reaches any client graph). Imported LAZILY inside the
// functions below so it stays strictly server-runtime and never in a bundle.
import type { DocKind } from "@/lib/documents/signing";

/**
 * HR Letters / Documents engine — Phase 2 ACTIONS (Node.js runtime; pdfkit +
 * Supabase Storage + Resend are all Node-only, and Vercel runs "use server"
 * modules under Node, so no `runtime` export is needed here).
 *
 * The full non-CTC contract: template CRUD (admin), compose → issue (render →
 * upload → email/e-sign wiring), and read-side status. Structured CTC lives in
 * ./ctc-actions.ts. Every write is auth-guarded (admin/HR) + rate-limited +
 * zod-validated, and returns the repo-standard { ok:true, ... } | { ok:false }.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** category → the signing doc_kind the existing document_signatures flow expects. */
function docKindForCategory(category: string): DocKind {
  return category === "appointment" ? "agreement" : "letter";
}

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

export interface TemplateRow {
  id: string;
  category: string;
  typeKey: string;
  title: string;
  bodyMd: string;
  trigger: string;
  signature: string;
  content: string;
  active: boolean;
  updatedAt: string;
}

function toTemplateRow(t: LetterTemplate): TemplateRow {
  return {
    id: t.id,
    category: t.category,
    typeKey: t.typeKey,
    title: t.title,
    bodyMd: t.bodyMd,
    trigger: t.trigger,
    signature: t.signature,
    content: t.content,
    active: t.active,
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** All templates (optionally scoped to one category), canonical order. HR/admin. */
export async function listTemplates(category?: string): Promise<Result<{ templates: TemplateRow[] }>> {
  await requireAdmin();
  const rows = category
    ? await db.select().from(letterTemplates).where(eq(letterTemplates.category, category))
    : await db.select().from(letterTemplates);
  // Order by the canonical category grouping then title for a stable UI.
  const templates = rows
    .map(toTemplateRow)
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  return { ok: true, templates };
}

/** One template by its stable type key. HR/admin. */
export async function getTemplate(typeKey: string): Promise<Result<{ template: TemplateRow }>> {
  await requireAdmin();
  if (!isDocTypeKey(typeKey)) return { ok: false, error: "Unknown document type." };
  const [row] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.typeKey, typeKey))
    .limit(1);
  if (!row) return { ok: false, error: "Template not found." };
  return { ok: true, template: toTemplateRow(row) };
}

const SaveTemplateSchema = z.object({
  typeKey: z.string().min(1),
  bodyMd: z.string().max(20_000),
  title: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
});

/**
 * Save the admin-edited body (and optionally title / active) for a template.
 * The fixed Altus frame is in code — only the {{merge}} body is editable here.
 * Admin-only.
 */
export async function saveTemplateBody(input: {
  typeKey: string;
  bodyMd: string;
  title?: string;
  active?: boolean;
}): Promise<Result<{ template: TemplateRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (!isDocTypeKey(parsed.data.typeKey)) return { ok: false, error: "Unknown document type." };

  const patch: Partial<typeof letterTemplates.$inferInsert> = {
    bodyMd: parsed.data.bodyMd,
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;

  const [row] = await db
    .update(letterTemplates)
    .set(patch)
    .where(eq(letterTemplates.typeKey, parsed.data.typeKey))
    .returning();
  if (!row) return { ok: false, error: "Template not found." };

  revalidatePath("/hr-docs");
  return { ok: true, template: toTemplateRow(row) };
}

/* ------------------------------------------------------------------ */
/* Compose                                                              */
/* ------------------------------------------------------------------ */

const MergeValuesSchema = z.record(z.string(), z.string()).optional();

const ComposeSchema = z.object({
  typeKey: z.string().min(1),
  employeeId: UUID.nullish(),
  candidate: z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(200).optional(),
    })
    .optional(),
  mergeValues: MergeValuesSchema,
  // Per-document edited body. When present it becomes the frozen snapshot for THIS
  // instance (the compose window lets HR tweak the letter wording inline before
  // issuing); blank/undefined falls back to the template default.
  bodyMd: z.string().max(60_000).optional(),
});

/**
 * Compose a draft document instance: capture the recipient (employee OR pre-hire
 * candidate), the filled {{merge}} values, and freeze the current template body
 * into body_snapshot_md so previews + the eventual PDF stay stable even if an
 * admin later edits the template. Admin/HR-only. Returns the new instance id.
 */
export async function composeDocument(input: {
  typeKey: string;
  employeeId?: string | null;
  candidate?: { name: string; email?: string };
  mergeValues?: Record<string, string>;
  bodyMd?: string;
}): Promise<Result<{ instanceId: string }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ComposeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { typeKey, employeeId, candidate, mergeValues, bodyMd } = parsed.data;

  const docType = getDocType(typeKey);
  if (!docType) return { ok: false, error: "Unknown document type." };

  if (!employeeId && !candidate?.name) {
    return { ok: false, error: "Pick an employee or enter a candidate." };
  }

  // Confirm the employee exists when supplied (clean message vs a raw FK error).
  if (employeeId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
    if (!emp) return { ok: false, error: "Employee not found." };
  }

  const [tpl] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.typeKey, typeKey))
    .limit(1);
  if (!tpl) return { ok: false, error: "Template not found." };

  const [row] = await db
    .insert(documentInstances)
    .values({
      typeKey,
      employeeId: employeeId ?? null,
      candidateName: candidate?.name ?? null,
      candidateEmail: candidate?.email ?? null,
      status: "draft",
      mergeValues: mergeValues ?? {},
      bodySnapshotMd: bodyMd?.trim() ? bodyMd : tpl.bodyMd,
      issuedById: null,
    })
    .returning({ id: documentInstances.id });
  if (!row) return { ok: false, error: "Could not compose the document." };

  revalidatePath("/hr-docs");
  return { ok: true, instanceId: row.id };
}

/* ------------------------------------------------------------------ */
/* Requests (category F) — employee-initiated, self-service              */
/* ------------------------------------------------------------------ */

const SubmitRequestSchema = z.object({
  typeKey: z.string().min(1),
  mergeValues: MergeValuesSchema,
  // Employee-edited request wording (WYSIWYG); blank falls back to the template.
  bodyMd: z.string().max(60_000).optional(),
});

/**
 * Submit a request document (leave / resignation) as the signed-in EMPLOYEE.
 * Unlike composeDocument/issueDocument (admin-only), any authenticated user may
 * raise a request for THEMSELVES: this composes + renders + archives the letter
 * with the employee as recipient (status 'sent'), so it lands in their document
 * file where HR reviews it. Only 'request'-trigger types are accepted.
 */
export async function submitRequest(input: {
  typeKey: string;
  mergeValues?: Record<string, string>;
  bodyMd?: string;
}): Promise<Result<{ instanceId: string; pdfPath: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SubmitRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { typeKey, mergeValues, bodyMd } = parsed.data;

  const docType = getDocType(typeKey);
  if (!docType || docType.trigger !== "request") {
    return { ok: false, error: "This is not a request you can raise." };
  }

  const [tpl] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.typeKey, typeKey))
    .limit(1);
  if (!tpl) return { ok: false, error: "Template not found." };

  // Compose (recipient = the requester) freezing the edited (or template) body.
  const [inst] = await db
    .insert(documentInstances)
    .values({
      typeKey,
      employeeId: me.id,
      status: "draft",
      mergeValues: mergeValues ?? {},
      bodySnapshotMd: bodyMd?.trim() ? bodyMd : tpl.bodyMd,
      issuedById: null,
    })
    .returning();
  if (!inst) return { ok: false, error: "Could not create the request." };

  const issuedAt = new Date();
  const resolved = await resolveRecipient({ ...inst, issuedAt }, me.name);

  // Render → upload the request letter.
  let pdfBuffer: Buffer;
  try {
    const { renderLetterPdf } = await import("@/lib/hr-docs/render");
    pdfBuffer = await renderLetterPdf({
      template: {
        title: tpl.title,
        category: tpl.category,
        signature: docType.signature,
        content: docType.content,
      },
      bodyMd: inst.bodySnapshotMd ?? tpl.bodyMd,
      mergeMap: resolved.map,
      signatureBlock: {
        signature: docType.signature,
        recipientName: resolved.recipientName,
        hrName: me.name,
        date: resolved.map.date,
        place: resolved.map.place,
      },
    });
  } catch (err) {
    await db.delete(documentInstances).where(eq(documentInstances.id, inst.id)).catch(() => {});
    return { ok: false, error: `Could not render the request: ${errorMessage(err)}` };
  }

  const pdfPath = `${me.id}/hr-docs/${randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    await db
      .update(documentInstances)
      .set({
        status: "sent",
        renderedPdfPath: pdfPath,
        issuedById: me.id,
        issuedAt,
        updatedAt: new Date(),
      })
      .where(eq(documentInstances.id, inst.id));
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pdfPath]).catch(() => {});
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }

  revalidatePath("/hr-docs");
  return { ok: true, instanceId: inst.id, pdfPath };
}

/* ------------------------------------------------------------------ */
/* Merge-map resolution (query-backed) — resolves FK designation/manager */
/* ------------------------------------------------------------------ */

interface ResolvedRecipient {
  map: Record<string, string>;
  recipientEmail: string | null;
  recipientName: string;
}

/**
 * Build the full {{field}} → value map for an instance, resolving the FK-derived
 * designation + reporting-manager names (which resolveMerge stays query-free
 * about) and layering the composer's mergeValues on top (they win). Returns the
 * recipient email/name for the email + e-sign wiring.
 */
async function resolveRecipient(
  instance: DocumentInstance,
  issuerName: string,
): Promise<ResolvedRecipient> {
  const extra: Record<string, string> = {};
  let source: { name?: string | null; email?: string | null; department?: string | null; joinedAt?: Date | null } | null =
    null;
  let recipientEmail: string | null = null;

  if (instance.employeeId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, instance.employeeId) });
    if (emp) {
      source = {
        name: emp.name,
        email: emp.email,
        department: emp.department,
        joinedAt: emp.joinedAt,
      };
      recipientEmail = emp.email;

      if (emp.designationId) {
        const [d] = await db
          .select({ name: designations.name })
          .from(designations)
          .where(eq(designations.id, emp.designationId))
          .limit(1);
        if (d?.name) extra.designation = d.name;
      }
      if (emp.managerId) {
        const [m] = await db
          .select({ name: employees.name })
          .from(employees)
          .where(eq(employees.id, emp.managerId))
          .limit(1);
        if (m?.name) extra.reportingManager = m.name;
      }
    }
  } else {
    source = { name: instance.candidateName, email: instance.candidateEmail };
    recipientEmail = instance.candidateEmail ?? null;
  }

  // Sensible defaults, then the composer's explicit values win over everything.
  if (issuerName) extra.hrName = issuerName;
  extra.date = formatMergeDate(instance.issuedAt ?? new Date());
  for (const [k, v] of Object.entries(instance.mergeValues ?? {})) {
    if (typeof v === "string") extra[k] = v;
  }

  const map = resolveMerge(source, extra);
  return { map, recipientEmail, recipientName: map.name ?? "" };
}

/** Latest signature row for an instance (docKind, docId=instanceId), or null. */
async function latestSignature(docKind: DocKind, instanceId: string) {
  const [row] = await db
    .select()
    .from(documentSignatures)
    .where(and(eq(documentSignatures.docKind, docKind), eq(documentSignatures.docId, instanceId)))
    .orderBy(desc(documentSignatures.createdAt))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Issue — render → upload → email/e-sign wiring                        */
/* ------------------------------------------------------------------ */

/**
 * Issue a draft: freeze + render the PDF, archive it to the private documents
 * bucket, flip status to 'sent', and wire follow-ups —
 *   · trigger === 'email'   → emails the recipient with the PDF attached (emailed_at set)
 *   · signature === 'esign' → creates a PENDING document_signatures row (docId =
 *                             this instance) so the existing SignDocument flow drives it.
 * Admin/HR-only. Only draft instances can be issued.
 */
export async function issueDocument(input: {
  instanceId: string;
}): Promise<Result<{ pdfPath: string; emailed: boolean; signatureId: string | null }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!UUID.safeParse(input.instanceId).success) return { ok: false, error: "Invalid document." };

  const [instance] = await db
    .select()
    .from(documentInstances)
    .where(eq(documentInstances.id, input.instanceId))
    .limit(1);
  if (!instance) return { ok: false, error: "Document not found." };
  if (instance.status !== "draft") {
    return { ok: false, error: "This document has already been issued." };
  }

  const docType = getDocType(instance.typeKey);
  if (!docType) return { ok: false, error: "Unknown document type." };

  const [tpl] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.typeKey, instance.typeKey))
    .limit(1);
  if (!tpl) return { ok: false, error: "Template not found." };

  const issuedAt = new Date();
  const resolved = await resolveRecipient({ ...instance, issuedAt }, me.name);
  const bodyMd = instance.bodySnapshotMd ?? tpl.bodyMd;

  // ── Render ──
  let pdfBuffer: Buffer;
  try {
    const { renderLetterPdf } = await import("@/lib/hr-docs/render");
    pdfBuffer = await renderLetterPdf({
      template: {
        title: tpl.title,
        category: tpl.category,
        signature: docType.signature,
        content: docType.content,
      },
      bodyMd,
      mergeMap: resolved.map,
      signatureBlock: {
        signature: docType.signature,
        recipientName: resolved.recipientName,
        hrName: me.name,
        date: resolved.map.date,
        place: resolved.map.place,
      },
    });
  } catch (err) {
    return { ok: false, error: `Could not render the PDF: ${errorMessage(err)}` };
  }

  // ── Upload ──
  const folder = instance.employeeId ?? "candidates";
  const pdfPath = `${folder}/hr-docs/${randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // ── Email (trigger === 'email') ──
  let emailed = false;
  let emailedAt: Date | null = null;
  if (docType.trigger === "email" && resolved.recipientEmail) {
    const { getResend, FROM, companyBcc, clampSubject } = await import("@/lib/email/resend");
    const resend = getResend();
    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: FROM,
          to: resolved.recipientEmail,
          subject: clampSubject(`${tpl.title} — Altus Corp`),
          html: buildEmailHtml(resolved.recipientName, tpl.title),
          attachments: [{ filename: `${slug(tpl.title)}.pdf`, content: pdfBuffer }],
          ...companyBcc(),
        });
        if (!error) {
          emailed = true;
          emailedAt = new Date();
        }
      } catch {
        // Best-effort: a Resend outage must not fail the issue; PDF is archived.
      }
    }
  }

  // ── Persist instance state ──
  try {
    await db
      .update(documentInstances)
      .set({
        status: "sent",
        renderedPdfPath: pdfPath,
        bodySnapshotMd: bodyMd,
        issuedById: me.id,
        issuedAt,
        emailedAt,
        updatedAt: new Date(),
      })
      .where(eq(documentInstances.id, instance.id));
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pdfPath]).catch(() => {});
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }

  // ── E-sign wiring (signature === 'esign') — needs a real employee signer ──
  let signatureId: string | null = null;
  if (docType.signature === "esign" && instance.employeeId) {
    const docKind = docKindForCategory(tpl.category);
    const existing = await latestSignature(docKind, instance.id);
    if (existing && existing.status !== "signed") {
      signatureId = existing.id;
    } else if (!existing) {
      try {
        const [sig] = await db
          .insert(documentSignatures)
          .values({
            docKind,
            docId: instance.id,
            signerEmployeeId: instance.employeeId,
            status: "pending",
            createdById: me.id,
          })
          .returning({ id: documentSignatures.id });
        signatureId = sig?.id ?? null;
      } catch {
        // Non-fatal: the document is issued; signing can be started later.
        signatureId = null;
      }
    }
  }

  revalidatePath("/hr-docs");
  return { ok: true, pdfPath, emailed, signatureId };
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function buildEmailHtml(name: string, title: string): string {
  const greet = name ? `Dear ${escapeHtml(name)},` : "Hello,";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0A0A0A;line-height:1.6">
    <p>${greet}</p>
    <p>Please find attached your <strong>${escapeHtml(title)}</strong> from Altus Corp.</p>
    <p>Warm regards,<br/>Human Resources, Altus Corp</p>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Read side — employee document list + status                          */
/* ------------------------------------------------------------------ */

export interface DocumentStatusRow {
  id: string;
  typeKey: string;
  title: string;
  category: string;
  status: string;
  trigger: string;
  signature: string;
  employeeId: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  renderedPdfPath: string | null;
  emailedAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  /** e-sign lifecycle for the linked document_signatures row (if any). */
  signatureStatus: string | null;
}

/** All document instances for an employee, newest first, with sign state. HR/admin. */
export async function listEmployeeDocuments(
  employeeId: string,
): Promise<Result<{ documents: DocumentStatusRow[] }>> {
  const me = await requireUser();
  // The person themselves may view their own documents; admins see anyone's.
  if (!isAdmin(me) && me.id !== employeeId) return { ok: false, error: "Forbidden" };
  if (!UUID.safeParse(employeeId).success) return { ok: false, error: "Invalid employee." };

  const rows = await db
    .select()
    .from(documentInstances)
    .where(eq(documentInstances.employeeId, employeeId))
    .orderBy(desc(documentInstances.createdAt));

  const documents: DocumentStatusRow[] = [];
  for (const r of rows) {
    documents.push(await toStatusRow(r));
  }
  return { ok: true, documents };
}

/** Full status of one instance, joining its signature row. Owner or admin. */
export async function getDocumentStatus(
  instanceId: string,
): Promise<Result<{ document: DocumentStatusRow }>> {
  const me = await requireUser();
  if (!UUID.safeParse(instanceId).success) return { ok: false, error: "Invalid document." };

  const [row] = await db
    .select()
    .from(documentInstances)
    .where(eq(documentInstances.id, instanceId))
    .limit(1);
  if (!row) return { ok: false, error: "Document not found." };
  if (!isAdmin(me) && row.employeeId !== me.id) return { ok: false, error: "Forbidden" };

  return { ok: true, document: await toStatusRow(row) };
}

async function toStatusRow(r: DocumentInstance): Promise<DocumentStatusRow> {
  const docType = getDocType(r.typeKey);
  const category = (docType?.category ?? "recruitment") as HrCategory;
  let signatureStatus: string | null = null;
  if (docType?.signature === "esign") {
    const sig = await latestSignature(docKindForCategory(category), r.id);
    signatureStatus = sig?.status ?? null;
  }
  return {
    id: r.id,
    typeKey: r.typeKey,
    title: docType?.title ?? r.typeKey,
    category,
    status: r.status,
    trigger: docType?.trigger ?? "issued",
    signature: docType?.signature ?? "none",
    employeeId: r.employeeId,
    candidateName: r.candidateName,
    candidateEmail: r.candidateEmail,
    renderedPdfPath: r.renderedPdfPath,
    emailedAt: r.emailedAt ? r.emailedAt.toISOString() : null,
    issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    signatureStatus,
  };
}
