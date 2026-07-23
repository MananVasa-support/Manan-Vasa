"use server";

/**
 * Appraisal v2 — ADMIN CONFIG actions.
 *
 * Standing per-employee configuration for the live rolling scorecard: assignees
 * (manager advises · management is FINAL), the six admin-adjustable dimension
 * weights (must sum to 100), the <=5 KPI rows, the <=3 Skills, the incentive
 * target (reference), and the knowledge do/give rule. All writes are ADMIN-only
 * (isAdmin || super-admin — same pattern as /dossier), rate-limited, and
 * zod-validated. Every action returns { ok:true, ... } | { ok:false, error }.
 *
 * Per-item Self/Manager/Management SCORING lives in the (Phase 3) scoring
 * actions — this file only shapes WHAT gets scored.
 */

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  apprAttitude,
  apprConfig,
  apprItemScore,
  apprKpi,
  apprScorecard,
  apprSkill,
  designations,
  employees,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { computeScorecard } from "@/lib/appraisal2/engine";
import {
  APPR_DIMENSIONS,
  ATTITUDE_ITEMS,
  DEFAULT_WEIGHTS,
  type ApprDimension,
  type ConfigRow,
  type ItemKind,
  type ItemScore,
} from "@/lib/appraisal2/types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_KPI = 5;
const MAX_SKILL = 3;

/** Admin-only guard (config is admin-managed; scoring tiers gate elsewhere). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** requireUser + admin + write rate-limit in one shot. */
async function guardAdmin(): Promise<
  { ok: true; me: Employee } | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return { ok: true, me };
}

const Uuid = z.string().uuid();

// ─── weight helpers ─────────────────────────────────────────────────────────

/** jsonb column comes back as `unknown` — coerce to the six-dimension record. */
function toWeights(raw: unknown): Record<ApprDimension, number> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<ApprDimension, number>;
  for (const d of APPR_DIMENSIONS) {
    const v = Number(obj[d]);
    out[d] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[d];
  }
  return out;
}

/** Map a DB config row → the client-safe ConfigRow the engine expects. */
function toConfigRow(row: typeof apprConfig.$inferSelect): ConfigRow {
  return {
    id: row.id,
    employeeId: row.employeeId,
    managerId: row.managerId,
    managementId: row.managementId,
    dimensionWeights: toWeights(row.dimensionWeights),
    incentiveTarget: row.incentiveTarget,
    knowledgeDo: row.knowledgeDo,
    knowledgeGive: row.knowledgeGive,
    updatedById: row.updatedById,
  };
}

// ─── config ─────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  employeeId: Uuid,
  managerId: Uuid.nullable().optional(),
  managementId: Uuid.nullable().optional(),
  incentiveTarget: z
    .union([z.number(), z.string()])
    .nullable()
    .optional(),
  knowledgeDo: z.number().int().min(0).max(999).optional(),
  knowledgeGive: z.number().int().min(0).max(999).optional(),
});

