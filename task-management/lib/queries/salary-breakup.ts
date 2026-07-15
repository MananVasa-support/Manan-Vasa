import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, salaryBreakup, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import type { SalaryBreakup } from "@/db/schema";

const normName = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Ex-staff who appear in the salary sheet under names that never matched an
 * employee record (so the is_active filter can't hide them). Sir asked to drop
 * them from payroll — matched on the normalized sheet name.
 */
const EXCLUDED_SHEET_NAMES = new Set<string>([
  "satish sonawane", // covers the "Satish  Sonawane" double-space variant too
  "kiran",
  "sanket thorat",
  "anand singh",
  "dhanshree shigvan",
  // "himanshu lad" — Sir re-added Himanshu Lad to payroll (2026-07-15); no longer excluded.
]);

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/** Distinct salary months present in the imported sheet, newest first ('YYYY-MM'). */
export async function salaryBreakupMonths(): Promise<string[]> {
  const rows = await withRetry(
    () =>
      db
        .select({ ym: sql<string>`to_char(${salaryBreakup.month}, 'YYYY-MM')` })
        .from(salaryBreakup)
        .groupBy(sql`to_char(${salaryBreakup.month}, 'YYYY-MM')`)
        .orderBy(desc(sql`to_char(${salaryBreakup.month}, 'YYYY-MM')`)),
    { ...RETRY, label: "salary-breakup-months" },
  );
  return rows.map((r) => r.ym);
}

/**
 * Salary-breakup rows for a month ('YYYY-MM'), in sheet order, CLEANED for
 * display/analytics:
 *  - fired staff are hidden — a row whose linked employee is inactive
 *    (is_active = false) is dropped (mark an ex-employee inactive to remove
 *    them everywhere; unmatched rows, employee_id null, are always kept so a
 *    real person with name-drift never disappears);
 *  - duplicates are collapsed — the sheet can carry the same person twice under
 *    spelling variants (e.g. "Yug verma" / "Yug  verma"); we keep ONE row per
 *    person, keyed by employee_id (falling back to the normalized name for
 *    unmatched rows), keeping the lowest sr_no (the primary sheet entry).
 */
export async function listSalaryBreakup(ym: string): Promise<SalaryBreakup[]> {
  const rows = await withRetry(
    () =>
      db
        .select({ row: salaryBreakup, isActive: employees.isActive })
        .from(salaryBreakup)
        .leftJoin(employees, eq(employees.id, salaryBreakup.employeeId))
        .where(eq(salaryBreakup.month, `${ym}-01`))
        .orderBy(asc(salaryBreakup.srNo), asc(salaryBreakup.employeeName)),
    { ...RETRY, label: "salary-breakup-list" },
  );

  const seen = new Set<string>();
  const out: SalaryBreakup[] = [];
  for (const r of rows) {
    // Drop explicitly-excluded ex-staff (unmatched sheet names Sir removed).
    if (EXCLUDED_SHEET_NAMES.has(normName(r.row.employeeName))) continue;
    // Hide fired: matched to an employee who is no longer active.
    if (r.row.employeeId && r.isActive === false) continue;
    const key = r.row.employeeId ?? `name:${normName(r.row.employeeName)}`;
    if (seen.has(key)) continue; // first (lowest sr_no) wins
    seen.add(key);
    out.push(r.row);
  }
  return out;
}

/** One employee's breakup rows (their own payslip history), newest month first. */
export async function mySalaryBreakup(employeeId: string): Promise<SalaryBreakup[]> {
  return withRetry(
    () =>
      db
        .select()
        .from(salaryBreakup)
        .where(eq(salaryBreakup.employeeId, employeeId))
        .orderBy(desc(salaryBreakup.month)),
    { ...RETRY, label: "salary-breakup-mine" },
  );
}
