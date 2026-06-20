import { sql, and, gte, lt, getTableColumns, eq } from "drizzle-orm";
import { db, tasks, employees } from "@/lib/db";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
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
import { getCurrentEmployee } from "@/lib/auth/current";

// PERF FORENSICS (temporary): persists across warm invocations on an instance.
let probeFirstSeen: number | null = null;
const DAY_MS = 86_400_000;

/**
 * Phase 4.5 — actually checks the dependencies an external uptime monitor
 * cares about. Returns 200 only if Postgres responds AND Supabase Storage
 * lists the documents bucket within the timeouts below. Anything failing
 * returns 503 with a per-check breakdown so the alert that pages you also
 * tells you where to look.
 *
 * Public (allowed by middleware's PUBLIC_API allowlist). Safe to expose
 * — no DB rows or secrets leak, only liveness booleans + latencies.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

const DB_TIMEOUT_MS = 1500;
const STORAGE_TIMEOUT_MS = 2500;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function checkDb(): Promise<Check> {
  const started = performance.now();
  try {
    await withTimeout(db.execute(sql`select 1`), DB_TIMEOUT_MS, "db");
    return { name: "db", ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      name: "db",
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkStorage(): Promise<Check> {
  const started = performance.now();
  try {
    // SUPABASE_SERVICE_ROLE_KEY is optional in some environments (the docs
    // feature degrades cleanly). Don't fail health if it's just unset.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { name: "storage", ok: true, ms: 0, error: "skipped (no service-role key)" };
    }
    const admin = getSupabaseAdmin();
    const res = await withTimeout(
      admin.storage.getBucket(DOCUMENTS_BUCKET),
      STORAGE_TIMEOUT_MS,
      "storage",
    );
    if (res.error) throw new Error(res.error.message);
    return { name: "storage", ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      name: "storage",
      ok: false,
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * PERF FORENSICS (temporary, remove after capture): `?deep=<CRON_SECRET>` runs
 * the EXACT dashboard query sequence from inside this Vercel function and returns
 * per-step timings — so the numbers reflect real Vercel→Supabase in-region
 * latency + serverless cold start. Lives in this EXISTING route because this
 * project's Vercel build doesn't reliably register NEWLY-added routes.
 */
async function probeStep<T>(label: string, fn: () => Promise<T>, out: Record<string, unknown>[]) {
  const t = performance.now();
  try {
    const r = await withTimeout(fn(), 25_000, label);
    out.push({ step: label, ms: Math.round((performance.now() - t) * 10) / 10, rows: Array.isArray(r) ? r.length : r == null ? 0 : 1, ok: true });
    return r;
  } catch (e) {
    out.push({ step: label, ms: Math.round((performance.now() - t) * 10) / 10, ok: false, error: (e as Error).message });
    return null;
  }
}

async function runDeepProbe(): Promise<Response> {
  const invokedAt = performance.now();
  const wasCold = probeFirstSeen === null;
  if (probeFirstSeen === null) probeFirstSeen = Date.now();
  const steps: Record<string, unknown>[] = [];

  await probeStep("ping_1_connect+rtt", () => db.execute(sql`select 1`), steps);
  await probeStep("ping_2_warm_rtt", () => db.execute(sql`select 1`), steps);

  const admin = await probeStep("lookup_admin_employee", () => db.query.employees.findFirst({ where: eq(employees.isAdmin, true) }), steps);
  const empId = (admin as { id?: string } | null)?.id;

  if (empId) {
    await probeStep("gate_weekly_goals", () => hasUnfilledWeekGoals(empId), steps);
    await probeStep("gate_daily_plan", () => needsDailyPlan(empId), steps);
  }
  await probeStep("org_settings", () => getOrgSettings(), steps);

  const { description: _d, notes: _n, searchText: _s, ...BASE } = getTableColumns(tasks);
  const projCols = { ...BASE, dueAt: effectiveDueAtSql() };
  const now = Date.now();
  await probeStep("raw_scan_period_30d", () => db.select(projCols).from(tasks).where(and(gte(tasks.createdAt, new Date(now - 30 * DAY_MS)), lt(tasks.createdAt, new Date(now + DAY_MS)))), steps);
  await probeStep("raw_scan_wide_14d", () => db.select(projCols).from(tasks).where(gte(tasks.createdAt, new Date(now - 14 * DAY_MS))), steps);
  await probeStep("raw_scan_velocity_90d", () => db.select(projCols).from(tasks).where(gte(tasks.createdAt, new Date(now - 90 * DAY_MS))), steps);

  const filters = parseFilters({});
  const dashStart = performance.now();
  await Promise.all([
    probeStep("page_listEmployees", () => listEmployees(), steps),
    probeStep("page_loadDashboardData(cached)", () => loadDashboardData(filters), steps),
    probeStep("page_getStatusDisplayMap", () => getStatusDisplayMap(), steps),
    empId ? probeStep("page_getMyDayCounts", () => getMyDayCounts(empId), steps) : Promise.resolve(),
    empId ? probeStep("page_getMyTodayTasks", () => getMyTodayTasks(empId), steps) : Promise.resolve(),
    probeStep("page_listDistinctSubjects", () => listDistinctSubjects(), steps),
    empId ? probeStep("page_listWeekGoalsAsTasks", () => listWeekGoalsAsTasks({ scope: { employeeIds: [empId] } }), steps) : Promise.resolve(),
  ]);
  const dashAllMs = Math.round((performance.now() - dashStart) * 10) / 10;

  return Response.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "local",
    coldInstance: wasCold,
    instanceUptimeSec: Math.round(process.uptime()),
    totalMs: Math.round((performance.now() - invokedAt) * 10) / 10,
    dashboardPromiseAllMs: dashAllMs,
    steps,
  });
}

export async function GET(request: Request) {
  // TEMPORARY perf-audit probe (removed after capture). Gated by a real
  // ADMIN SESSION — no shared token. Read-only; returns only timings + counts.
  if (new URL(request.url).searchParams.get("deep")) {
    const me = await getCurrentEmployee();
    if (me?.isAdmin) return runDeepProbe();
    return Response.json({ error: "admin session required" }, { status: 403 });
  }
  const [dbCheck, storageCheck] = await Promise.all([checkDb(), checkStorage()]);
  const checks = [dbCheck, storageCheck];
  // Storage is treated as "warning, not fatal" — Documents is one feature.
  // Only the DB being down constitutes hard down.
  const hardDown = !dbCheck.ok;

  return Response.json(
    {
      ok: !hardDown,
      service: "altus-corp-dashboard",
      ts: new Date().toISOString(),
      checks,
    },
    { status: hardDown ? 503 : 200 },
  );
}