/** Normalise an incoming incentive target into a numeric(14,2) string or null. */
function toMoney(v: number | string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

/**
 * Upsert the standing config (create the row on first touch). Only the fields
 * passed are changed; the rest keep their current / default value. Seeds the 4
 * attitude items whenever the config is first created.
 */
export async function setApprConfig(input: {
  employeeId: string;
  managerId?: string | null;
  managementId?: string | null;
  incentiveTarget?: number | string | null;
  knowledgeDo?: number;
  knowledgeGive?: number;
}): Promise<Result<{ id: string }>> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  const parsed = ConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, managerId, managementId, knowledgeDo, knowledgeGive } = parsed.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const money = toMoney(parsed.data.incentiveTarget);
  const existing = await db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });

  let id: string;
  if (existing) {
    const patch: Partial<typeof apprConfig.$inferInsert> = {
      updatedById: g.me.id,
      updatedAt: new Date(),
    };
    if (managerId !== undefined) patch.managerId = managerId;
    if (managementId !== undefined) patch.managementId = managementId;
    if (money !== undefined) patch.incentiveTarget = money;
    if (knowledgeDo !== undefined) patch.knowledgeDo = knowledgeDo;
    if (knowledgeGive !== undefined) patch.knowledgeGive = knowledgeGive;
    await db.update(apprConfig).set(patch).where(eq(apprConfig.id, existing.id));
    id = existing.id;
  } else {
    const [row] = await db
      .insert(apprConfig)
      .values({
        employeeId,
        managerId: managerId ?? null,
        managementId: managementId ?? null,
        incentiveTarget: money ?? null,
        knowledgeDo: knowledgeDo ?? 1,
        knowledgeGive: knowledgeGive ?? 1,
        updatedById: g.me.id,
      })
      .returning({ id: apprConfig.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    id = row.id;
    await seedAttitude(employeeId);
  }

  revalidatePath("/appraisal/admin");
  revalidatePath("/appraisal");
  return { ok: true, id };
}

const WeightsSchema = z.object({
  employeeId: Uuid,
  weights: z.object({
    incentive: z.number().int().min(0).max(100),
    kpi: z.number().int().min(0).max(100),
    skill: z.number().int().min(0).max(100),
    attitude: z.number().int().min(0).max(100),
    culture: z.number().int().min(0).max(100),
    knowledge: z.number().int().min(0).max(100),
  }),
});

/** Set the six dimension weights (must sum to exactly 100). */
export async function setWeights(input: {
  employeeId: string;
  weights: Record<ApprDimension, number>;
}): Promise<Result> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  const parsed = WeightsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, weights } = parsed.data;

  const sum = APPR_DIMENSIONS.reduce((s, d) => s + weights[d], 0);
  if (sum !== 100) return { ok: false, error: `Weights must sum to 100 (currently ${sum}).` };

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const existing = await db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });
  if (existing) {
    await db
      .update(apprConfig)
      .set({ dimensionWeights: weights, updatedById: g.me.id, updatedAt: new Date() })
      .where(eq(apprConfig.id, existing.id));
  } else {
    await db.insert(apprConfig).values({
      employeeId,
      dimensionWeights: weights,
      updatedById: g.me.id,
    });
    await seedAttitude(employeeId);
  }

  revalidatePath("/appraisal/admin");
  revalidatePath("/appraisal");
  return { ok: true };
}

const AssigneesSchema = z.object({
  employeeId: Uuid,
  managerId: Uuid.nullable().optional(),
  managementId: Uuid.nullable().optional(),
});

/** Set the manager (advisory tier) + management (final tier) assignees. */
export async function setAssignees(input: {
  employeeId: string;
  managerId?: string | null;
  managementId?: string | null;
}): Promise<Result> {
  const parsed = AssigneesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return setApprConfig({
    employeeId: parsed.data.employeeId,
    managerId: parsed.data.managerId,
    managementId: parsed.data.managementId,
  });
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

const KpiSchema = z.object({
  employeeId: Uuid,
  id: Uuid.optional(),
  srNo: z.number().int().min(1).max(99).optional(),
  area: z.string().trim().max(300).optional(),
  measure: z.string().trim().max(600).optional(),
  subWeight: z.number().int().min(0).max(100).default(20),
});

/** Insert or update one KPI row. Enforces the <=5-per-employee cap on insert. */
export async function upsertKpi(input: {
  employeeId: string;
  id?: string;
  srNo?: number;
  area?: string;
  measure?: string;
  subWeight?: number;
}): Promise<Result<{ id: string }>> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  const parsed = KpiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, id, srNo, area, measure, subWeight } = parsed.data;

  if (id) {
    const existing = await db.query.apprKpi.findFirst({ where: eq(apprKpi.id, id) });
    if (!existing || existing.employeeId !== employeeId) {
      return { ok: false, error: "KPI not found." };
    }
    await db
      .update(apprKpi)
      .set({
        srNo: srNo ?? existing.srNo,
        area: area ?? null,
        measure: measure ?? null,
        subWeight,
      })
      .where(eq(apprKpi.id, id));
    revalidatePath("/appraisal/admin");
    return { ok: true, id };
  }

  const rows = await db
    .select({ id: apprKpi.id })
    .from(apprKpi)
    .where(eq(apprKpi.employeeId, employeeId));
  if (rows.length >= MAX_KPI) {
    return { ok: false, error: `Max ${MAX_KPI} KPIs per employee.` };
  }

  const [row] = await db
    .insert(apprKpi)
    .values({
      employeeId,
      srNo: srNo ?? rows.length + 1,
      area: area ?? null,
      measure: measure ?? null,
      subWeight,
      createdById: g.me.id,
    })
    .returning({ id: apprKpi.id });
  if (!row) return { ok: false, error: "Insert returned no row" };
  revalidatePath("/appraisal/admin");
  return { ok: true, id: row.id };
}

