import "server-only";
import { asc, eq } from "drizzle-orm";
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
import { pmsConstitutionPara } from "@/lib/pms/v3/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { computeKnowledgeSharing } from "@/lib/pms/appraisal/training";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { getIncentivePersonDetail } from "@/lib/queries/incentives";
import { computeScorecard } from "@/lib/appraisal2/engine";
import {
  APPR_DIMENSIONS,
  ATTITUDE_ITEMS,
  DEFAULT_WEIGHTS,
  type AppraisalScorecard,
  type ApprDimension,
  type AttitudeRow,
  type ConfigRow,
  type ItemKind,
  type ItemScore,
  type KpiRow,
  type SkillRow,
} from "@/lib/appraisal2/types";

/**
 * Appraisal v2 — the ONE server-side data loader for a live scorecard.
 *
 * Loads the standing config, the KPI/Skill/Attitude definitions (attitude items
 * ensured to the fixed 4), every per-item score, and the single scorecard row,
 * then folds them through the pure engine into a fully-computed
 * {@link AppraisalScorecard}. Also gathers the REFERENCE + AUTO seams the UI
 * shows beside the score:
 *
 *   • Incentive card — target (config), Salary (latest salary-breakup month),
 *     earned + Paid incentive (from the Incentive module). All reference-only;
 *     the Incentive dimension SCORE is entered directly by Management.
 *   • Knowledge Sharing — AUTO: do-N / give-N counts from the Training Centre
 *     (reusing computeKnowledgeSharing), rolled up across the current calendar
 *     year → a 0-100 knowledgePct that feeds the engine.
 *   • Culture — the active Constitution paragraphs (the assessment reference);
 *     the Culture SCORE is entered directly by Management.
 *
 * Every reference pull is defensive (best-effort) so the scorecard renders even
 * when a source module is empty or unmigrated.
 */

// ─── row coercions (mirror the admin path) ────────────────────────────────────

function toWeights(raw: unknown): Record<ApprDimension, number> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<ApprDimension, number>;
  for (const d of APPR_DIMENSIONS) {
    const v = Number(obj[d]);
    out[d] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[d];
  }
  return out;
}

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

function toItemScore(s: typeof apprItemScore.$inferSelect): ItemScore {
  return {
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
  };
}

// ─── knowledge (auto) ─────────────────────────────────────────────────────────

export interface KnowledgeReference {
  done: number;
  given: number;
  doTarget: number;
  giveTarget: number;
  /** true when the Training Centre had any matching session this year. */
  wired: boolean;
  /** 0-100 attainment — average of the two capped ratios × 100. */
  pct: number;
}

/**
 * Roll up the Training-derived do/give counts across the current calendar year
 * (Jan → current month), then turn them into a 0-100 attainment against the
 * config's do-N / give-N rule. Best-effort — any failure yields zeros.
 */
async function computeKnowledge(
  employeeId: string,
  doTarget: number,
  giveTarget: number,
): Promise<KnowledgeReference> {
  let done = 0;
  let given = 0;
  let wired = false;
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const lastMonth = now.getUTCMonth() + 1; // 1-based
    for (let m = 1; m <= lastMonth; m++) {
      const period = `${year}-${String(m).padStart(2, "0")}`;
      const c = await computeKnowledgeSharing(employeeId, period);
      done += c.done;
      given += c.given;
      if (c.wired) wired = true;
    }
  } catch {
    // Training not migrated / query failed — keep zeros (manual seam alive).
  }
  const doPct = doTarget > 0 ? Math.min(done / doTarget, 1) : 1;
  const givePct = giveTarget > 0 ? Math.min(given / giveTarget, 1) : 1;
  const pct = Math.round(((doPct + givePct) / 2) * 100 * 10) / 10;
  return { done, given, doTarget, giveTarget, wired, pct };
}

// ─── reference (incentive + salary) ───────────────────────────────────────────

export interface SalaryReference {
  month: string | null;
  monthlyCtc: string | null;
  annualCtc: string | null;
  finalPayment: string | null;
}

export interface IncentiveReference {
  /** config.incentive_target (numeric string) — reference only. */
  target: string | null;
  /** earned (approved) incentive YTD. */
  earned: number;
  /** paid incentive YTD. */
  paid: number;
}

// ─── constitution (culture reference) ─────────────────────────────────────────

export interface ConstitutionItem {
  id: string;
  position: number;
  title: string | null;
  body: string;
}

/** The active, scorable (non-heading) Constitution paragraphs, in order. */
async function loadConstitution(): Promise<ConstitutionItem[]> {
  try {
    const rows = await db
      .select({
        id: pmsConstitutionPara.id,
        position: pmsConstitutionPara.position,
        title: pmsConstitutionPara.title,
        body: pmsConstitutionPara.body,
      })
      .from(pmsConstitutionPara)
      .where(eq(pmsConstitutionPara.active, true))
      .orderBy(asc(pmsConstitutionPara.position));
    return rows
      .filter((r) => r.body && r.body.trim().length > 0)
      .map((r) => ({ id: r.id, position: r.position, title: r.title, body: r.body }));
  } catch {
    return [];
  }
}

// ─── viewer capabilities ──────────────────────────────────────────────────────

export interface ViewerCaps {
  isAdmin: boolean;
  canSelfScore: boolean;
  canManagerScore: boolean;
  canManagementScore: boolean;
}

// ─── the full payload ─────────────────────────────────────────────────────────

