"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ctcBreakups,
  documentInstances,
  documentSignatures,
  letterTemplates,
  employees,
  designations,
  type CtcBreakup,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { resolveMerge, applyMerge, formatMergeDate } from "@/lib/hr-docs/merge";
import { emptyCtcFields, type CtcFields, type CtcReason, type GrowthStep } from "@/lib/hr-docs/types";
import { renderCtcPdf } from "@/lib/hr-docs/render";
import { errorMessage } from "@/lib/email/resend";
import type { DocKind } from "@/lib/documents/signing";

/**
 * HR Letters / Documents engine — Phase 2 CTC ACTIONS (Node.js runtime).
 *
 * The NEW HR compensation engine (category D). Structured CTC versions live in
 * `ctc_breakups` (UNIQUE employee_id+version); each renderCtcLetter emits a
 * `document_instances` row (typeKey per reason) so the CTC letter joins the same
 * status + e-sign machinery as every other document. Admin/HR-only, rate-limited,
 * zod-validated. Money fields are numeric-as-string throughout.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** compensation letters are 'letter' kind (category !== 'appointment'). */
const CTC_DOC_KIND: DocKind = "letter";

const REASON_TYPE_KEY: Record<CtcReason, string> = {
  initial: "ctc_breakup",
  promotion: "promotion_ctc",
  appraisal: "appraisal_ctc",
};

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

const AllowanceSchema = z.object({ name: z.string().max(120), amount: z.string().max(24) });
const GrowthStepSchema = z.object({
  id: z.string().max(64),
  date: z.string().max(60),
  title: z.string().max(200),
  detail: z.string().max(2000),
});

const CtcFieldsSchema = z
  .object({
    employeeName: z.string().max(200),
    designation: z.string().max(200),
    dateOfJoining: z.string().max(60),
    reportingManager: z.string().max(200),
    pctPerMonth: z.string().max(24),
    pctPerAnnum: z.string().max(24),
    basic: z.string().max(24),
    hra: z.string().max(24),
    statutoryBonus: z.string().max(24),
    medical: z.string().max(24),
    attire: z.string().max(24),
    otherAllowances: z.array(AllowanceSchema).max(40),
    professionalTax: z.string().max(24),
    providentFund: z.string().max(24),
    incomeTax: z.string().max(24),
    netSalary: z.string().max(24),
    retentionBonus: z.string().max(24),
    costToCompany: z.string().max(24),
    notes: z.array(z.string().max(500)).max(40),
    extraNotes: z.string().max(4000),
  })
  .partial();

const ReasonSchema = z.enum(["initial", "promotion", "appraisal"]);

/** Normalise an arbitrary partial fields payload into a full, well-typed CtcFields. */
function normaliseFields(input: unknown): CtcFields {
  const parsed = CtcFieldsSchema.safeParse(input ?? {});
  const data = parsed.success ? parsed.data : {};
  return { ...emptyCtcFields(), ...data } as CtcFields;
}

/** Cast a persisted jsonb value into a CtcFields (defaults fill any gap). */
function fieldsFromRow(row: CtcBreakup): CtcFields {
  return { ...emptyCtcFields(), ...(row.fields as Partial<CtcFields>) };
}

function journeyFromRow(row: CtcBreakup): GrowthStep[] {
  const j = row.growthJourney;
  return Array.isArray(j) ? (j as GrowthStep[]) : [];
}

/* ------------------------------------------------------------------ */
/* Versions — create / update / list / new version                     */
/* ------------------------------------------------------------------ */

export interface CtcVersionRow {
  id: string;
  employeeId: string;
  version: number;
  reason: string;
  effectiveDate: string | null;
  fields: CtcFields;
  growthJourney: GrowthStep[];
  createdAt: string;
  updatedAt: string;
}

