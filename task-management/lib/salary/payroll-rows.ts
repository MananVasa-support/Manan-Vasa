import "server-only";
import type { SalaryBreakup } from "@/db/schema";

/**
 * Flatten the salary-breakup sheet rows into a clean payroll export shape —
 * exactly the figures Sir needs to pay everyone. Same source as the on-screen
 * table (already deduped, ex-staff excluded), so the export always matches what
 * the page shows. `finalPayment` is the amount to disburse.
 */
export interface PayrollExportRow {
  sr: number;
  employee: string;
  designation: string;
  entity: string;
  daysInMonth: number;
  workingDays: number;
  monthlyCtc: number;
  payableAfterLeave: number;
  pt: number;
  payableAfterPt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  salaryGiven: number | null;
  remarks: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function toPayrollRows(rows: SalaryBreakup[]): PayrollExportRow[] {
  return rows.map((r, i) => ({
    sr: r.srNo ?? i + 1,
    employee: r.employeeName,
    designation: r.designation ?? "",
    entity: r.companyName ?? "",
    daysInMonth: num(r.daysInMonth),
    workingDays: num(r.finalWorkingDays),
    monthlyCtc: num(r.monthlyCtc),
    payableAfterLeave: num(r.payableAfterLeave),
    pt: num(r.pt),
    payableAfterPt: num(r.payableAfterPt),
    advance: num(r.advance),
    previousPending: num(r.previousPending),
    finalPayment: num(r.finalPayment),
    salaryGiven: r.salaryGiven == null ? null : num(r.salaryGiven),
    remarks: r.remarks ?? "",
  }));
}

/** Column definitions shared by CSV + PDF (order = display order). */
export const PAYROLL_COLUMNS: {
  key: keyof PayrollExportRow;
  label: string;
  money?: boolean;
  num?: boolean;
}[] = [
  { key: "sr", label: "Sr", num: true },
  { key: "employee", label: "Employee" },
  { key: "designation", label: "Designation" },
  { key: "entity", label: "Entity" },
  { key: "daysInMonth", label: "Days in Month", num: true },
  { key: "workingDays", label: "Working Days", num: true },
  { key: "monthlyCtc", label: "Monthly CTC", money: true },
  { key: "payableAfterLeave", label: "Payable", money: true },
  { key: "pt", label: "PT", money: true },
  { key: "payableAfterPt", label: "After PT", money: true },
  { key: "advance", label: "Advance", money: true },
  { key: "previousPending", label: "Prev. Pending", money: true },
  { key: "finalPayment", label: "Final Payment", money: true },
  { key: "salaryGiven", label: "Salary Given", money: true },
  { key: "remarks", label: "Remarks" },
];
