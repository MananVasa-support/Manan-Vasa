import { and, gte, lt, inArray } from "drizzle-orm";
import { db, employees, tasks } from "@/lib/db";
import type { DashboardData, DashboardFilters, KpiSet } from "@/lib/types";
import {
  computeKpiTotals,
  computeStatusDistribution,
  computeAgingByDate,
  computeWeekOverWeekDelta,
  computeDailySparkline,
  computeTopPerformers,
  computeVelocity,
  generatePullQuote,
  computeEmployeeStatusTable,
  computeEmployeeAgingTable,
} from "@/lib/transforms";
import { AGE_BUCKETS, PENDING_STATUSES } from "@/db/enums";
import type { TaskStatus } from "@/db/enums";
import type { AgingHeatmapData } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function loadDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const start =
    filters.startDate ?? new Date(Date.now() - 30 * MS_PER_DAY);
  const end = filters.endDate ?? new Date();

  const conditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
  ];
  if (filters.employeeIds.length > 0) {
    const idCol =
      filters.view === "doer" ? tasks.doerId : tasks.initiatorId;
    conditions.push(inArray(idCol, filters.employeeIds));
  }
  if (filters.departments.length > 0) {
    const empIds = await db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.department, filters.departments));
    const ids = empIds.map((e) => e.id);
    if (ids.length === 0) {
      // no matching employees → no matching tasks
      conditions.push(inArray(tasks.doerId, ["00000000-0000-0000-0000-000000000000"]));
    } else {
      conditions.push(inArray(tasks.doerId, ids));
    }
  }
  if (filters.priorities.length > 0) {
    conditions.push(inArray(tasks.priority, filters.priorities));
  }
  if (filters.subjects.length > 0) {
    conditions.push(inArray(tasks.subject, filters.subjects));
  }

  const fourteenAgo = new Date(Date.now() - 14 * MS_PER_DAY);
  const ninetyAgo = new Date(Date.now() - 90 * MS_PER_DAY);

  const [allEmployees, periodTasks, wideTasks, velocityTasks] =
    await Promise.all([
      db.select().from(employees),
      db
        .select()
        .from(tasks)
        .where(and(...conditions)),
      db.select().from(tasks).where(gte(tasks.createdAt, fourteenAgo)),
      db.select().from(tasks).where(gte(tasks.createdAt, ninetyAgo)),
    ]);

  const now = new Date();

  const totals = computeKpiTotals(periodTasks);

  const approvedCount = periodTasks.filter((t) => t.status === "approved").length;
  const statusDistributionDenominator = totals.total - approvedCount;

  const sparklineFor = (predicate: (s: TaskStatus) => boolean) =>
    computeDailySparkline(
      wideTasks.filter((t) => predicate(t.status)),
      now,
      14,
    );

  const wow = (predicate: (s: TaskStatus) => boolean) =>
    computeWeekOverWeekDelta(
      wideTasks.filter((t) => predicate(t.status)),
      now,
    );

  const isDone = (s: TaskStatus) => s === "done" || s === "approved";
  // Tier-3 (2026-05-20) — `pending` covers every non-terminal status
  // EXCEPT the dedicated `need_help`/`need_info` tiles + `not_started`
  // (which has its own tile). That mirrors computeKpiTotals.
  const PENDING_SET = new Set<TaskStatus>(PENDING_STATUSES);
  const isPending = (s: TaskStatus) =>
    PENDING_SET.has(s) &&
    s !== "not_started" &&
    s !== "need_help" &&
    s !== "need_info";
  const isNeedHelp = (s: TaskStatus) => s === "need_help" || s === "need_info";

  const kpis: KpiSet = {
    total: {
      current: totals.total,
      previous: wow(() => true).previous,
      sparkline: sparklineFor(() => true),
    },
    pending: {
      current: totals.pending,
      previous: wow(isPending).previous,
      sparkline: sparklineFor(isPending),
    },
    notStarted: {
      current: totals.notStarted,
      previous: wow((s) => s === "not_started").previous,
      sparkline: sparklineFor((s) => s === "not_started"),
    },
    needHelp: {
      current: totals.needHelp,
      previous: wow(isNeedHelp).previous,
      sparkline: sparklineFor(isNeedHelp),
    },
    done: {
      current: totals.done,
      previous: wow(isDone).previous,
      sparkline: sparklineFor(isDone),
    },
    notApproved: {
      current: totals.notApproved,
      previous: wow((s) => s === "not_approved").previous,
      sparkline: sparklineFor((s) => s === "not_approved"),
    },
  };

  const wowDone = computeWeekOverWeekDelta(
    wideTasks.filter((t) => isDone(t.status)),
    now,
  );

  const topPerformers = computeTopPerformers(
    periodTasks,
    allEmployees,
    now,
    6,
  );

  // Aging heatmap shows EVERY pending task (any non-terminal status),
  // sourced from the canonical enum list so Tier-3 statuses appear.
  const PENDING_AGES: Set<TaskStatus> = new Set(PENDING_STATUSES);
  const byCell: AgingHeatmapData["byCell"] = {};
  for (const t of periodTasks) {
    if (!PENDING_AGES.has(t.status)) continue;
    const ageDays = Math.floor((now.getTime() - t.createdAt.getTime()) / MS_PER_DAY);
    const bucket = AGE_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max);
    if (!bucket) continue;
    if (!byCell[t.doerId]) byCell[t.doerId] = {};
    const empBuckets = byCell[t.doerId];
    if (!empBuckets) continue;
    if (!empBuckets[bucket.id]) empBuckets[bucket.id] = [];
    const bucketList = empBuckets[bucket.id];
    if (!bucketList) continue;
    bucketList.push({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      ageDays,
    });
  }

  return {
    kpis,
    pullQuote: generatePullQuote({
      doneThisWeek: wowDone.current,
      doneLastWeek: wowDone.previous,
      topPerformerName: topPerformers[0]?.employeeName ?? "the team",
      topPerformerCount: topPerformers[0]?.doneCount ?? 0,
    }),
    velocity: computeVelocity(velocityTasks, ninetyAgo, now),
    statusTable: computeEmployeeStatusTable(
      periodTasks,
      allEmployees,
      filters.view,
    ),
    statusDistribution: {
      rows: computeStatusDistribution(periodTasks).filter((r) => r.status !== "approved"),
      denominator: statusDistributionDenominator,
    },
    topPerformers,
    agingTable: computeEmployeeAgingTable(periodTasks, allEmployees, now),
    agingHeatmap: [],
    agingByDate: computeAgingByDate(periodTasks, now),
    agingHeatmapData: { byCell },
    generatedAt: now,
  };
}
