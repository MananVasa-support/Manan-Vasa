/**
 * CANDIDATE EVALUATION v2 — composite / index scores (PURE, CLIENT-SAFE).
 *
 * The Interview Intelligence roll-ups: Strength/Weakness indices, the five
 * driver composites (Leadership · Execution · Learning · Communication ·
 * Ownership), Technical / Digital-Literacy / AI-Readiness, Sales Readiness, and
 * the Overall-Assessment scorecard. Every composite is a plain average (0..10)
 * over an EXPLICIT list of item ids from the instrument, so the mapping is
 * auditable and adjustable in ONE place (the *_IDS arrays below).
 *
 * These groupings are the proposed defaults (2026-07-28) — tune the id arrays to
 * re-map a parameter into a different composite.
 */

import type { EvaluationInstance } from "@/lib/hr/candidate/evaluation-v2";
import { overallScore, type ScoreContext, type WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";

/* ------------------------------------------------------------------ */
/* Averaging primitive                                                 */
/* ------------------------------------------------------------------ */

/** Mean (0..10) of the rated items in `ids` (skips Can't-Say + unrated), or null. */
export function avgOf(ids: string[], inst: EvaluationInstance): number | null {
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    if (inst.cantSay.includes(id)) continue;
    const v = inst.ratings[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/** Rating band for a 0..10 score → tone + label (green ≥8 / amber ≥6 / red else). */
export function scoreBand(score: number | null): { tone: string; label: string } {
  if (score === null) return { tone: "#94a3b8", label: "—" };
  if (score >= 8) return { tone: "#16a34a", label: "Strong" };
  if (score >= 6) return { tone: "#d97706", label: "Fair" };
  return { tone: "#dc2626", label: "Weak" };
}

/* ------------------------------------------------------------------ */
/* Base Expectations                                                   */
/* ------------------------------------------------------------------ */

export const BASE_IDS = [
  "base-culture-fit", "base-honesty", "base-integrity", "base-family-bg",
  "base-family-values", "base-listening", "base-retention", "base-articulation",
  "base-verbal-english", "base-written-english", "base-explain",
  "base-presence-of-mind", "base-grooming", "base-hygiene", "base-not-opportunistic",
];

/** % of RATED base params scoring ≥ 7 (strength) / ≤ 4 (weakness). 0..100. */
function ratedBand(ids: string[], inst: EvaluationInstance, pred: (v: number) => boolean): number {
  let hit = 0;
  let n = 0;
  for (const id of ids) {
    const v = inst.ratings[id];
    if (typeof v === "number" && Number.isFinite(v) && !inst.cantSay.includes(id)) {
      n += 1;
      if (pred(v)) hit += 1;
    }
  }
  return n ? Math.round((hit / n) * 100) : 0;
}

export interface BaseComposite {
  average: number | null;
  strengthIndex: number; // % ≥ 7
  weaknessIndex: number; // % ≤ 4
}

export function baseComposite(inst: EvaluationInstance): BaseComposite {
  return {
    average: avgOf(BASE_IDS, inst),
    strengthIndex: ratedBand(BASE_IDS, inst, (v) => v >= 7),
    weaknessIndex: ratedBand(BASE_IDS, inst, (v) => v <= 4),
  };
}

/* ------------------------------------------------------------------ */
/* Important Drivers → 5 composites + overall                          */
/* ------------------------------------------------------------------ */

export const DRIVER_IDS = [
  "drv-common-sense", "drv-growth-mindset", "drv-self-confidence", "drv-self-esteem",
  "drv-humility", "drv-passion", "drv-temperament", "drv-relevant-experience",
  "drv-work-speed", "drv-flexibility", "drv-manners", "drv-ownership",
  "drv-independence", "drv-take-pressure", "drv-convince", "drv-positive-attitude",
  "drv-work-under-pressure", "drv-delegate", "drv-getwork-external",
  "drv-getwork-subordinates", "drv-getwork-managers", "drv-knowledge-sharing",
  "drv-problem-solving", "drv-hunger-to-learn", "drv-think", "drv-execute",
  "drv-creativity", "drv-long-term", "drv-loyalty",
];

export const LEADERSHIP_IDS = [
  "drv-delegate", "drv-getwork-subordinates", "drv-getwork-external",
  "drv-getwork-managers", "drv-convince", "drv-ownership", "drv-independence",
];
export const EXECUTION_IDS = [
  "drv-work-speed", "drv-execute", "drv-problem-solving", "drv-take-pressure",
  "drv-work-under-pressure", "drv-ownership",
];
export const LEARNING_IDS = [
  "drv-growth-mindset", "drv-hunger-to-learn", "drv-think", "drv-creativity",
  "drv-common-sense", "drv-knowledge-sharing",
];
/** Communication draws from Drivers + the Base language/listening params. */
export const COMMUNICATION_IDS = [
  "drv-convince", "drv-manners", "drv-knowledge-sharing",
  "base-articulation", "base-verbal-english", "base-written-english",
  "base-explain", "base-listening",
];
export const OWNERSHIP_IDS = [
  "drv-ownership", "drv-loyalty", "drv-long-term", "drv-positive-attitude",
  "drv-passion", "drv-independence",
];

export interface DriverComposite {
  leadership: number | null;
  execution: number | null;
  learning: number | null;
  communication: number | null;
  ownership: number | null;
  overall: number | null;
}

export function driverComposite(inst: EvaluationInstance): DriverComposite {
  return {
    leadership: avgOf(LEADERSHIP_IDS, inst),
    execution: avgOf(EXECUTION_IDS, inst),
    learning: avgOf(LEARNING_IDS, inst),
    communication: avgOf(COMMUNICATION_IDS, inst),
    ownership: avgOf(OWNERSHIP_IDS, inst),
    overall: avgOf(DRIVER_IDS, inst),
  };
}

/* ------------------------------------------------------------------ */
/* Technical → Technical / Digital-Literacy / AI-Readiness             */
/* ------------------------------------------------------------------ */

export const TECH_IDS = [
  "tech-typing", "tech-gdrive", "tech-gsheet", "tech-excel-basic", "tech-excel-adv",
  "tech-ppt", "tech-chatgpt", "tech-claude", "tech-canva", "tech-video", "tech-digital-mktg",
];
export const DIGITAL_LITERACY_IDS = [
  "tech-gdrive", "tech-gsheet", "tech-excel-basic", "tech-excel-adv", "tech-ppt", "tech-typing",
];
export const AI_READINESS_IDS = ["tech-chatgpt", "tech-claude"];

export interface TechnicalComposite {
  technical: number | null;
  digitalLiteracy: number | null;
  aiReadiness: number | null;
}

export function technicalComposite(inst: EvaluationInstance): TechnicalComposite {
  return {
    technical: avgOf(TECH_IDS, inst),
    digitalLiteracy: avgOf(DIGITAL_LITERACY_IDS, inst),
    aiReadiness: avgOf(AI_READINESS_IDS, inst),
  };
}

/* ------------------------------------------------------------------ */
/* Customer-Facing + Sales                                             */
/* ------------------------------------------------------------------ */

export const CUSTOMER_IDS = [
  "cf-confidence", "cf-communication", "cf-professionalism",
  "cf-presentation", "cf-listening", "cf-handling-questions",
];
export const SALES_IDS = [
  "sales-call-200", "sales-meetings-5", "sales-convince", "sales-influence",
  "sales-explain", "sales-collect-money", "sales-persuasion", "sales-references",
  "sales-verbal-presentation", "sales-demeanour", "sales-rejections",
  "sales-justify-settle", "sales-stuck-reasons", "sales-creativity",
];

/* ------------------------------------------------------------------ */
/* Overall Assessment scorecard                                        */
/* ------------------------------------------------------------------ */

export interface CompositeScore {
  key: string;
  label: string;
  /** 0..10, or null if unrated. */
  score: number | null;
  tone: string;
}

export interface Composites {
  base: BaseComposite;
  drivers: DriverComposite;
  technical: TechnicalComposite;
  customerFacing: number | null;
  salesReadiness: number | null;
  /** The Overall-Assessment headline scorecard (0..10 each). */
  scorecard: CompositeScore[];
  /** The weighted Overall Interview Score, 0..100. */
  interviewScore: number | null;
}

/**
 * The full composite bundle for one instance. `ctx.isSalesRole` decides whether
 * Sales feeds the interview score (mirrors the scoring core's applicability).
 */
export function computeComposites(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
  ctx?: ScoreContext,
): Composites {
  const base = baseComposite(inst);
  const drivers = driverComposite(inst);
  const technical = technicalComposite(inst);
  const customerFacing = avgOf(CUSTOMER_IDS, inst);
  const salesReadiness = avgOf(SALES_IDS, inst);
  const overall = overallScore(inst, profile, ctx);

  // Behavioural = Base average blended with the behavioural drivers.
  const behavioural = avgOf(
    [...BASE_IDS, "drv-temperament", "drv-humility", "drv-positive-attitude", "drv-manners"],
    inst,
  );
  const cultureFit = avgOf(["base-culture-fit", "base-family-values", "drv-loyalty", "drv-long-term"], inst);

  const scorecard: CompositeScore[] = [
    { key: "behavioural", label: "Behavioural", score: behavioural, tone: scoreBand(behavioural).tone },
    { key: "communication", label: "Communication", score: drivers.communication, tone: scoreBand(drivers.communication).tone },
    { key: "technical", label: "Technical", score: technical.technical, tone: scoreBand(technical.technical).tone },
    { key: "leadership", label: "Leadership", score: drivers.leadership, tone: scoreBand(drivers.leadership).tone },
    { key: "learning", label: "Learning", score: drivers.learning, tone: scoreBand(drivers.learning).tone },
    { key: "culture-fit", label: "Culture Fit", score: cultureFit, tone: scoreBand(cultureFit).tone },
  ];
  if (ctx?.isSalesRole) {
    scorecard.push({ key: "sales", label: "Sales", score: salesReadiness, tone: scoreBand(salesReadiness).tone });
  }

  return {
    base,
    drivers,
    technical,
    customerFacing,
    salesReadiness,
    scorecard,
    interviewScore: overall.pct,
  };
}
