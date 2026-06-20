import { NextResponse } from "next/server";
import { and, gte, lt, getTableColumns, eq, sql } from "drizzle-orm";
import { db, tasks, employees } from "@/lib/db";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { withTimeout } from "@/lib/db/with-timeout";
import { loadDashboardData } from "@/lib/queries/dashboard";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getMyDayCounts, getMyTodayTasks } from "@/lib/queries/my-day";
import { listDistinctSubjects } from "@/lib/queries/tasks";
import { listEmployees } from "@/lib/queries/employees";
import { listWeekGoalsAsTasks } from "@/lib/weekly-goals/as-task-row";
import { hasUnfilledWeekGoals } from "@/lib/queries/weekly-goals";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { parseFilters } from "@/lib/filters";

/**
 * TEMPORARY perf forensics probe (remove after capture). Runs the EXACT dashboard
 * query sequence from INSIDE the Vercel function so the timings reflect real
 * Vercel→Supabase in-region latency + serverless cold start — not a laptop.
 * Gated by `Authorization: Bearer <CRON_SECRET>` (same as the cron routes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Module-level: persists across warm invocations on the same instance.
let firstSeenAtMs: number | null = null;

const MS = 86_400_000;

async function step<T>(label: string, fn: () => Promise<T>, out: Record<string, unknown>[]) {
  const t = performance.now();
  try {
    const r = await withTimeout(fn(), 25_000, label);
    const ms = Math.round((performance.now() - t) * 10) / 10;
    const rows = Array.isArray(r) ? r.length : r == null ? 0 : 1;
    out.push({ step: label, ms, rows, ok: true });
    return r;
  } catch (e) {
    const ms = Math.round((performance.now() - t) * 10) / 10;
    out.push({ step: label, ms, ok: false, error: (e as Error).message });
    return null;
  }
}

async function handler(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invokedAt = performance.now();
  const wasCold = firstSeenAtMs === null;
  if (firstSeenAtMs === null) firstSeenAtMs = Date.now();

  const steps: Record<string, unknown>[] = [];

  // 1. Connection acquisition vs warm round-trip: two trivial pings.
  await step("ping_1_connect+rtt", () => db.execute(sql`select 1`), steps);
  await step("ping_2_warm_rtt", () => db.execute(sql`select 1`), steps);

  // Pick an admin to drive the per-user queries.
  const admin = await step(
    "lookup_admin_employee",
    () => db.query.employees.findFirst({ where: eq(employees.isAdmin, true) }),
    steps,
  );
  const empId = (admin as { id?: string } | null)?.id;

  // 2. The (app) layout gates (run on EVERY authed page).
  if (empId) {
    await step("gate_weekly_goals", () => hasUnfilledWeekGoals(empId), steps);
    await step("gate_daily_plan", () => needsDailyPlan(empId), steps);
  }
  await step("org_settings", () => getOrgSettings(), steps);

  // 3. Raw dashboard scans (bypass unstable_cache) — the real DB scan cost.
  const projCols = (() => {
    const { description: _d, notes: _n, searchText: _s, ...BASE } = getTableColumns(tasks);
    return { ...BASE, dueAt: effectiveDueAtSql() };
  })();
  const now = Date.now();
  await step("raw_scan_period_30d", () =>
    db.select(projCols).from(tasks).where(and(gte(tasks.createdAt, new Date(now - 30 * MS)), lt(tasks.createdAt, new Date(now + MS)))), steps);
  await step("raw_scan_wide_14d", () =>
    db.select(projCols).from(tasks).where(gte(tasks.createdAt, new Date(now - 14 * MS))), steps);
  await step("raw_scan_velocity_90d", () =>
    db.select(projCols).from(tasks).where(gte(tasks.createdAt, new Date(now - 90 * MS))), steps);

  // 4. The dashboard's actual Promise.all (as the page runs it).
  const filters = parseFilters({});
  const dashAllStart = performance.now();
  await Promise.all([
    step("page_listEmployees", () => listEmployees(), steps),
    step("page_loadDashboardData(cached)", () => loadDashboardData(filters), steps),
    step("page_getStatusDisplayMap", () => getStatusDisplayMap(), steps),
    empId ? step("page_getMyDayCounts", () => getMyDayCounts(empId), steps) : Promise.resolve(),
    empId ? step("page_getMyTodayTasks", () => getMyTodayTasks(empId), steps) : Promise.resolve(),
    step("page_listDistinctSubjects", () => listDistinctSubjects(), steps),
    empId ? step("page_listWeekGoalsAsTasks", () => listWeekGoalsAsTasks({ scope: { employeeIds: [empId] } }), steps) : Promise.resolve(),
  ]);
  const dashAllMs = Math.round((performance.now() - dashAllStart) * 10) / 10;

  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "local",
    coldInstance: wasCold,
    instanceUptimeSec: Math.round(process.uptime()),
    totalMs: Math.round((performance.now() - invokedAt) * 10) / 10,
    dashboardPromiseAllMs: dashAllMs,
    steps,
  });
}

export async function GET(request: Request) { return handler(request); }
export async function POST(request: Request) { return handler(request); }
