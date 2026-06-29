import { and, gte, lt, inArray, getTableColumns, sql } from "drizzle-orm";
import { db, employees, tasks, taskEvents, holidays } from "@/lib/db";
import type { Task } from "@/lib/db";
import type { DashboardData, DashboardFilters, KpiSet, InitiatorBoard } from "@/lib/types";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  computeKpiTotals,
  computeStatusDistribution,
  computeAgingByDate,
  computeWeekOverWeekDelta,
  computeDailySparkline,
  computeTopPerformers,
  pickPerformersForEmployees,
  computeVelocity,
  generatePullQuote,
  computeEmployeeStatusTable,
  computeEmployeeAgingTable,
  computePunctuality,
  computeDoneOnTime,
  computeNotApprovedAging,
  computeInitiatorScorecard,
  countWorkingDays,
} from "@/lib/transforms";
import { AGE_BUCKETS, PENDING_STATUSES } from "@/db/enums";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import type { TaskStatus } from "@/db/enums";
import type { AgingHeatmapData } from "@/lib/types";
import {
  employeeIdsInDepartments,
  getEmployeeDepartmentMap,
} from "@/lib/queries/departments";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// All task columns EXCEPT the large free-text fields. The dashboard transforms
// never read them, and shipping them on every row of three full scans bloats the
// payload over the remote connection — which is what makes a scan's RESULT SEND
// slow enough to be orphaned (stuck "sending to a dead client" for minutes,
// holding a pooled connection). CRITICAL: also drop `searchText` — it's a
// GENERATED column that concatenates title+description+client+subject+notes, so
// shipping it re-ships everything we just dropped. (Verified: no transform reads
// description / notes / searchText.)
const {
  description: _description,
  notes: _notes,
  searchText: _searchText,
  ...TASK_COLS_BASE
} = getTableColumns(tasks);

// Overdue/due-today/due-this-week counts must read the EFFECTIVE due
// (revised ?? original), so project `dueAt` as that COALESCE for every
// dashboard scan. `due_at` itself is immutable; revisions live in
// `revised_target_date`. A fresh projection per call keeps each query's
// sql fragment its own (drizzle chunks aren't meant to be shared).
const taskCols = () => ({ ...TASK_COLS_BASE, dueAt: effectiveDueAtSql(), originalDueAt: tasks.dueAt });

/**
 * Cached dashboard aggregate. The three task scans + transforms are
 * expensive against the remote DB (multiple seconds each), and the data
 * only needs to be near-real-time — so we memoise per filter-set for 60s,
 * tagged with CACHE_TAGS.tasks. Every task create/edit/delete already calls
 * updateTag(CACHE_TAGS.tasks), so mutations bust this instantly
 * (read-your-writes); otherwise repeated dashboard views are served from
 * cache instead of re-paying the multi-second query cost.
 *
 * `generatedAt` is stamped fresh OUTSIDE the cache so the header time stays
 * current and we avoid the unstable_cache Date→string round-trip.
 */
export async function loadDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const keyParts = [
    "dashboard-data:v1",
    filters.startDate?.toISOString() ?? "_",
    filters.endDate?.toISOString() ?? "_",
    filters.view,
    filters.employeeIds.join(","),
    filters.departments.join(","),
    filters.priorities.join(","),
    filters.subjects.join(","),
  ];
  const data = await unstable_cache(
    () => loadDashboardDataUncached(filters),
    keyParts,
    // Own tag (NOT `tasks`): task writes no longer bust this expensive org
    // aggregate — it serves from the 60s TTL. Kills the per-write recompute
    // storm under concurrency (Operation Butter P0 / ARCHITECTURE.md Law 10).
    { revalidate: 60, tags: [CACHE_TAGS.dashboard] },
  )();
  return { ...data, generatedAt: new Date() };
}

