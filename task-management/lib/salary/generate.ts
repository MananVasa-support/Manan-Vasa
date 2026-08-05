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
import { getMonthDashboardMerged } from "@/lib/queries/attendance-sheet-report";
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
  const today = localDateString("Asia/Kolkata");
  const [y, m] = month.split("-").map(Number) as [number, number];

  // Resolve payableDays (+ late marks) per employee from the ACTIVE source, so
  // salary always matches what the attendance report shows for that month:
  //  • August 2026 onward → the app punch grader (attendance_logs): live
  //    attendance, late-mark deductions apply.
  //  • July 2026 (the transition month) → the MERGED view (getMonthDashboardMerged
  //    = the report's own source: LOCKED sheet counts for sheet people + app-native
  //    graded joiners). This makes July salary == the July attendance report.
  //  • earlier → the frozen HR sheet mirror (totalDaysWorked), never re-derived,
  //    so already-paid historical pay is stable.
  // Resolve payableDays (+ late) per employee so salary always matches what the
  // ATTENDANCE REPORT shows for the month:
  //  • August 2026 onward → the app punch grader (real attendance_logs).
  //  • July 2026 → the MERGED view (`getMonthDashboardMerged` = the report's own
  //    source: locked sheet days for sheet people + app-graded joiners). Sir's
  //    call: July salary follows the July attendance report's PAYABLE column
  //    (not the old salary sheet), even though it's higher.
  //  • earlier → the frozen HR sheet mirror, never re-derived (paid history stable).
  // Late-mark payable deductions apply ONLY from the app-native era (Aug 2026+).
  // July is the transition month: its payable comes from the MERGED report, whose
  // grader already reflects lateness by grading late arrivals as half-days — so a
  // second late deduction here would double-count and push FINAL DAYS below the
  // attendance PAYABLE the user compares against. For July, FINAL DAYS == PAYABLE.
  const applyLate = month >= "2026-08";
  const profiles = await listSalaryProfiles();
  let payableFor: (id: string) => { payableDays: number; late: number };
  if (month >= "2026-08") {
    const dash = await getMonthDashboard(y, m, today);
    const byId = new Map(dash.map((r) => [r.employeeId, r.summary]));
    payableFor = (id) => ({ payableDays: byId.get(id)?.payableDays ?? 0, late: byId.get(id)?.late ?? 0 });
  } else if (month === "2026-07") {
    const dash = await getMonthDashboardMerged(y, m, today);
    const byId = new Map(dash.map((r) => [r.employeeId, r.summary]));
    payableFor = (id) => ({ payableDays: byId.get(id)?.payableDays ?? 0, late: byId.get(id)?.late ?? 0 });
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
        lateMarksInMonth: applyLate ? late : 0,
        advances,
        pendingBalanceIn,
      },
    });
  }
  return rows;
}
