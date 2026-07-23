/**
 * Appraisal v2 — pure compute engine. NO DB, NO server-only: deterministic
 * functions over already-loaded rows, so it is unit-testable and callable from
 * either tier. Management scores are the FINAL values that count.
 *
 * Overall /100 = Σ(dimensionPct × dimensionWeight/100), where a dimension's pct
 * is the sub-weight-weighted average of its items' MANAGEMENT scores (0-100).
 * Incentive & Culture use their direct management scores; Knowledge uses a
 * passed-in knowledgePct (auto-computed from Training counts by the caller).
 */
import {
  APPR_DIMENSIONS,
  DEFAULT_WEIGHTS,
  DIMENSION_LABELS,
  ratingBand,
  type ApprDimension,
  type AppraisalScorecard,
  type AttitudeRow,
  type ConfigRow,
  type ItemScore,
  type KpiRow,
  type PerDimension,
  type SkillRow,
} from "./types";

/** An item with a sub-weight and (maybe) a management score. */
interface WeightedItem {
  itemId: string;
  subWeight: number;
  managementScore: number | null;
}

/**
 * Weighted average (by sub-weight) of the MANAGEMENT scores across items, on a
 * 0-100 scale. Items with no management score yet are skipped (they don't drag
 * the average down). Returns 0 when nothing is scored.
 */
export function computeDimensionPct(items: WeightedItem[]): number {
  let weightSum = 0;
  let scoreSum = 0;
  for (const it of items) {
    if (it.managementScore == null) continue;
    const w = it.subWeight > 0 ? it.subWeight : 0;
    if (w === 0) continue;
    weightSum += w;
    scoreSum += clamp01to100(it.managementScore) * w;
  }
  if (weightSum === 0) return 0;
  return round1(scoreSum / weightSum);
}

function clamp01to100(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Normalise a weights record → all six dimensions present as finite numbers. */
function resolveWeights(cfg?: ConfigRow | null): Record<ApprDimension, number> {
  const raw = cfg?.dimensionWeights ?? DEFAULT_WEIGHTS;
  const out = {} as Record<ApprDimension, number>;
  for (const d of APPR_DIMENSIONS) {
    const v = Number(raw?.[d]);
    out[d] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[d];
  }
  return out;
}

/** Index item scores by itemId for O(1) lookup while joining to definitions. */
function scoreMap(scores: ItemScore[]): Map<string, ItemScore> {
  const m = new Map<string, ItemScore>();
  for (const s of scores) m.set(s.itemId, s);
  return m;
}

/**
 * Assemble the full computed scorecard for an employee from already-loaded
 * rows. Incentive & culture come from direct management scores (0-100, null →
 * 0). Knowledge is the caller-computed knowledgePct. KPI/Skill/Attitude are the
 * sub-weight-weighted averages of their items' management scores.
 */
export function computeScorecard(params: {
  employeeId: string;
  config?: ConfigRow | null;
  kpis: KpiRow[];
  skills: SkillRow[];
  attitude: AttitudeRow[];
  scores: ItemScore[];
  incentiveScore: number | null;
  cultureScore: number | null;
  knowledgePct: number;
  status?: string;
}): AppraisalScorecard {
  const {
    employeeId,
    config,
    kpis,
    skills,
    attitude,
    scores,
    incentiveScore,
    cultureScore,
    knowledgePct,
    status = "in_progress",
  } = params;

  const weights = resolveWeights(config);
  const byItem = scoreMap(scores);

  const kpiItems: WeightedItem[] = kpis.map((k) => ({
    itemId: k.id,
    subWeight: k.subWeight,
    managementScore: byItem.get(k.id)?.managementScore ?? null,
  }));
  const skillItems: WeightedItem[] = skills.map((s) => ({
    itemId: s.id,
    subWeight: s.subWeight,
    managementScore: byItem.get(s.id)?.managementScore ?? null,
  }));
  const attitudeItems: WeightedItem[] = attitude.map((a) => ({
    itemId: a.id,
    subWeight: a.weight,
    managementScore: byItem.get(a.id)?.managementScore ?? null,
  }));

  const dimPct: Record<ApprDimension, number> = {
    incentive: clamp01to100(incentiveScore ?? 0),
    kpi: computeDimensionPct(kpiItems),
    skill: computeDimensionPct(skillItems),
    attitude: computeDimensionPct(attitudeItems),
    culture: clamp01to100(cultureScore ?? 0),
    knowledge: clamp01to100(knowledgePct),
  };

  const perDimension: PerDimension[] = APPR_DIMENSIONS.map((d) => {
    const pct = round1(dimPct[d]);
    const weight = weights[d];
    return {
      dimension: d,
      label: DIMENSION_LABELS[d],
      pct,
      weight,
      contribution: round1((pct * weight) / 100),
    };
  });

  const total = round1(
    perDimension.reduce((sum, p) => sum + p.contribution, 0),
  );
  const rating = ratingBand(total);

  return {
    employeeId,
    perDimension,
    total,
    band: rating.band,
    color: rating.color,
    ratingLabel: rating.label,
    status,
  };
}
