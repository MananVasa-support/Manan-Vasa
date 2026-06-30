/**
 * PMS Layer 2 — the typed shape of pms_score_config (mig 0095).
 *
 * THE single source of every weight / threshold / coefficient. The pure engines
 * (score / promotion / recognition) read ONLY this — no policy is ever hardcoded
 * in engine logic. The DB row stores weights/thresholds/formula as jsonb so the
 * shape can grow without a migration, and the admin editor writes it back.
 *
 * These interfaces describe the seeded `id='default'` row's keys; the engines
 * read each key off the parsed config they're handed. If a key is ever missing
 * (e.g. an older row), the engine treats its contribution as 0 — it never falls
 * back to a baked-in default value, so behaviour is always driven by the data.
 */

export interface PmsWeights {
  attendance: number;
  goals: number;
  dcc: number;
  tasks: number;
  training: number;
  feedback: number;
}

export interface PmsThresholds {
  promotionScore: number;
  recognitionScore: number;
  lateGraceDays: number;
  onTimeRateFloor: number;
  minTenureDays: number;
}

export interface PmsFormula {
  punctualityCoeff: number;
  goalAchievementCoeff: number;
  dccComplianceCoeff: number;
  taskOnTimeCoeff: number;
  testPassCoeff: number;
  feedbackCoeff: number;
}

/** The parsed config the engines consume. */
export interface PmsScoreConfig {
  weights: PmsWeights;
  thresholds: PmsThresholds;
  formula: PmsFormula;
}

/** Coerce an unknown jsonb value to a finite number, else 0. NEVER substitutes a
 *  policy default — a missing key contributes nothing rather than an invented
 *  weight. */
export function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : 0;
}

/** Parse the raw jsonb columns of a pms_score_config row into the typed shape.
 *  Reads each key explicitly (so the engines stay literal-free). */
export function parseScoreConfig(raw: {
  weights: unknown;
  thresholds: unknown;
  formula: unknown;
}): PmsScoreConfig {
  const w = (raw.weights ?? {}) as Record<string, unknown>;
  const t = (raw.thresholds ?? {}) as Record<string, unknown>;
  const f = (raw.formula ?? {}) as Record<string, unknown>;
  return {
    weights: {
      attendance: n(w.attendance),
      goals: n(w.goals),
      dcc: n(w.dcc),
      tasks: n(w.tasks),
      training: n(w.training),
      feedback: n(w.feedback),
    },
    thresholds: {
      promotionScore: n(t.promotionScore),
      recognitionScore: n(t.recognitionScore),
      lateGraceDays: n(t.lateGraceDays),
      onTimeRateFloor: n(t.onTimeRateFloor),
      minTenureDays: n(t.minTenureDays),
    },
    formula: {
      punctualityCoeff: n(f.punctualityCoeff),
      goalAchievementCoeff: n(f.goalAchievementCoeff),
      dccComplianceCoeff: n(f.dccComplianceCoeff),
      taskOnTimeCoeff: n(f.taskOnTimeCoeff),
      testPassCoeff: n(f.testPassCoeff),
      feedbackCoeff: n(f.feedbackCoeff),
    },
  };
}