function toVersionRow(r: CtcBreakup): CtcVersionRow {
  return {
    id: r.id,
    employeeId: r.employeeId,
    version: r.version,
    reason: r.reason,
    effectiveDate: r.effectiveDate,
    fields: fieldsFromRow(r),
    growthJourney: journeyFromRow(r),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Highest existing version for an employee (0 when none). */
async function maxVersion(employeeId: string): Promise<number> {
  const [row] = await db
    .select({ version: ctcBreakups.version })
    .from(ctcBreakups)
    .where(eq(ctcBreakups.employeeId, employeeId))
    .orderBy(desc(ctcBreakups.version))
    .limit(1);
  return row?.version ?? 0;
}

const CreateCtcSchema = z.object({
  employeeId: UUID,
  reason: ReasonSchema.default("initial"),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  fields: z.unknown().optional(),
});

/** Create a new CTC breakup version for an employee (auto-numbered). Admin/HR. */
export async function createCtcBreakup(input: {
  employeeId: string;
  reason?: CtcReason;
  effectiveDate?: string | null;
  fields?: Partial<CtcFields>;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateCtcSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsed.data.employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const fields = normaliseFields(parsed.data.fields);
  const version = (await maxVersion(parsed.data.employeeId)) + 1;

  let row: CtcBreakup | undefined;
  try {
    [row] = await db
      .insert(ctcBreakups)
      .values({
        employeeId: parsed.data.employeeId,
        version,
        reason: parsed.data.reason,
        effectiveDate: parsed.data.effectiveDate ?? null,
        fields,
        growthJourney: [],
        createdById: me.id,
      })
      .returning();
  } catch (err) {
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }
  if (!row) return { ok: false, error: "Could not create the CTC version." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: toVersionRow(row) };
}

const UpdateFieldsSchema = z.object({
  id: UUID,
  fields: z.unknown(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/** Replace the structured fields (and optional effective date) of a CTC version. */
export async function updateCtcFields(input: {
  id: string;
  fields: Partial<CtcFields>;
  effectiveDate?: string | null;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const fields = normaliseFields(parsed.data.fields);
  const patch: Partial<typeof ctcBreakups.$inferInsert> = { fields, updatedAt: new Date() };
  if (parsed.data.effectiveDate !== undefined) patch.effectiveDate = parsed.data.effectiveDate ?? null;

  const [row] = await db
    .update(ctcBreakups)
    .set(patch)
    .where(eq(ctcBreakups.id, parsed.data.id))
    .returning();
  if (!row) return { ok: false, error: "CTC version not found." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: toVersionRow(row) };
}

/** All CTC versions for an employee, newest version first. Admin/HR. */
export async function listCtcVersions(
  employeeId: string,
): Promise<Result<{ versions: CtcVersionRow[] }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!UUID.safeParse(employeeId).success) return { ok: false, error: "Invalid employee." };

  const rows = await db
    .select()
    .from(ctcBreakups)
    .where(eq(ctcBreakups.employeeId, employeeId))
    .orderBy(desc(ctcBreakups.version));
  return { ok: true, versions: rows.map(toVersionRow) };
}

const NewVersionSchema = z.object({
  employeeId: UUID,
  reason: ReasonSchema,
  baseVersion: z.number().int().positive().optional(),
});

/**
 * Clone the latest (or a specified base) version's fields into a fresh, higher
 * version number and stamp the new reason. Growth journey is carried forward.
 * Admin/HR.
 */
export async function newCtcVersion(input: {
  employeeId: string;
  reason: CtcReason;
  baseVersion?: number;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = NewVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const base = parsed.data.baseVersion
    ? (
        await db
          .select()
          .from(ctcBreakups)
          .where(
            and(
              eq(ctcBreakups.employeeId, parsed.data.employeeId),
              eq(ctcBreakups.version, parsed.data.baseVersion),
            ),
          )
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(ctcBreakups)
          .where(eq(ctcBreakups.employeeId, parsed.data.employeeId))
          .orderBy(desc(ctcBreakups.version))
          .limit(1)
      )[0];

  if (!base) return { ok: false, error: "No base CTC version to clone." };

  const version = (await maxVersion(parsed.data.employeeId)) + 1;

  let row: CtcBreakup | undefined;
  try {
    [row] = await db
      .insert(ctcBreakups)
      .values({
        employeeId: parsed.data.employeeId,
        version,
        reason: parsed.data.reason,
        effectiveDate: base.effectiveDate,
        fields: fieldsFromRow(base),
        growthJourney: journeyFromRow(base),
        createdById: me.id,
      })
      .returning();
  } catch (err) {
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }
  if (!row) return { ok: false, error: "Could not create the new version." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: toVersionRow(row) };
}

/* ------------------------------------------------------------------ */
/* Growth journey — add / edit / remove                                 */
/* ------------------------------------------------------------------ */

async function loadCtc(id: string): Promise<CtcBreakup | null> {
  const [row] = await db.select().from(ctcBreakups).where(eq(ctcBreakups.id, id)).limit(1);
  return row ?? null;
}

async function saveJourney(id: string, journey: GrowthStep[]): Promise<CtcVersionRow | null> {
  const [row] = await db
    .update(ctcBreakups)
    .set({ growthJourney: journey, updatedAt: new Date() })
    .where(eq(ctcBreakups.id, id))
    .returning();
  return row ? toVersionRow(row) : null;
}

const AddStepSchema = z.object({
  id: UUID,
  date: z.string().max(60).default(""),
  title: z.string().max(200).default(""),
  detail: z.string().max(2000).default(""),
});

/** Append a growth-journey step to a CTC version. Admin/HR. */
export async function addGrowthStep(input: {
  id: string;
  date?: string;
  title?: string;
  detail?: string;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const row = await loadCtc(parsed.data.id);
  if (!row) return { ok: false, error: "CTC version not found." };

  const journey = journeyFromRow(row);
  journey.push({
    id: randomUUID(),
    date: parsed.data.date,
    title: parsed.data.title,
    detail: parsed.data.detail,
  });
  const saved = await saveJourney(parsed.data.id, journey);
  if (!saved) return { ok: false, error: "Could not save the growth step." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: saved };
}

const EditStepSchema = z.object({
  id: UUID,
  stepId: z.string().min(1).max(64),
  date: z.string().max(60).optional(),
  title: z.string().max(200).optional(),
  detail: z.string().max(2000).optional(),
});

/** Edit an existing growth-journey step (by its step id). Admin/HR. */
export async function editGrowthStep(input: {
  id: string;
  stepId: string;
  date?: string;
  title?: string;
  detail?: string;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EditStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const row = await loadCtc(parsed.data.id);
  if (!row) return { ok: false, error: "CTC version not found." };

  const journey = journeyFromRow(row);
  const idx = journey.findIndex((s) => s.id === parsed.data.stepId);
  if (idx < 0) return { ok: false, error: "Growth step not found." };
  const cur = journey[idx]!;
  journey[idx] = {
    id: cur.id,
    date: parsed.data.date ?? cur.date,
    title: parsed.data.title ?? cur.title,
    detail: parsed.data.detail ?? cur.detail,
  };
  const saved = await saveJourney(parsed.data.id, journey);
  if (!saved) return { ok: false, error: "Could not save the growth step." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: saved };
}

const RemoveStepSchema = z.object({ id: UUID, stepId: z.string().min(1).max(64) });

/** Remove a growth-journey step (by its step id). Admin/HR. */
export async function removeGrowthStep(input: {
  id: string;
  stepId: string;
}): Promise<Result<{ ctc: CtcVersionRow }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const row = await loadCtc(parsed.data.id);
  if (!row) return { ok: false, error: "CTC version not found." };

  const journey = journeyFromRow(row).filter((s) => s.id !== parsed.data.stepId);
  const saved = await saveJourney(parsed.data.id, journey);
  if (!saved) return { ok: false, error: "Could not save the growth journey." };

  revalidatePath("/hr-docs");
  return { ok: true, ctc: saved };
}

/* ------------------------------------------------------------------ */
/* Render the CTC letter → PDF → instance (+ optional e-sign)           */
/* ------------------------------------------------------------------ */

/** Resolve a small merge map for the CTC intro paragraph (name/date/etc.). */
async function ctcIntroMap(
  employeeId: string,
  fields: CtcFields,
): Promise<Record<string, string>> {
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  const extra: Record<string, string> = {};
  if (fields.designation) extra.designation = fields.designation;
  if (fields.reportingManager) extra.reportingManager = fields.reportingManager;
  extra.date = formatMergeDate(new Date());

  if (emp?.designationId && !extra.designation) {
    const [d] = await db
      .select({ name: designations.name })
      .from(designations)
      .where(eq(designations.id, emp.designationId))
      .limit(1);
    if (d?.name) extra.designation = d.name;
  }

  return resolveMerge(
    emp
      ? { name: emp.name, email: emp.email, department: emp.department, joinedAt: emp.joinedAt }
      : { name: fields.employeeName },
    extra,
  );
}

/**
 * Render a CTC version to a PDF, archive it, and emit a `document_instances`
 * row (typeKey per reason) plus a pending e-sign row so the CTC letter joins the
 * same status + signing machinery as every other document. Admin/HR. Returns the
 * PDF path + the new instance id.
 */
export async function renderCtcLetter(input: {
  id: string;
}): Promise<Result<{ pdfPath: string; instanceId: string; signatureId: string | null }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!UUID.safeParse(input.id).success) return { ok: false, error: "Invalid CTC version." };

  const row = await loadCtc(input.id);
  if (!row) return { ok: false, error: "CTC version not found." };

  const reason = (ReasonSchema.safeParse(row.reason).success ? row.reason : "initial") as CtcReason;
  const typeKey = REASON_TYPE_KEY[reason];
  const fields = fieldsFromRow(row);

  // Intro paragraph from the (admin-editable) template body, merge-resolved.
  const [tpl] = await db
    .select()
    .from(letterTemplates)
    .where(eq(letterTemplates.typeKey, typeKey))
    .limit(1);
  let introText = "";
  if (tpl?.bodyMd) {
    const map = await ctcIntroMap(row.employeeId, fields);
    introText = applyMerge(tpl.bodyMd, map);
  }

  const title = tpl?.title ?? undefined;

  // ── Render ──
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderCtcPdf({
      ctc: {
        fields,
        growthJourney: journeyFromRow(row),
        version: row.version,
        reason,
        effectiveDate: row.effectiveDate,
        title,
        introText,
      },
    });
  } catch (err) {
    return { ok: false, error: `Could not render the CTC letter: ${errorMessage(err)}` };
  }

  // ── Upload ──
  const pdfPath = `${row.employeeId}/hr-docs/${randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // ── Emit the document instance ──
  const issuedAt = new Date();
  let instanceId: string;
  try {
    const [inst] = await db
      .insert(documentInstances)
      .values({
        typeKey,
        employeeId: row.employeeId,
        status: "sent",
        mergeValues: {},
        bodySnapshotMd: introText,
        renderedPdfPath: pdfPath,
        issuedById: me.id,
        issuedAt,
        updatedAt: issuedAt,
      })
      .returning({ id: documentInstances.id });
    if (!inst) throw new Error("insert returned no row");
    instanceId = inst.id;
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pdfPath]).catch(() => {});
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }

  // ── Pending e-sign row (CTC letters are esign) ──
  let signatureId: string | null = null;
  try {
    const [sig] = await db
      .insert(documentSignatures)
      .values({
        docKind: CTC_DOC_KIND,
        docId: instanceId,
        signerEmployeeId: row.employeeId,
        status: "pending",
        createdById: me.id,
      })
      .returning({ id: documentSignatures.id });
    signatureId = sig?.id ?? null;
  } catch {
    // Non-fatal — the CTC letter is archived; signing can start later.
    signatureId = null;
  }

  revalidatePath("/hr-docs");
  return { ok: true, pdfPath, instanceId, signatureId };
}
