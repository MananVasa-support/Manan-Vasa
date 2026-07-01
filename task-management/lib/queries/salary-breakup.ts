import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, salaryBreakup } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import type { SalaryBreakup } from "@/db/schema";

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

/** Every salary-breakup row for a month ('YYYY-MM'), in sheet order. */
export async function listSalaryBreakup(ym: string): Promise<SalaryBreakup[]> {
  return withRetry(
    () =>
      db
        .select()
        .from(salaryBreakup)
        .where(eq(salaryBreakup.month, `${ym}-01`))
        .orderBy(asc(salaryBreakup.srNo), asc(salaryBreakup.employeeName)),
    { ...RETRY, label: "salary-breakup-list" },
  );
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
