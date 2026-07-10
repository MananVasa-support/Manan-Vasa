import "server-only";
import type { SalaryInput } from "@/lib/salary/compute";
import { daysInMonth, fyForMonth } from "@/lib/salary/period";
import {
  listSalaryProfiles,
  getAttendanceSheetPayableMap,
  sumAdvances,
  lastDisbursedRemainder,
} from "@/lib/queries/salary";
import { isPtExempt } from "@/lib/salary/pt-policy";

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

  // Attendance now comes from the SYNCED HR "Attendance log" sheet
  // (attendance_sheet_month), not the punch dashboard: `totalDaysWorked` is the
  // payable-days base, verified to match the salary sheet's working days for
  // every settled month. The per-day divisor is the calendar days-in-month
  // (empirically the sheet's own divisor). Late-mark deductions are a punch-flow
  // concept and do not apply — the sheet's totalDaysWorked is already final.
  const [payableMap, profiles] = await Promise.all([
    getAttendanceSheetPayableMap(month),
    listSalaryProfiles(),
  ]);

  const rows: MonthInputRow[] = [];
  for (const p of profiles) {
    const att = payableMap.get(p.employeeId);
    const payableDays = att?.totalDaysWorked ?? 0;
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
        lateMarksInMonth: 0,
        advances,
        pendingBalanceIn,
      },
    });
  }
  return rows;
}
