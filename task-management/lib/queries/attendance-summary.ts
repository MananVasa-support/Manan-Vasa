import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryProfiles } from "@/db/schema";
import {
  getEmployeeMonthStatus,
  NOT_JOINED_CODE,
  type DayRow,
} from "@/lib/queries/attendance-status";
import {
  summarize,
  type AttendanceSummary,
  type SummaryDay,
} from "@/lib/attendance/summary";
import { mondayOf, currentWeekStart, istYmd } from "@/lib/weekly-goals/week";

/**
 * Self-view attendance summary — the personal "how am I doing / how much salary
 * did I lose" numbers Sir wants every employee to see on their punch screen.
 *
 * We DON'T re-query raw punches: we lean entirely on `getEmployeeMonthStatus`
 * (which already folds punches → graded per-day rows) for the current and prior
 * month, then feed the shared pure `summarize` engine (weekly-54h waiver +
 * 3-marks-½-day deduction live in there). The only extra read is ONE row from
 * `salary_profiles` for the per-day rupee rate.
 */

/** Codes that are NOT working days — they don't count toward the expected
 *  working-day denominator, don't earn marks, and are skipped by `summarize`
 *  (weekly-off, holiday, paid/unpaid leave, comp-off). */
const OFF_CODES = new Set(["W/O", "H", "PL", "CO", "LWP"]);

export interface SelfAttendanceSummary {
  thisWeek: AttendanceSummary;
  thisMonth: AttendanceSummary;
  lastMonth: AttendanceSummary;
}

/** A day counts toward the FULL-month working-day denominator when it is a real,
 *  joined, non-off day (Present/Absent/Half/Incomplete/Holiday-worked). */
function isWorkingDay(row: DayRow): boolean {
  return row.code !== NOT_JOINED_CODE && !OFF_CODES.has(row.code);
}

/** Map a graded month-status row onto the pure summary engine's per-day shape.
 *  Off / holiday / leave / pre-join days are marked `offDay` so `summarize`
 *  excludes them from working days and from the mark tallies. */
function toSummaryDay(row: DayRow, todayIso: string): SummaryDay {
  const offDay =
    row.isWeeklyOff || OFF_CODES.has(row.code) || row.code === NOT_JOINED_CODE;
  return {
    date: row.logDate,
    weekKey: mondayOf(row.logDate),
    offDay,
    elapsed: row.logDate <= todayIso,
    result: {
      // `summarize` only reads `result` for non-off, elapsed days; the pre-join
      // sentinel "–" is always offDay, so this cast is safe.
      code: row.code as SummaryDay["result"]["code"],
      dayValue: row.dayValue,
      late: row.late,
      leftEarly: row.leftEarly,
      lateWaived: row.lateWaived,
      workedMinutes: row.workedMinutes,
    },
  };
}

/** Per-day rupee rate for a month: monthlyGross ÷ that month's full working-day
 *  count. Returns 0 when there's no CTC or no working days (never divide-by-0). */
function perDayRateFor(days: DayRow[], monthlyGross: number): number {
  const workingDays = days.filter(isWorkingDay).length;
  if (monthlyGross <= 0 || workingDays <= 0) return 0;
  return monthlyGross / workingDays;
}

/** Last day (YYYY-MM-DD) of a given year/month (month 1-12). */
function lastDayOfMonth(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getSelfAttendanceSummary(
  employeeId: string,
): Promise<SelfAttendanceSummary> {
  const todayIso = istYmd(new Date());
  const [curYear, curMonth] = todayIso.split("-").map(Number) as [number, number];

  const lastYear = curMonth === 1 ? curYear - 1 : curYear;
  const lastMonthNum = curMonth === 1 ? 12 : curMonth - 1;

  // Salary profile → monthly gross for the rupee reduction. Absent profile ⇒ 0.
  const [profile, thisMonthStatus, lastMonthStatus] = await Promise.all([
    db
      .select({ annualCtc: salaryProfiles.annualCtc })
      .from(salaryProfiles)
      .where(eq(salaryProfiles.employeeId, employeeId))
      .limit(1)
      .then((r) => r[0] ?? null),
    getEmployeeMonthStatus(employeeId, curYear, curMonth, todayIso),
    // The whole prior month is elapsed — grade it against its last day.
    getEmployeeMonthStatus(
      employeeId,
      lastYear,
      lastMonthNum,
      lastDayOfMonth(lastYear, lastMonthNum),
    ),
  ]);

  const annualCtc = profile ? Number(profile.annualCtc) : 0;
  const monthlyGross = annualCtc > 0 ? annualCtc / 12 : 0;

  const thisMonthRate = perDayRateFor(thisMonthStatus.days, monthlyGross);
  const lastMonthRate = perDayRateFor(lastMonthStatus.days, monthlyGross);

  // ── This month ──
  const thisMonth = summarize(
    thisMonthStatus.days.map((d) => toSummaryDay(d, todayIso)),
    thisMonthRate,
  );

  // ── Last month ──
  const lastMonth = summarize(
    lastMonthStatus.days.map((d) => toSummaryDay(d, todayIso)),
    lastMonthRate,
  );

  // ── This week (Mon → today) — may straddle last & this month, so draw the
  //    week's days from BOTH loaded statuses. Reduction uses this month's rate. ──
  const weekStart = currentWeekStart();
  const weekRows = [...lastMonthStatus.days, ...thisMonthStatus.days].filter(
    (d) => d.logDate >= weekStart && d.logDate <= todayIso,
  );
  const thisWeek = summarize(
    weekRows.map((d) => toSummaryDay(d, todayIso)),
    thisMonthRate,
  );

  return { thisWeek, thisMonth, lastMonth };
}
