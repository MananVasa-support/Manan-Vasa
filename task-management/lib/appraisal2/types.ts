/**
 * Appraisal v2 — client-safe shared types + constants.
 *
 * NO server imports here (no "server-only", no db) — this module is imported by
 * both server actions and client components, so it must stay pure/isomorphic.
 *
 * ONE LIVE ROLLING SCORECARD per employee. Management is the FINAL authority:
 * each item is scored Self (advisory) + Manager (advisory) + Management (final,
 * the one that counts). All item scores are PERCENT 0-100, weighted by each
 * item's sub-weight into its dimension %. 6 dimensions, admin-adjustable
 * weights summing to 100. Overall /100 = Σ(dimensionPct × dimensionWeight/100).
 */

/** The six appraisal dimensions, in display order. */
export const APPR_DIMENSIONS = [
  "incentive",
  "kpi",
  "skill",
  "attitude",
  "culture",
  "knowledge",
] as const;

export type ApprDimension = (typeof APPR_DIMENSIONS)[number];

/** Human labels for each dimension. */
export const DIMENSION_LABELS: Record<ApprDimension, string> = {
  incentive: "Incentive",
  kpi: "KPI",
  skill: "Skill",
  attitude: "Attitude & Mindset",
  culture: "Culture",
  knowledge: "Knowledge Sharing",
};

/** Default (admin-adjustable) dimension weights — MUST sum to 100. */
export const DEFAULT_WEIGHTS: Record<ApprDimension, number> = {
  incentive: 30,
  kpi: 30,
  skill: 10,
  attitude: 20,
  culture: 5,
  knowledge: 5,
};

/** Tier that produced a score. Management is FINAL. */
export type ScoreTier = "self" | "manager" | "management";

/** Item kinds that carry per-item Self/Manager/Management scores. */
export type ItemKind = "kpi" | "skill" | "attitude";

/**
 * The 4 fixed Attitude & Mindset items (each weight 5 → 20 total). Seeded per
 * employee via ensureAttitudeItems.
 */
export const ATTITUDE_ITEMS: { key: string; label: string; weight: number }[] = [
  { key: "problem_solving", label: "Problem Solving", weight: 5 },
  { key: "growth_mindset", label: "Growth Mindset", weight: 5 },
  { key: "get_things_done", label: "Get Things Done", weight: 5 },
  { key: "empower_work", label: "Empower Work", weight: 5 },
];

/** Rating band for a 0-100 pct. >=80 green · >=60 amber · else red. */
export type RatingBand = "green" | "amber" | "red";

export function ratingBand(pct: number): { band: RatingBand; color: string; label: string } {
  if (pct >= 80) return { band: "green", color: "#16a34a", label: "Strong" };
  if (pct >= 60) return { band: "amber", color: "#d97706", label: "On track" };
  return { band: "red", color: "#dc2626", label: "Needs focus" };
}

// ─── Row interfaces (client-safe mirrors of the appr_* tables) ──────────────

export interface ConfigRow {
  id: string;
  employeeId: string;
  managerId: string | null;
  managementId: string | null;
  dimensionWeights: Record<ApprDimension, number>;
  incentiveTarget: string | null;
  knowledgeDo: number;
  knowledgeGive: number;
  updatedById: string | null;
}

export interface KpiRow {
  id: string;
  employeeId: string;
  srNo: number | null;
  area: string | null;
  measure: string | null;
  subWeight: number;
}

export interface SkillRow {
  id: string;
  employeeId: string;
  name: string | null;
  technical: boolean;
  subWeight: number;
}

export interface AttitudeRow {
  id: string;
  employeeId: string;
  key: string;
  label: string | null;
  weight: number;
}

/** One scored item's Self/Manager/Management scores + evidence. */
export interface ItemScore {
  id: string;
  employeeId: string;
  itemKind: ItemKind;
  itemId: string;
  actual: string | null;
  evidenceUrl: string | null;
  approved: boolean | null;
  remarks: string | null;
  selfScore: number | null;
  selfNote: string | null;
  managerScore: number | null;
  managerNote: string | null;
  managementScore: number | null;
  managementNote: string | null;
}

/** One dimension's computed contribution to the overall total. */
export interface PerDimension {
  dimension: ApprDimension;
  label: string;
  /** 0-100 dimension percentage (weighted avg of Management scores). */
  pct: number;
  /** Dimension weight (out of 100). */
  weight: number;
  /** pct × weight/100 — points this dimension adds to the /100 total. */
  contribution: number;
}

/** The fully-computed live scorecard for one employee. */
export interface AppraisalScorecard {
  employeeId: string;
  perDimension: PerDimension[];
  /** Overall 0-100 final score. */
  total: number;
  band: RatingBand;
  color: string;
  ratingLabel: string;
  /** 'in_progress' | 'finalized' */
  status: string;
}
