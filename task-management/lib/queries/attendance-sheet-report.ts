import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceSheetMonth, employees } from "@/db/schema";
import type { DashboardRow, MonthSummary } from "@/lib/queries/attendance-status";

/**
 * SHEET-BACKED month report — the same DashboardRow[] shape the Attendance
 * report table renders, but sourced from the synced HR "Attendance log" sheet
 * (attendance_sheet_month) instead of the punch grading. One row per employee
 * present in the sheet for that month (so historical / ex-employees show too).
 *
 * Punch-only summary fields (late, incomplete, worked minutes, leave, comp-off)
 * are 0 — the sheet doesn't carry them. `payableDays` = the sheet's
 * "Total No Days Worked". Numeric columns arrive as strings; coerced here.
 */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function getMonthDashboardFromSheet(year: number, month: number): Promise<DashboardRow[]> {
  const bucket = `${year}-${String(month).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      rowId: attendanceSheetMonth.id,
      employeeId: attendanceSheetMonth.employeeId,
      sheetName: attendanceSheetMonth.employeeName,
      sheetDesignation: attendanceSheetMonth.designation,
      present: attendanceSheetMonth.present,
      holiday: attendanceSheetMonth.holiday,
      weeklyOff: attendanceSheetMonth.weeklyOff,
      pohFull: attendanceSheetMonth.pohFull,
      pohHalf: attendanceSheetMonth.pohHalf,
      halfDay: attendanceSheetMonth.halfDay,
      absent: attendanceSheetMonth.absent,
      totalDaysWorked: attendanceSheetMonth.totalDaysWorked,
      empName: employees.name,
      empDept: employees.department,
      empMgr: employees.managerId,
    })
    .from(attendanceSheetMonth)
    .leftJoin(employees, eq(employees.id, attendanceSheetMonth.employeeId))
    .where(eq(attendanceSheetMonth.month, bucket));

  return rows
    .map((r): DashboardRow => {
      const summary: MonthSummary = {
        payableDays: n(r.totalDaysWorked),
        present: n(r.present),
        absent: n(r.absent),
        halfDay: n(r.halfDay),
        weeklyOff: n(r.weeklyOff),
        incomplete: 0,
        late: 0,
        lateRaw: 0,
        leftEarly: 0,
        lateWaived: 0,
        holiday: n(r.holiday),
        holidayPresent: n(r.pohFull),
        holidayHalfDay: n(r.pohHalf),
        paidLeave: 0,
        unpaidLeave: 0,
        compOff: 0,
        totalWorkedMinutes: 0,
      };
      return {
        // Matched employee id when the sync resolved the name; else the sheet
        // row id as a stable, unique table key.
        employeeId: r.employeeId ?? r.rowId,
        // The SHEET's own name — so the daily view can look days up by name.
        name: r.sheetName,
        designation: r.sheetDesignation,
        department: r.empDept ?? null,
        managerId: r.empMgr ?? null,
        summary,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