export interface ScorecardData {
  employee: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    designation: string | null;
  };
  scorecard: AppraisalScorecard;
  config: ConfigRow | null;
  kpis: KpiRow[];
  skills: SkillRow[];
  attitude: AttitudeRow[];
  scores: ItemScore[];
  card: {
    incentiveScore: number | null;
    incentiveNote: string | null;
    cultureScore: number | null;
    status: string;
    finalizedAt: Date | null;
  } | null;
  reference: {
    incentive: IncentiveReference;
    salary: SalaryReference | null;
    knowledge: KnowledgeReference;
  };
  constitution: ConstitutionItem[];
  viewer: ViewerCaps;
}

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Load everything the Appraisal UI needs for ONE employee's live scorecard.
 *
 * Guarded: the caller passes the signed-in `me`; access is allowed for admin,
 * the employee themselves, the assigned manager, or the assigned management.
 * Returns null when the employee doesn't exist; throws "Forbidden" when the
 * viewer has no right to see this scorecard.
 */
export async function getScorecardData(
  employeeId: string,
  me: Employee,
): Promise<ScorecardData | null> {
  const [emp] = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatarUrl: employees.avatarUrl,
      department: employees.department,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  // Load config first (needed for the access check + engine + knowledge rule).
  const cfgRow = await db.query.apprConfig.findFirst({
    where: eq(apprConfig.employeeId, employeeId),
  });

  const admin = isAdmin(me);
  const isSelf = me.id === employeeId;
  const isMgr = cfgRow?.managerId === me.id;
  const isMgmt = cfgRow?.managementId === me.id || isSuperAdmin(me.email);
  if (!admin && !isSelf && !isMgr && !isMgmt) {
    throw new Error("Forbidden");
  }

  // Ensure the 4 fixed attitude items exist (idempotent, missing-keys only).
  const attRows = await db
    .select()
    .from(apprAttitude)
    .where(eq(apprAttitude.employeeId, employeeId));
  const haveKeys = new Set(attRows.map((a) => a.key));
  const missing = ATTITUDE_ITEMS.filter((a) => !haveKeys.has(a.key));
  if (missing.length > 0) {
    await db.insert(apprAttitude).values(
      missing.map((a) => ({
        employeeId,
        key: a.key,
        label: a.label,
        weight: a.weight,
      })),
    );
  }

  const [kpiRows, skillRows, attitudeRows, scoreRows, cardRow] = await Promise.all([
    db.select().from(apprKpi).where(eq(apprKpi.employeeId, employeeId)).orderBy(asc(apprKpi.srNo), asc(apprKpi.createdAt)),
    db.select().from(apprSkill).where(eq(apprSkill.employeeId, employeeId)).orderBy(asc(apprSkill.createdAt)),
    db.select().from(apprAttitude).where(eq(apprAttitude.employeeId, employeeId)).orderBy(asc(apprAttitude.createdAt)),
    db.select().from(apprItemScore).where(eq(apprItemScore.employeeId, employeeId)),
    db
      .select()
      .from(apprScorecard)
      .where(eq(apprScorecard.employeeId, employeeId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const config = cfgRow ? toConfigRow(cfgRow) : null;
  const kpis: KpiRow[] = kpiRows.map((k) => ({
    id: k.id,
    employeeId: k.employeeId,
    srNo: k.srNo,
    area: k.area,
    measure: k.measure,
    subWeight: k.subWeight,
  }));
  const skills: SkillRow[] = skillRows.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    name: s.name,
    technical: s.technical,
    subWeight: s.subWeight,
  }));
  const attitude: AttitudeRow[] = attitudeRows.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    key: a.key,
    label: a.label,
    weight: a.weight,
  }));
  const scores: ItemScore[] = scoreRows.map(toItemScore);

  // AUTO knowledge-sharing pct (Training seam, YTD).
  const doTarget = cfgRow?.knowledgeDo ?? 1;
  const giveTarget = cfgRow?.knowledgeGive ?? 1;
  const knowledge = await computeKnowledge(employeeId, doTarget, giveTarget);

  const incentiveScore = cardRow?.incentiveScore ?? null;
  const cultureScore = cardRow?.cultureScore ?? null;

  const scorecard = computeScorecard({
    employeeId,
    config,
    kpis,
    skills,
    attitude,
    scores,
    incentiveScore,
    cultureScore,
    knowledgePct: knowledge.pct,
    status: cardRow?.status ?? "in_progress",
  });

  // Reference: salary (latest month) + earned/paid incentive (YTD).
  let salary: SalaryReference | null = null;
  try {
    const rows = await mySalaryBreakup(employeeId);
    const latest = rows[0];
    if (latest) {
      salary = {
        month: latest.month,
        monthlyCtc: latest.monthlyCtc,
        annualCtc: latest.annualCtc,
        finalPayment: latest.finalPayment,
      };
    }
  } catch {
    salary = null;
  }

  let earned = 0;
  let paid = 0;
  try {
    const detail = await getIncentivePersonDetail(emp.name, new Date().getUTCFullYear());
    earned = detail.totals.totalApproved;
    paid = detail.totals.totalPaid;
  } catch {
    earned = 0;
    paid = 0;
  }

  const constitution = await loadConstitution();

  return {
    employee: {
      id: emp.id,
      name: emp.name,
      avatarUrl: emp.avatarUrl,
      department: emp.department,
      designation: emp.designation,
    },
    scorecard,
    config,
    kpis,
    skills,
    attitude,
    scores,
    card: cardRow
      ? {
          incentiveScore: cardRow.incentiveScore,
          incentiveNote: cardRow.incentiveNote,
          cultureScore: cardRow.cultureScore,
          status: cardRow.status,
          finalizedAt: cardRow.finalizedAt,
        }
      : null,
    reference: {
      incentive: { target: cfgRow?.incentiveTarget ?? null, earned, paid },
      salary,
      knowledge,
    },
    constitution,
    viewer: {
      isAdmin: admin,
      canSelfScore: isSelf,
      canManagerScore: isMgr || admin,
      canManagementScore: isMgmt || admin,
    },
  };
}
