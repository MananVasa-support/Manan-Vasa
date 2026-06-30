/**
 * PMS Layer 2 — the read layer (mig 0095). server-only. Every read is a cheap
 * point-read of the projection / config — NO scan of attendance_logs /
 * weekly_goals / dcc_entries on the load path (Law: DB load path off-limits).
 * Each read is wrapped in withRetry so a stale pooled connection self-heals.
 *
 * This layer is also where the PURE engines are wired to live data: it fetches
 * the Twin + the config + a small task-metric window + tenure and hands them to
 * computeScore(). The engines stay pure; ALL policy lives in pms_score_config.
 */
import "server-only";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, pmsScoreConfig, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { getEmployeeTwin } from "@/lib/projections/employee-twin";
import { getEmployeeScoreDaily } from "@/lib/projections/employee-score-daily";
import { getTaskMetrics } from "@/lib/projections/task-metrics";
import { parseScoreConfig, type PmsScoreConfig } from "@/lib/pms/engines/config";
import { computeScore, type ScoreResult } from "@/lib/pms/engines/score";
import { evaluatePromotion, type PromotionEvaluation } from "@/lib/pms/engines/promotion";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/** Read (and parse) the singleton score config. The id='default' row is seeded
 *  by mig 0095; if it's somehow absent we parse an empty shape (every pillar
 *  contributes 0 — never an invented default weight). */
export async function getScoreConfig(): Promise<PmsScoreConfig> {
  const rows = await withRetry(
    () => db.select().from(pmsScoreConfig).where(eq(pmsScoreConfig.id, "default")).limit(1),
    { ...RETRY, label: "pms-config" },
  );
  const row = rows[0];
  return parseScoreConfig({
    weights: row?.weights ?? {},
    thresholds: row?.thresholds ?? {},
    formula: row?.formula ?? {},
  });
}

/** The current Twin snapshot for a set of employees. [] on empty input. */
export async function getTwins(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];
  return withRetry(() => getEmployeeTwin(employeeIds), { ...RETRY, label: "pms-twins" });
}

/** The score-trend daily series for one employee over a window. */
export async function getScoreTrend(
  employeeId: string,
  range: { start: string; end: string },
) {
  return withRetry(
    () => getEmployeeScoreDaily({ employeeIds: [employeeId], start: range.start, end: range.end }),
    { ...RETRY, label: "pms-trend" },
  );
}

/** Tenure (whole days since joinedAt) for an employee — 0 when unknown. */
async function getTenureDays(employeeId: string): Promise<number> {
  const rows = await withRetry(
    () => db.select({ joinedAt: employees.joinedAt }).from(employees).where(eq(employees.id, employeeId)).limit(1),
    { ...RETRY, label: "pms-tenure" },
  );
  const joinedAt = rows[0]?.joinedAt;
  if (!joinedAt) return 0;
  const ms = Date.now() - new Date(joinedAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** A small task-on-time window (last ~90d) from task_metrics_daily. */
async function getTaskWindow(employeeId: string): Promise<{
  doneCount: number;
  approvedCount: number;
  notApprovedCount: number;
}> {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  const rows = await withRetry(
    () => getTaskMetrics({ start, end, doerIds: [employeeId] }),
    { ...RETRY, label: "pms-task-window" },
  );
  return rows.reduce(
    (acc, r) => ({
      doneCount: acc.doneCount + r.doneCount,
      approvedCount: acc.approvedCount + r.approvedCount,
      notApprovedCount: acc.notApprovedCount + r.notApprovedCount,
    }),
    { doneCount: 0, approvedCount: 0, notApprovedCount: 0 },
  );
}

export interface ScoreForResult {
  score: ScoreResult;
  promotion: PromotionEvaluation;
  tenureDays: number;
}

export interface RosterScore {
  employeeId: string;
  score: ScoreResult;
  promotion: PromotionEvaluation;
  tenureDays: number;
}

/**
 * Batched scorer for a roster — the whole visible set in ~4 queries (config +
 * twins + a task-metric window + tenure), then the PURE engines per person. Used
 * by the PMS roster page so it never fans out to N×4 reads on the load path.
 */
export async function scoreForMany(employeeIds: string[]): Promise<RosterScore[]> {
  if (employeeIds.length === 0) return [];
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  const [cfg, twins, taskRows, tenureRows] = await Promise.all([
    getScoreConfig(),
    getTwins(employeeIds),
    withRetry(() => getTaskMetrics({ start, end, doerIds: employeeIds }), { ...RETRY, label: "pms-roster-tasks" }),
    withRetry(
      () => db.select({ id: employees.id, joinedAt: employees.joinedAt }).from(employees).where(inArray(employees.id, employeeIds)),
      { ...RETRY, label: "pms-roster-tenure" },
    ),
  ]);

  const twinById = new Map(twins.map((t) => [t.employeeId, t]));
  const tenureById = new Map(
    tenureRows.map((r) => {
      const days = r.joinedAt ? Math.max(0, Math.floor((Date.now() - new Date(r.joinedAt).getTime()) / 86_400_000)) : 0;
      return [r.id, days] as const;
    }),
  );
  const taskById = new Map<string, { doneCount: number; approvedCount: number; notApprovedCount: number }>();
  for (const r of taskRows) {
    const acc = taskById.get(r.doerId) ?? { doneCount: 0, approvedCount: 0, notApprovedCount: 0 };
    acc.doneCount += r.doneCount;
    acc.approvedCount += r.approvedCount;
    acc.notApprovedCount += r.notApprovedCount;
    taskById.set(r.doerId, acc);
  }

  const EMPTY_TWIN = {
    presenceDays: 0, lateCount: 0, punctualDays: 0,
    goalEffSumWeighted: "0", goalWeightSum: "0",
    dccDueCount: 0, dccDoneCount: 0, testsPassed: 0, testsAttempted: 0,
    feedbackCount: 0, feedbackRatingSum: "0",
  };

  return employeeIds.map((id) => {
    const twin = twinById.get(id) ?? EMPTY_TWIN;
    const taskMetrics = taskById.get(id) ?? { doneCount: 0, approvedCount: 0, notApprovedCount: 0 };
    const tenureDays = tenureById.get(id) ?? 0;
    const score = computeScore({ twin, taskMetrics, tenureDays }, cfg);
    const promotion = evaluatePromotion(score.score, tenureDays, cfg);
    return { employeeId: id, score, promotion, tenureDays };
  });
}

/** Compute the live score (+ promotion eligibility) for one employee by reading
 *  the projection, config, task window, and tenure, then running the PURE
 *  engines. A missing Twin scores 0 (no data) rather than throwing. */
export async function scoreFor(employeeId: string): Promise<ScoreForResult> {
  const [cfg, twins, taskMetrics, tenureDays] = await Promise.all([
    getScoreConfig(),
    getTwins([employeeId]),
    getTaskWindow(employeeId),
    getTenureDays(employeeId),
  ]);
  const twin = twins[0] ?? {
    presenceDays: 0,
    lateCount: 0,
    punctualDays: 0,
    goalEffSumWeighted: "0",
    goalWeightSum: "0",
    dccDueCount: 0,
    dccDoneCount: 0,
    testsPassed: 0,
    testsAttempted: 0,
    feedbackCount: 0,
    feedbackRatingSum: "0",
  };
  const score = computeScore({ twin, taskMetrics, tenureDays }, cfg);
  const promotion = evaluatePromotion(score.score, tenureDays, cfg);
  return { score, promotion, tenureDays };
}
