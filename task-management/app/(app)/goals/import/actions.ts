"use server";

import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { goals, employees } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor, canManageGoalFor } from "@/lib/goals/scope";
import {
  yearKey,
  quarterKey,
  monthKey,
  fyStartYearOfKey,
} from "@/lib/goals/types";
import type { GoalPeriod } from "@/lib/goals/types";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

/* Header → field mapping (mirrors importWeeklyGoals). */
type ImportField =
  | "employee"
  | "period"
  | "periodKey"
  | "area"
  | "title"
  | "uom"
  | "targetQty"
  | "targetAmount"
  | "team"
  | "dependency"
  | "weight"
  | "notes";

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapHeader(raw: string): ImportField | null {
  const h = normHeader(raw);
  if (["employee", "email", "person", "name", "owner"].includes(h)) return "employee";
  if (["period", "level", "type"].includes(h)) return "period";
  if (["periodkey", "key", "bucket", "when", "quarter", "month", "year"].includes(h)) return "periodKey";
  if (["area", "category", "pillar"].includes(h)) return "area";
  if (["goal", "title", "objective", "target"].includes(h)) return "title";
  if (["uom", "unit", "unitofmeasurement", "measure"].includes(h)) return "uom";
  if (["tgt", "targetqty", "targetquantity", "qty", "quantity"].includes(h)) return "targetQty";
  if (["tgtamt", "targetamount", "amount", "targetamt", "value"].includes(h)) return "targetAmount";
  if (["team", "teaminvolved", "involved"].includes(h)) return "team";
  if (["dependency", "dependencypct", "depend", "dependencypercent"].includes(h)) return "dependency";
  if (["weight", "wt"].includes(h)) return "weight";
  if (["notes", "note", "remarks", "comment"].includes(h)) return "notes";
  return null;
}