async function loadDashboardDataUncached(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const start =
    filters.startDate ?? new Date(Date.now() - 30 * MS_PER_DAY);
  const end = filters.endDate ?? new Date();

  // Base = date/priority/subject scoping; people = the employee/department
  // narrowing. Kept separate so the Top-Performers ranking can run on the
  // base scope — a user filtered to themselves must see their TRUE position
  // in the whole team, not "1st of 1".
  const baseConditions = [
    gte(tasks.createdAt, start),
    lt(tasks.createdAt, new Date(end.getTime() + MS_PER_DAY)),
  ];
  if (filters.priorities.length > 0) {
    baseConditions.push(inArray(tasks.priority, filters.priorities));
  }
  if (filters.subjects.length > 0) {
    baseConditions.push(inArray(tasks.subject, filters.subjects));
  }

  const peopleConditions = [];
  let departmentEmployeeIds: string[] = [];
  if (filters.employeeIds.length > 0) {
    const idCol =
      filters.view === "doer" ? tasks.doerId : tasks.initiatorId;
    peopleConditions.push(inArray(idCol, filters.employeeIds));
  }
  if (filters.departments.length > 0) {
    // Match doers who belong to ANY selected department via the membership
    // join table (not just their primary department).
    departmentEmployeeIds = await employeeIdsInDepartments(filters.departments);
    if (departmentEmployeeIds.length === 0) {
      // no matching employees → no matching tasks
      peopleConditions.push(inArray(tasks.doerId, ["00000000-0000-0000-0000-000000000000"]));
    } else {
      peopleConditions.push(inArray(tasks.doerId, departmentEmployeeIds));
    }
  }
  const conditions = [...baseConditions, ...peopleConditions];
  const peopleFilterActive = peopleConditions.length > 0;

  const fourteenAgo = new Date(Date.now() - 14 * MS_PER_DAY);
  const ninetyAgo = new Date(Date.now() - 90 * MS_PER_DAY);

  const [allEmployees, periodTasksRaw, wideTasksRaw, velocityTasksRaw, departmentMap, rankingTasksRaw] =
    await Promise.all([
      db.select().from(employees),
      db.select(taskCols()).from(tasks).where(and(...conditions)),
      db.select(taskCols()).from(tasks).where(gte(tasks.createdAt, fourteenAgo)),
      db.select(taskCols()).from(tasks).where(gte(tasks.createdAt, ninetyAgo)),
      getEmployeeDepartmentMap(),
      // Ranking scope: only fetched when a people filter narrows the period
      // set — otherwise the period set IS the ranking set.
      peopleFilterActive
        ? db.select(taskCols()).from(tasks).where(and(...baseConditions))
        : Promise.resolve(null),
    ]);
  // Cast back to Task[] for the transform signatures — the dropped
  // description/notes fields are simply absent and never accessed.
  const periodTasks = periodTasksRaw as unknown as Task[];
  const wideTasks = wideTasksRaw as unknown as Task[];
  const velocityTasks = velocityTasksRaw as unknown as Task[];
  const rankingTasks = (rankingTasksRaw ?? periodTasksRaw) as unknown as Task[];

  const now = new Date();

  // ── Three extra dashboard datasets (each FAIL-OPEN so they can never crash
  //    the dashboard). Run alongside the main work via their own Promise.all. ──
  const MS = MS_PER_DAY;
  const sevenAgo = new Date(now.getTime() - 7 * MS);
  const threeAgo = new Date(now.getTime() - 3 * MS);

  const [notApprovedRows, sentBackEvents, initiatorTasksRaw, holidayRows] = await Promise.all([
    // Declined tasks (STRICT) — id, title, doer, completed_at, created_at.
    db.select({
        id: tasks.id, title: tasks.title, doerId: tasks.doerId,
        completedAt: tasks.completedAt, createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(
        sql`(${tasks.approvalStatus} = 'not_approved' OR ${tasks.status} = 'not_approved')`,
        sql`${tasks.archived} = false`,
      ))
      .catch(() => [] as { id: string; title: string; doerId: string; completedAt: Date | null; createdAt: Date }[]),

    // Latest "entered not_approved" event time per task. Real shape (verified
    // against prod): event_type='status_changed', to_value->>'status'. The
    // extra 'declined'/'approvalStatus' checks are harmless robustness.
    db.execute(sql`
      SELECT task_id, MAX(created_at) AS sent_back_at
        FROM ${taskEvents}
       WHERE event_type IN ('status_changed','declined')
         AND (to_value->>'status' = 'not_approved' OR to_value->>'approvalStatus' = 'not_approved')
       GROUP BY task_id
    `).then((r) => (r as unknown as { task_id: string; sent_back_at: string }[]))
      .catch(() => [] as { task_id: string; sent_back_at: string }[]),

    // Initiator window: tasks created in the last 7 days (covers both toggles).
    db.select({ initiatorId: tasks.initiatorId, doerId: tasks.doerId, createdAt: tasks.createdAt })
      .from(tasks)
      .where(and(gte(tasks.createdAt, sevenAgo), sql`${tasks.archived} = false`))
      .catch(() => [] as { initiatorId: string; doerId: string; createdAt: Date }[]),

    // Holidays within the 7-day window for working-day math.
    db.select({ holidayDate: holidays.holidayDate }).from(holidays)
      .where(gte(holidays.holidayDate, sevenAgo.toISOString().slice(0, 10)))
      .catch(() => [] as { holidayDate: string }[]),
  ]);

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
  // Tier-3 (2026-05-20) — `pending` covers every non-terminal status EXCEPT
  // the dedicated `need_info` tile + `not_started` (which has its own tile).
  // That mirrors computeKpiTotals. (need_help retired 2026-06-10 → need_info.)
  const PENDING_SET = new Set<TaskStatus>(PENDING_STATUSES);
  const isPending = (s: TaskStatus) =>
    PENDING_SET.has(s) && s !== "not_started" && s !== "need_info";
  const isNeedHelp = (s: TaskStatus) => s === "need_info";

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

  // ── WMS operational summary (shown when a KPI card is expanded) ──────────
  // Day boundaries in UTC; form-created tasks store dueAt at noon UTC, so UTC
  // day comparison classifies them correctly without timezone drift.
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUTC = new Date(todayUTC.getTime() + MS_PER_DAY);
  const weekUTC = new Date(todayUTC.getTime() + 7 * MS_PER_DAY);

  const openTasks = periodTasks.filter((t) => !t.archived && PENDING_SET.has(t.status));
  const doneTasks = periodTasks.filter((t) => isDone(t.status));
  const approvedN = periodTasks.filter(
    (t) => t.status === "approved" || t.approvalStatus === "approved",
  ).length;
  const notApprovedN = periodTasks.filter(
    (t) => t.status === "not_approved" || t.approvalStatus === "not_approved",
  ).length;
  const completed = periodTasks.filter((t) => t.completedAt != null);

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const avgDays = (rows: Task[], to: (t: Task) => number) =>
    rows.length > 0
      ? Math.round(rows.reduce((s, t) => s + (to(t) - t.createdAt.getTime()), 0) / rows.length / MS_PER_DAY)
      : 0;

  const wmsSummary = {
    overdue: openTasks.filter((t) => t.dueAt < todayUTC).length,
    dueToday: openTasks.filter((t) => t.dueAt >= todayUTC && t.dueAt < tomorrowUTC).length,
    dueThisWeek: openTasks.filter((t) => t.dueAt >= todayUTC && t.dueAt < weekUTC).length,
    completionRate: pct(doneTasks.length, totals.total),
    approvalRate: pct(approvedN, approvedN + notApprovedN),
    avgAgeDays: avgDays(openTasks, () => now.getTime()),
    avgTimeToDoneDays: avgDays(completed, (t) => t.completedAt!.getTime()),
  };

  const wowDone = computeWeekOverWeekDelta(
    wideTasks.filter((t) => isDone(t.status)),
    now,
  );

  // Rank the WHOLE team on the base scope, then narrow the display to the
  // filtered people (keeping their global rank). No people filter → top 6.
  const globalRanking = computeTopPerformers(
    rankingTasks,
    allEmployees,
    now,
    Number.MAX_SAFE_INTEGER,
  );
  const focusEmployeeIds =
    filters.employeeIds.length > 0
      ? filters.employeeIds
      : departmentEmployeeIds;
  const topPerformers =
    focusEmployeeIds.length > 0
      ? pickPerformersForEmployees(globalRanking, focusEmployeeIds, allEmployees, 10)
      : globalRanking.slice(0, 6);

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

  // D16 — on-time vs late delivery, off the same filtered period scan
  // (`periodTasks.dueAt` is already the effective revised-or-original due).
  const nameById = new Map(allEmployees.map((e) => [e.id, e.name] as const));
  const punctuality = computePunctuality(periodTasks, nameById);

  // ① Done on-time + aging (Original vs Revised). periodTasks already carry
  //    originalDueAt (Step 1) + effective dueAt.
  const doneOnTime = computeDoneOnTime(periodTasks as unknown as Parameters<typeof computeDoneOnTime>[0], nameById);

  // ② Not Approved — anchor = event time → completed_at → created_at.
  const sentBackByTask = new Map(sentBackEvents.map((e) => [e.task_id, e.sent_back_at] as const));
  const notApprovedAging = computeNotApprovedAging(
    notApprovedRows.map((t) => ({
      id: t.id, title: t.title, doerId: t.doerId,
      sentBackAt: sentBackByTask.get(t.id) ?? t.completedAt ?? t.createdAt,
    })),
    nameById,
    now,
  );

  // ③ Manager Initiator — split the 7-day scan into 3-day and 7-day windows.
  const holidaySet = new Set(holidayRows.map((h) => h.holidayDate));
  const initEmployees = allEmployees.map((e) => ({ id: e.id, name: e.name, managerId: e.managerId, email: e.email }));
  const board = (since: Date, windowDays: number): InitiatorBoard => {
    const wd = countWorkingDays(since, now, holidaySet); // Sunday off (default)
    const windowTasks = initiatorTasksRaw.filter((t) => t.createdAt >= since)
      .map((t) => ({ initiatorId: t.initiatorId, doerId: t.doerId }));
    return { windowDays, workingDays: wd, managers: computeInitiatorScorecard(windowTasks, initEmployees, wd, isFounderEmail) };
  };
  const initiator = { d3: board(threeAgo, 3), d7: board(sevenAgo, 7) };

  return {
    kpis,
    wmsSummary,
    punctuality,
    pullQuote: generatePullQuote({
      doneThisWeek: wowDone.current,
      doneLastWeek: wowDone.previous,
      // Always the GLOBAL #1 — never the first of a filtered selection.
      topPerformerName: globalRanking[0]?.employeeName ?? "the team",
      topPerformerCount: globalRanking[0]?.doneCount ?? 0,
    }),
    velocity: computeVelocity(velocityTasks, ninetyAgo, now),
    statusTable: computeEmployeeStatusTable(
      periodTasks,
      allEmployees,
      filters.view,
      departmentMap,
    ),
    statusDistribution: {
      rows: computeStatusDistribution(periodTasks).filter((r) => r.status !== "approved"),
      denominator: statusDistributionDenominator,
      summary: {
        // Open work still awaiting a verdict (non-terminal, not archived,
        // no approval decision recorded yet).
        pending: periodTasks.filter(
          (t) =>
            !t.archived &&
            PENDING_SET.has(t.status) &&
            t.approvalStatus == null &&
            t.status !== "done",
        ).length,
        // Declined — either the legacy status or the new approval column.
        notApproved: periodTasks.filter(
          (t) =>
            !t.archived &&
            (t.status === "not_approved" || t.approvalStatus === "not_approved"),
        ).length,
        archived: periodTasks.filter((t) => t.archived).length,
      },
    },
    topPerformers,
    agingTable: computeEmployeeAgingTable(periodTasks, allEmployees, now),
    agingHeatmap: [],
    agingByDate: computeAgingByDate(periodTasks, now),
    agingHeatmapData: { byCell },
    doneOnTime,
    notApprovedAging,
    initiator,
    generatedAt: now,
  };
}
