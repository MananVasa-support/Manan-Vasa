"use server";

/**
 * Appraisal v2 — SCORING actions (the tier-guarded writes).
 *
 * Each scored item carries three advisory-vs-final scores: Self (the employee),
 * Manager (the assigned config.manager_id — advisory) and Management (the
 * assigned config.management_id / super-admin — the FINAL score that counts).
 * All scores are PERCENT 0-100.
 *
 * TIER GUARD:
 *   • self       → only the employee themselves may write self_score/self_note.
 *   • manager    → only the assigned manager (config.manager_id) or an admin.
 *   • management → only the assigned management (config.management_id), a
 *                  super-admin, or an admin. Management is FINAL.
 * actual / evidence_url / approved / remarks are writable by manager or
 * management only (never self).
 *
 * Incentive (direct management score) + Culture (constitution assessment, direct
 * management score) live on the single appr_scorecard row and are management/
 * admin only. finalizeScorecard flips that row to 'finalized' and, best-effort,
 * composes an Appraisal HR letter — never failing the finalize if HR-docs is
 * absent or throws.
 *
 * Every action returns { ok:true, ... } | { ok:false, error }.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  apprConfig,
  apprAttitude,
  apprItemScore,
  apprKpi,
  apprScorecard,
  apprSkill,
  employees,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import type { ItemKind, ScoreTier } from "@/lib/appraisal2/types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const Uuid = z.string().uuid();
const Score = z.number().int().min(0).max(100);

/** Admin = the isAdmin flag OR a super-admin email (same as the config file). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** requireUser + a write rate-limit in one shot. */
async function guard(): Promise<
  { ok: true; me: Employee } | { ok: false; error: string }
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return { ok: true, me };
}

/** The standing config row for an employee (assignees live here). */
async function loadConfig(employeeId: string) {
  return db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });
}

/** Verify the item exists and belongs to the employee for its kind. */
async function itemBelongs(
  itemKind: ItemKind,
  itemId: string,
  employeeId: string,
): Promise<boolean> {
  if (itemKind === "kpi") {
    const r = await db.query.apprKpi.findFirst({ where: eq(apprKpi.id, itemId) });
    return !!r && r.employeeId === employeeId;
  }
  if (itemKind === "skill") {
    const r = await db.query.apprSkill.findFirst({ where: eq(apprSkill.id, itemId) });
    return !!r && r.employeeId === employeeId;
  }
  const [r] = await db
    .select({ employeeId: apprAttitude.employeeId })
    .from(apprAttitude)
    .where(eq(apprAttitude.id, itemId))
    .limit(1);
  return !!r && r.employeeId === employeeId;
}

// ─── setItemScore ─────────────────────────────────────────────────────────────

const ItemScoreSchema = z.object({
  employeeId: Uuid,
  itemKind: z.enum(["kpi", "skill", "attitude"]),
  itemId: Uuid,
  tier: z.enum(["self", "manager", "management"]),
  score: Score,
  note: z.string().trim().max(2000).optional(),
  actual: z.string().trim().max(600).optional(),
  evidenceUrl: z.string().trim().max(1000).url().optional().or(z.literal("")),
  approved: z.boolean().optional(),
  remarks: z.string().trim().max(2000).optional(),
});

/**
 * Upsert one item's score at the given tier (keyed by the UNIQUE
 * (item_kind, item_id)). Tier-guarded per the module contract. Only the columns
 * that tier owns are written; the other tiers' scores are left untouched.
 */
export async function setItemScore(input: {
  employeeId: string;
  itemKind: ItemKind;
  itemId: string;
  tier: ScoreTier;
  score: number;
  note?: string;
  actual?: string;
  evidenceUrl?: string;
  approved?: boolean;
  remarks?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = ItemScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, itemKind, itemId, tier, score, note, actual, remarks } = parsed.data;
  const evidenceUrl = parsed.data.evidenceUrl || undefined;
  const approved = parsed.data.approved;

  if (!(await itemBelongs(itemKind, itemId, employeeId))) {
    return { ok: false, error: "Item not found for this employee." };
  }

  const me = g.me;
  const admin = isAdmin(me);
  const cfg = await loadConfig(employeeId);

  // Tier guard.
  if (tier === "self") {
    if (me.id !== employeeId) {
      return { ok: false, error: "Only the employee can enter their self score." };
    }
  } else if (tier === "manager") {
    const isMgr = cfg?.managerId === me.id || admin;
    if (!isMgr) return { ok: false, error: "Only the assigned manager can enter the manager score." };
  } else {
    const isMgmt = cfg?.managementId === me.id || isSuperAdmin(me.email) || admin;
    if (!isMgmt) return { ok: false, error: "Only management can enter the final score." };
  }

  // The columns this tier owns. actual/evidence/approved/remarks are only
  // writable by manager/management (never self).
  const patch: Partial<typeof apprItemScore.$inferInsert> = {
    updatedById: me.id,
    updatedAt: new Date(),
  };
  if (tier === "self") {
    patch.selfScore = score;
    if (note !== undefined) patch.selfNote = note || null;
  } else if (tier === "manager") {
    patch.managerScore = score;
    if (note !== undefined) patch.managerNote = note || null;
  } else {
    patch.managementScore = score;
    if (note !== undefined) patch.managementNote = note || null;
  }
  if (tier !== "self") {
    if (actual !== undefined) patch.actual = actual || null;
    if (evidenceUrl !== undefined) patch.evidenceUrl = evidenceUrl || null;
    if (approved !== undefined) patch.approved = approved;
    if (remarks !== undefined) patch.remarks = remarks || null;
  }

  const [row] = await db
    .insert(apprItemScore)
    .values({
      employeeId,
      itemKind,
      itemId,
      ...patch,
    })
    .onConflictDoUpdate({
      target: [apprItemScore.itemKind, apprItemScore.itemId],
      set: patch,
    })
    .returning({ id: apprItemScore.id });
  if (!row) return { ok: false, error: "Upsert returned no row" };

  revalidatePath("/appraisal");
  return { ok: true, id: row.id };
}

