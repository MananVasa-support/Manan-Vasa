import { sql, type SQL } from "drizzle-orm";
import { weeklyGoals } from "@/db/schema";

/**
 * Effective-% helpers for the Weekly Goals redesign.
 *
 * A goal's **effective %** is the manager-accepted % once a goal is reviewed
 * (`accept_pct IS NOT NULL`), otherwise the doer's own `pct_done`. The
 * **weekly score** for an employee/week is the weight-aware average of those
 * effective %s over the non-archived goals:
 *
 *     weeklyScore = Σ(effective% × weight) / Σ(weight)
 *
 * Both a SQL fragment (for aggregate queries) and a pure TS function (for the
 * UI / per-row display) are exported so the two layers stay in lock-step. No
 * DB or I/O — safe to import anywhere.
 */

/** Per-goal effective % as a SQL expression: COALESCE(accept_pct, pct_done). */
export const effectivePctSql: SQL<number> = sql<number>`coalesce(${weeklyGoals.acceptPct}, ${weeklyGoals.pctDone})`;

/**
 * Weight-aware weekly score as a SQL aggregate expression, rounded to an int in
 * [0,100]. Returns 0 when the weight total is 0 (no goals in the group). Pair
 * with a `WHERE archived = false` predicate at the call site so archived goals
 * never contribute.
 */
export const weeklyScoreSql: SQL<number> = sql<number>`coalesce(round(
  sum(${effectivePctSql} * ${weeklyGoals.weight})::numeric
  / nullif(sum(${weeklyGoals.weight}), 0)
)::int, 0)`;

/** A goal "completed" by the official metric = effective % ≥ 100. */
export const effectiveCompletedSql: SQL<number> = sql<number>`count(*) filter (where ${effectivePctSql} >= 100)::int`;

/** Pure TS per-goal effective %: acceptPct if reviewed, else pctDone. */
export function effectivePct(goal: {
  acceptPct: number | null;
  pctDone: number;
}): number {
  return goal.acceptPct ?? goal.pctDone;
}

/**
 * Pure TS weighted weekly score over a set of goals: Σ(eff×weight)/Σ(weight),
 * rounded to an int in [0,100]. Callers should pass only non-archived goals.
 * Returns 0 when the total weight is 0.
 */
export function weeklyScore(
  goals: { acceptPct: number | null; pctDone: number; weight: number }[],
): number {
  let weighted = 0;
  let total = 0;
  for (const g of goals) {
    weighted += effectivePct(g) * g.weight;
    total += g.weight;
  }
  if (total === 0) return 0;
  return Math.round(weighted / total);
}