/** Delete a KPI row (and any orphaned item-score for it). */
export async function removeKpi(id: string): Promise<Result> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  if (!Uuid.safeParse(id).success) return { ok: false, error: "Invalid id" };
  await db
    .delete(apprItemScore)
    .where(and(eq(apprItemScore.itemKind, "kpi"), eq(apprItemScore.itemId, id)));
  await db.delete(apprKpi).where(eq(apprKpi.id, id));
  revalidatePath("/appraisal/admin");
  return { ok: true };
}

// ─── Skills ─────────────────────────────────────────────────────────────────

const SkillSchema = z.object({
  employeeId: Uuid,
  id: Uuid.optional(),
  name: z.string().trim().max(300).optional(),
  technical: z.boolean().default(false),
  subWeight: z.number().int().min(0).max(100).default(33),
});

/** Insert or update one Skill row. Enforces the <=3-per-employee cap on insert. */
export async function upsertSkill(input: {
  employeeId: string;
  id?: string;
  name?: string;
  technical?: boolean;
  subWeight?: number;
}): Promise<Result<{ id: string }>> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  const parsed = SkillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, id, name, technical, subWeight } = parsed.data;

  if (id) {
    const existing = await db.query.apprSkill.findFirst({ where: eq(apprSkill.id, id) });
    if (!existing || existing.employeeId !== employeeId) {
      return { ok: false, error: "Skill not found." };
    }
    await db
      .update(apprSkill)
      .set({ name: name ?? null, technical, subWeight })
      .where(eq(apprSkill.id, id));
    revalidatePath("/appraisal/admin");
    return { ok: true, id };
  }

  const rows = await db
    .select({ id: apprSkill.id })
    .from(apprSkill)
    .where(eq(apprSkill.employeeId, employeeId));
  if (rows.length >= MAX_SKILL) {
    return { ok: false, error: `Max ${MAX_SKILL} skills per employee.` };
  }

  const [row] = await db
    .insert(apprSkill)
    .values({ employeeId, name: name ?? null, technical, subWeight, createdById: g.me.id })
    .returning({ id: apprSkill.id });
  if (!row) return { ok: false, error: "Insert returned no row" };
  revalidatePath("/appraisal/admin");
  return { ok: true, id: row.id };
}

/** Delete a Skill row (and any orphaned item-score for it). */
export async function removeSkill(id: string): Promise<Result> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  if (!Uuid.safeParse(id).success) return { ok: false, error: "Invalid id" };
  await db
    .delete(apprItemScore)
    .where(and(eq(apprItemScore.itemKind, "skill"), eq(apprItemScore.itemId, id)));
  await db.delete(apprSkill).where(eq(apprSkill.id, id));
  revalidatePath("/appraisal/admin");
  return { ok: true };
}

// ─── Attitude ───────────────────────────────────────────────────────────────

/** Internal: seed the 4 fixed attitude items for an employee (missing keys only). */
async function seedAttitude(employeeId: string): Promise<void> {
  const existing = await db
    .select({ key: apprAttitude.key })
    .from(apprAttitude)
    .where(eq(apprAttitude.employeeId, employeeId));
  const have = new Set(existing.map((r) => r.key));
  const missing = ATTITUDE_ITEMS.filter((a) => !have.has(a.key));
  if (missing.length === 0) return;
  await db.insert(apprAttitude).values(
    missing.map((a) => ({
      employeeId,
      key: a.key,
      label: a.label,
      weight: a.weight,
    })),
  );
}