// ─── scorecard-row helpers (incentive + culture + status) ─────────────────────

/** Management/admin guard for the direct-score scorecard writes. */
function canManage(me: Employee, cfg: { managementId: string | null } | undefined): boolean {
  return cfg?.managementId === me.id || isSuperAdmin(me.email) || isAdmin(me);
}

/** Upsert the single appr_scorecard row for an employee, patching the given fields. */
async function upsertScorecard(
  employeeId: string,
  patch: Partial<typeof apprScorecard.$inferInsert>,
  actorId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: apprScorecard.id })
    .from(apprScorecard)
    .where(eq(apprScorecard.employeeId, employeeId))
    .limit(1);
  if (existing) {
    await db
      .update(apprScorecard)
      .set({ ...patch, updatedById: actorId, updatedAt: new Date() })
      .where(eq(apprScorecard.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(apprScorecard)
    .values({ employeeId, ...patch, updatedById: actorId })
    .returning({ id: apprScorecard.id });
  return row!.id;
}

const IncentiveScoreSchema = z.object({
  employeeId: Uuid,
  score: Score,
  note: z.string().trim().max(2000).optional(),
});

/** Set the Incentive dimension score (direct, management/admin only). */
export async function setIncentiveScore(input: {
  employeeId: string;
  score: number;
  note?: string;
}): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = IncentiveScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, score, note } = parsed.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const cfg = await loadConfig(employeeId);
  if (!canManage(g.me, cfg)) return { ok: false, error: "Only management can set the incentive score." };

  const id = await upsertScorecard(
    employeeId,
    { incentiveScore: score, incentiveNote: note ?? null },
    g.me.id,
  );
  revalidatePath("/appraisal");
  return { ok: true, id };
}

const CultureScoreSchema = z.object({
  employeeId: Uuid,
  score: Score,
});

/** Set the Culture (constitution assessment) score (direct, management/admin only). */
export async function setCultureScore(input: {
  employeeId: string;
  score: number;
}): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = CultureScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { employeeId, score } = parsed.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const cfg = await loadConfig(employeeId);
  if (!canManage(g.me, cfg)) return { ok: false, error: "Only management can set the culture score." };

  const id = await upsertScorecard(employeeId, { cultureScore: score }, g.me.id);
  revalidatePath("/appraisal");
  return { ok: true, id };
}

// ─── finalizeScorecard ────────────────────────────────────────────────────────

/**
 * Best-effort: compose an Appraisal HR letter for the employee via the HR-docs
 * module (typeKey 'appraisal_ctc') if that module is present. NEVER throws — a
 * missing module, missing template, or any error is swallowed so finalize
 * always succeeds.
 */
async function composeAppraisalLetter(employeeId: string): Promise<void> {
  try {
    const mod = (await import("@/app/(app)/hr-docs/actions")) as {
      composeDocument?: (input: {
        typeKey: string;
        employeeId?: string | null;
      }) => Promise<{ ok: boolean } | undefined>;
    };
    if (typeof mod.composeDocument === "function") {
      await mod.composeDocument({ typeKey: "appraisal_ctc", employeeId });
    }
  } catch {
    // HR-docs not present / template missing / any error → ignore.
  }
}

/**
 * Finalize the live scorecard — flip status to 'finalized' + stamp finalized_at.
 * Management (config.management_id) / super-admin / admin only. Optionally
 * composes an Appraisal letter (best-effort).
 */
export async function finalizeScorecard(employeeId: string): Promise<Result<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!Uuid.safeParse(employeeId).success) return { ok: false, error: "Invalid id" };

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };
  const cfg = await loadConfig(employeeId);
  if (!canManage(g.me, cfg)) return { ok: false, error: "Only management can finalize the scorecard." };

  const id = await upsertScorecard(
    employeeId,
    { status: "finalized", finalizedAt: new Date() },
    g.me.id,
  );

  await composeAppraisalLetter(employeeId);

  revalidatePath("/appraisal");
  return { ok: true, id };
}
