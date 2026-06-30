/**
 * PMS Layer 2 — the PURE Score engine (mig 0095).
 *
 * computeScore() turns an employee's Twin (+ a small task-metric window + tenure)
 * into a 0–100 performance score. It is a PURE function of its inputs and the
 * config: EVERY weight, threshold, and coefficient comes from the PmsScoreConfig
 * argument. No weight or threshold literal appears in this file — change the
 * pms_score_config row and the score changes with no deploy.
 *
 * Method: each pillar is normalised to a 0..1 rate, scaled by its formula
 * coefficient, then weighted by cfg.weights and divided by the sum of the
 * weights of the pillars that had data. A pillar with no activity is EXCLUDED
 * from the denominator (so a new hire isn't punished for an empty pillar) rather
 * than scored 0. The result is ×100, clamped to [0,100], rounded.
 */
import type { PmsScoreConfig } from "./config";

/** numeric columns read back from Postgres as strings — coerce safely. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(x) ? x : 0;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** The Twin counters the score reads (subset of employee_twin). */
export interface ScoreTwinInput {
  presenceDays: number | string;
  lateCount: number | string;
  punctualDays: number | string;
  goalEffSumWeighted: number | string;
  goalWeightSum: number | string;
  dccDueCount: number | string;
  dccDoneCount: number | string;
  testsPassed: number | string;
  testsAttempted: number | string;
  feedbackCount: number | string;
  feedbackRatingSum: number | string;
}

/** A small task-on-time window (from task_metrics_daily) — done+approved over
 *  the total terminal outcomes. */
export interface ScoreTaskInput {
  doneCount: number;
  approvedCount: number;
  notApprovedCount: number;
}

export interface ScoreInput {
  twin: ScoreTwinInput;
  taskMetrics: ScoreTaskInput;
  tenureDays: number;
}

export interface PillarScore {
  /** 0..1 rate before weighting (null = no data → excluded from the score). */
  rate: number | null;
  /** the weight applied (from cfg.weights). */
  weight: number;
}

export interface ScoreBreakdown {
  attendance: PillarScore;
  goals: PillarScore;
  dcc: PillarScore;
  tasks: PillarScore;
  training: PillarScore;
  feedback: PillarScore;
}

export interface ScoreResult {
  score: number; // 0..100
  breakdown: ScoreBreakdown;
}

/** Compute the 0–100 score. PURE; reads ALL policy from `cfg`. */
export function computeScore(input: ScoreInput, cfg: PmsScoreConfig): ScoreResult {
  const { twin, taskMetrics } = input;
  const { weights, formula } = cfg;

  // ── Attendance: punctual share of present days, scaled by its coefficient. ──
  const presence = num(twin.presenceDays);
  const punctual = num(twin.punctualDays);
  const attendanceRate =
    presence > 0 ? clamp01((punctual / presence) * formula.punctualityCoeff) : null;

  // ── Goals: weight-aware effective % (honours manager acceptPct via the
  //    weighted eff-sum), divided by 100 to a 0..1 rate. ──
  const goalWeightSum = num(twin.goalWeightSum);
  const goalEff = num(twin.goalEffSumWeighted);
  const goalRate =
    goalWeightSum > 0
      ? clamp01((goalEff / goalWeightSum / 100) * formula.goalAchievementCoeff)
      : null;

  // ── DCC: done share of due KPIs. ──
  const dccDue = num(twin.dccDueCount);
  const dccDone = num(twin.dccDoneCount);
  const dccRate = dccDue > 0 ? clamp01((dccDone / dccDue) * formula.dccComplianceCoeff) : null;

  // ── Tasks: done+approved share of terminal outcomes, from task_metrics. ──
  const terminal =
    taskMetrics.doneCount + taskMetrics.approvedCount + taskMetrics.notApprovedCount;
  const taskGood = taskMetrics.doneCount + taskMetrics.approvedCount;
  const taskRate = terminal > 0 ? clamp01((taskGood / terminal) * formula.taskOnTimeCoeff) : null;

  // ── Training: pass share of attempts. ──
  const attempts = num(twin.testsAttempted);
  const passed = num(twin.testsPassed);
  const trainingRate = attempts > 0 ? clamp01((passed / attempts) * formula.testPassCoeff) : null;

  // ── Feedback: mean rating mapped 1..5 → 0..1, scaled by its coefficient. ──
  const fbCount = num(twin.feedbackCount);
  const fbSum = num(twin.feedbackRatingSum);
  const feedbackRate =
    fbCount > 0 ? clamp01(((fbSum / fbCount - 1) / 4) * formula.feedbackCoeff) : null;

  const breakdown: ScoreBreakdown = {
    attendance: { rate: attendanceRate, weight: weights.attendance },
    goals: { rate: goalRate, weight: weights.goals },
    dcc: { rate: dccRate, weight: weights.dcc },
    tasks: { rate: taskRate, weight: weights.tasks },
    training: { rate: trainingRate, weight: weights.training },
    feedback: { rate: feedbackRate, weight: weights.feedback },
  };

  // Weighted mean over pillars that HAVE data (null pillars excluded from both
  // numerator and denominator), ×100.
  let weightedSum = 0;
  let weightTotal = 0;
  for (const pillar of Object.values(breakdown)) {
    if (pillar.rate === null) continue;
    weightedSum += pillar.rate * pillar.weight;
    weightTotal += pillar.weight;
  }
  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;
  return { score: Math.max(0, Math.min(100, score)), breakdown };
}
