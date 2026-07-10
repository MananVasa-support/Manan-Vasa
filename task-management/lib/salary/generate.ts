import "server-only";
import type { SalaryInput } from "@/lib/salary/compute";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";
import {
  listSalaryProfiles,
  getAttendanceSheetPayableMap,
  sumAdvances,
  lastDisbursedRemainder,
} from "@/lib/queries/salary";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";
import { isPtExempt } from "@/lib/salary/pt-policy";

/**
 * Attendance-source cutover. Months on/after this use the app's own PUNCH
 * attendance (attendance_logs → the grader), integrating the sheet-imported
 * history (synthetic 10:30/19:30 punches through 2026-07-10) with real punches
 * from 2026-07-11 onward. Earlier months keep computing from the frozen,
 * already-paid HR sheet mirror — never re-derived, so historical pay is stable.
 */
export const SALARY_PUNCH_CUTOVER = "2026-07";

export interface MonthInputRow {
  employeeId: string;
  name: string;
  fy: string;
  month: string; // YYYY-MM
  daysInMonth: number;
  annualCtc: number;
  hasProfile: boolean; // false → no CTC set; caller flags "attendance-only"
  input: SalaryInput; // ready for computeSalary
}

/** Assemble per-employee salary-compute inputs for a YYYY-MM month from the
 *  attendance summary + each employee's profile + advances + carry-forward.
 *  DB reads only — no writes. */
export async function assembleMonthInputs(month: string): Promise<MonthInputRow[]> {
  const dim = daysInMonth(month);
  const fy = fyForMonth(month);
  const usePunch = month >= SALARY_PUNCH_CUTOVER;

  // Resolve payableDays (+ late marks) per employee from the ACTIVE source:
  //  • month ≥ cutover → the app punch grader (attendance_logs): integrated
  //    live attendance, late-mark deductions apply.
  //  • earlier → the frozen HR sheet mirror (totalDaysWorked), no late marks;
  //    the per-day divisor is calendar days-in-month either way.
  const profiles = await listSalaryProfiles();
  let payableFor: (id: string) => { payableDays: number; late: number };
  if (usePunch) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const dash = await getMonthDashboard(y, m, localDateString("Asia/Kolkata"));
    const byId = new Map(dash.map((r) => [r.employeeId, r.summary]));
    payableFor = (id) => ({
      payableDays: byId.get(id)?.payableDays ?? 0,
      late: byId.get(id)?.late ?? 0,
    });
  } else {
    const sheet = await getAttendanceSheetPayableMap(month);
    payableFor = (id) => ({ payableDays: sheet.get(id)?.totalDaysWorked ?? 0, late: 0 });
  }

  const rows: MonthInputRow[] = [];
  for (const p of profiles) {
    const { payableDays, late } = payableFor(p.employeeId);
    const ptExempt = isPtExempt({
      employeeId: p.employeeId,
      designationName: p.designationName,
    });
    const [advances, pendingBalanceIn] = await Promise.all([
      sumAdvances(p.employeeId, month),
      lastDisbursedRemainder(p.employeeId, month),
    ]);
    rows.push({
      employeeId: p.employeeId,
      name: p.name,
      fy,
      month,
      daysInMonth: dim,
      annualCtc: p.annualCtc,
      hasProfile: p.annualCtc > 0,
      input: {
        annualCtc: p.annualCtc,
        payableDays,
        daysInMonth: dim,
        ptExempt,
        tdsMonthly: p.tdsMonthly,
        lateMarksInMonth: usePunch ? late : 0,
        advances,
        pendingBalanceIn,
      },
    });
  }
  return rows;
}