/** Ensure the 4 attitude items exist for an employee (idempotent). */
export async function ensureAttitudeItems(employeeId: string): Promise<Result> {
  const g = await guardAdmin();
  if (!g.ok) return g;
  if (!Uuid.safeParse(employeeId).success) return { ok: false, error: "Invalid id" };
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  await seedAttitude(employeeId);
  revalidatePath("/appraisal/admin");
  return { ok: true };
}

// ─── Department roster + totals ───────────────────────────────────────────────

export interface DepartmentRosterEntry {
  employee: {
    id: string;
    name: string;
    department: string | null;
    designation: string | null;
  };
  total: number;
  status: string;
}

/**
 * Roster for the admin overview: every active employee (optionally filtered to
 * one department), each with their live computed overall total + status. Loads
 * all appr_* rows in bulk and folds them through the pure engine.
 *
 * NOTE: knowledgePct is 0 here (Training-derived knowledge score is wired in
 * the Phase-3 getScorecard path); it only affects the small Knowledge slice of
 * the overview total.
 */
export async function listByDepartment(
  dept?: string,
): Promise<Result<{ rows: DepartmentRosterEntry[] }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };

  const wantDept = dept && dept.trim() ? dept.trim() : null;
  const empRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(
      wantDept
        ? and(eq(employees.isActive, true), eq(employees.department, wantDept))
        : eq(employees.isActive, true),
    )
    .orderBy(asc(employees.name));

  const ids = empRows.map((e) => e.id);
  if (ids.length === 0) return { ok: true, rows: [] };

  const [configs, kpis, skills, attitude, scores, cards] = await Promise.all([
    db.select().from(apprConfig).where(inArray(apprConfig.employeeId, ids)),
    db.select().from(apprKpi).where(inArray(apprKpi.employeeId, ids)),
    db.select().from(apprSkill).where(inArray(apprSkill.employeeId, ids)),
    db.select().from(apprAttitude).where(inArray(apprAttitude.employeeId, ids)),
    db.select().from(apprItemScore).where(inArray(apprItemScore.employeeId, ids)),
    db.select().from(apprScorecard).where(inArray(apprScorecard.employeeId, ids)),
  ]);

  const byEmp = <T extends { employeeId: string }>(list: T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of list) {
      const arr = m.get(r.employeeId) ?? [];
      arr.push(r);
      m.set(r.employeeId, arr);
    }
    return m;
  };
  const cfgByEmp = new Map(configs.map((c) => [c.employeeId, c]));
  const cardByEmp = new Map(cards.map((c) => [c.employeeId, c]));
  const kpiByEmp = byEmp(kpis);
  const skillByEmp = byEmp(skills);
  const attByEmp = byEmp(attitude);
  const scoreByEmp = byEmp(scores);

  const rows: DepartmentRosterEntry[] = empRows.map((e) => {
    const cfg = cfgByEmp.get(e.id);
    const card = cardByEmp.get(e.id);
    const itemScores: ItemScore[] = (scoreByEmp.get(e.id) ?? []).map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      itemKind: s.itemKind as ItemKind,
      itemId: s.itemId,
      actual: s.actual,
      evidenceUrl: s.evidenceUrl,
      approved: s.approved,
      remarks: s.remarks,
      selfScore: s.selfScore,
      selfNote: s.selfNote,
      managerScore: s.managerScore,
      managerNote: s.managerNote,
      managementScore: s.managementScore,
      managementNote: s.managementNote,
    }));
    const sc = computeScorecard({
      employeeId: e.id,
      config: cfg ? toConfigRow(cfg) : null,
      kpis: kpiByEmp.get(e.id) ?? [],
      skills: skillByEmp.get(e.id) ?? [],
      attitude: (attByEmp.get(e.id) ?? []).map((a) => ({
        id: a.id,
        employeeId: a.employeeId,
        key: a.key,
        label: a.label,
        weight: a.weight,
      })),
      scores: itemScores,
      incentiveScore: card?.incentiveScore ?? null,
      cultureScore: card?.cultureScore ?? null,
      knowledgePct: 0,
      status: card?.status ?? "in_progress",
    });
    return {
      employee: {
        id: e.id,
        name: e.name,
        department: e.department,
        designation: e.designation,
      },
      total: sc.total,
      status: sc.status,
    };
  });

  return { ok: true, rows };
}