function cleanText(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function parseIntOr(v: unknown, fallback: number | null): number | null {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function parseMoney(v: unknown): string | null {
  const raw = String(v ?? "").replace(/[₹,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Resolve a free-text period + key cell into a canonical (period, periodKey). */
function resolvePeriod(periodRaw: string, keyRaw: string): { period: GoalPeriod; periodKey: string } | null {
  const p = normHeader(periodRaw);
  const key = keyRaw.trim();
  let period: GoalPeriod | null = null;
  if (["year", "yearly", "annual", "y"].includes(p)) period = "year";
  else if (["quarter", "quarterly", "q"].includes(p)) period = "quarter";
  else if (["month", "monthly", "m"].includes(p)) period = "month";

  // Infer from the key shape when the period column is blank/ambiguous.
  if (!period) {
    if (/^\d{4}$/.test(key)) period = "year";
    else if (/-Q[1-4]$/i.test(key)) period = "quarter";
    else if (/^\d{4}-\d{2}$/.test(key)) period = "month";
  }
  if (!period) return null;

  if (period === "year") {
    const y = /^\d{4}$/.test(key) ? key : String(yearKey(new Date()));
    return { period, periodKey: y };
  }
  if (period === "quarter") {
    if (/^\d{4}-Q[1-4]$/i.test(key)) return { period, periodKey: key.toUpperCase() };
    // "Q1 2026" / "2026 Q1"
    const m = key.match(/(\d{4}).*Q([1-4])|Q([1-4]).*(\d{4})/i);
    if (m) {
      const yr = m[1] ?? m[4];
      const q = m[2] ?? m[3];
      if (yr && q) return { period, periodKey: `${yr}-Q${q}` };
    }
    return { period, periodKey: quarterKey(new Date()) };
  }
  // month
  if (/^\d{4}-\d{2}$/.test(key)) return { period, periodKey: key };
  return { period, periodKey: monthKey(new Date()) };
}

function parseTeam(v: unknown): Array<{ name: string }> | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const names = raw.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
  return names.length ? names.map((name) => ({ name })) : null;
}

async function nextGoalPosition(employeeId: string, period: string, periodKey: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${goals.position}), 0)::int` })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.period, period),
        eq(goals.periodKey, periodKey),
      ),
    );
  return (row?.max ?? 0) + 1;
}

/**
 * Bulk-import cascade goals from an xlsx / csv (mirrors importWeeklyGoals).
 * Columns: Employee · Period · PeriodKey · Area · Goal · UOM · Tgt · TgtAmt ·
 * Team · Dependency · Weight · Notes. Admins fan rows across people via the
 * Employee column; the `employeeId` form field is the default owner.
 */
export async function importGoals(
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number; warnings: string[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = formData.get("file");
  const scopedEmployee = String(formData.get("employeeId") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };

  let matrix: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "The file has no sheets" };
    const ws = wb.Sheets[sheetName]!;
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (matrix.length < 2) return { ok: false, error: "File needs a header row and at least one data row" };

  const headerRow = matrix[0] ?? [];
  const colMap: (ImportField | null)[] = headerRow.map((c) => mapHeader(String(c)));
  if (!colMap.includes("title")) {
    return { ok: false, error: "Couldn't find a Goal/Title column. Add headers like Goal, Period, PeriodKey." };
  }

  // Roster for resolving the Employee column + permission scoping.
  const roster = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));
  const byName = new Map(roster.map((e) => [normHeader(e.name), e.id]));
  const byEmail = new Map(roster.map((e) => [String(e.email ?? "").toLowerCase().trim(), e.id]));
  const scope = await goalScopeFor({ id: me.id, isAdmin });

  const warnings: string[] = [];
  const pending: Array<typeof goals.$inferInsert> = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const get = (field: ImportField): unknown => {
      const idx = colMap.indexOf(field);
      return idx === -1 ? "" : row[idx];
    };

    const title = cleanText(get("title"), 400);
    if (!title) continue; // silently skip blank rows

    // Resolve owner.
    let employeeId = scopedEmployee && scopedEmployee !== "all" ? scopedEmployee : me.id;
    const empCell = String(get("employee") ?? "").trim();
    if (empCell) {
      const resolved = byEmail.get(empCell.toLowerCase()) ?? byName.get(normHeader(empCell));
      if (resolved) employeeId = resolved;
      else {
        warnings.push(`Row ${r + 1}: employee "${empCell}" not found — skipped.`);
        continue;
      }
    }
    if (!canManageGoalFor(scope, employeeId)) {
      warnings.push(`Row ${r + 1}: you can't add goals for that person — skipped.`);
      continue;
    }

    const resolved = resolvePeriod(String(get("period") ?? ""), String(get("periodKey") ?? ""));
    if (!resolved) {
      warnings.push(`Row ${r + 1}: couldn't read the period — set Period (Year/Quarter/Month) + PeriodKey.`);
      continue;
    }
    // Guard against nonsense keys.
    if (!Number.isFinite(fyStartYearOfKey(resolved.periodKey))) {
      warnings.push(`Row ${r + 1}: bad period key "${resolved.periodKey}".`);
      continue;
    }

    pending.push({
      employeeId,
      period: resolved.period,
      periodKey: resolved.periodKey,
      parentGoalId: null,
      area: cleanText(get("area"), 160) || null,
      title,
      uom: cleanText(get("uom"), 80) || null,
      targetQty: parseMoney(get("targetQty")),
      targetAmount: parseMoney(get("targetAmount")),
      teamInvolved: parseTeam(get("team")),
      teamDependencyPct: parseIntOr(get("dependency"), null),
      weight: parseIntOr(get("weight"), 100) ?? 100,
      adopted: true,
      source: "manual",
      createdById: me.id,
      updatedById: me.id,
    });
  }

  let imported = 0;
  try {
    // Assign per-bucket sequential positions.
    const posCache = new Map<string, number>();
    for (const g of pending) {
      const cacheKey = `${g.employeeId}|${g.period}|${g.periodKey}`;
      let pos = posCache.get(cacheKey);
      if (pos == null) pos = await nextGoalPosition(g.employeeId, g.period!, g.periodKey!);
      g.position = pos;
      posCache.set(cacheKey, pos + 1);
      await db.insert(goals).values(g);
      imported++;
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/goals/cascade");
  revalidatePath("/goals/review");
  // bug #17 — imported goals must land on the 5-page level routes too.
  revalidatePath("/goals/yearly"); // yearly rootView shares the same canvas payload
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/week");
  const skipped = matrix.length - 1 - imported;
  return { ok: true, imported, skipped: Math.max(0, skipped), warnings: warnings.slice(0, 25) };
}
