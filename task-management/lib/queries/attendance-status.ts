import "server-only";
import { and, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, type OrgSettings } from "@/db/schema";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  resolveSchedule,
  type AttendanceSchedule,
} from "@/lib/attendance/schedule";
import { computeDayCode, type DayCodeResult } from "@/lib/attendance/status";
import type { AttendanceCode } from "@/db/enums";

/**
 * Month-status query layer (Attendance Phase A, Task A3).
 *
 * The pure rules engine (`computeDayCode`) grades a single check-in/out pair.
 * This module wraps it with the DB + calendar work: it loads an employee's
 * punches for a month, folds them to one row per day (mirroring
 * `lib/queries/attendance.ts`), walks every calendar day of the month, and
 * applies join-date / weekly-off / "today vs past" context before grading.
 *
 * All date + clock arithmetic is done in the EMPLOYEE'S timezone (default
 * Asia/Kolkata), consistent with how `punchAttendance` pins `log_date` and how
 * `listMyAttendance` reads it back. The server's own timezone (Vercel = UTC)
 * never enters the math.
 */

/** Sentinel code for days before the employee joined — not a real attendance
 *  state, so it sits outside the `AttendanceCode` union. dayValue 0. */
export const NOT_JOINED_CODE = "–" as const;
export type DayCode = AttendanceCode | typeof NOT_JOINED_CODE;

export interface DayRow {
  /** YYYY-MM-DD in the employee's timezone. */
  logDate: string;
  /** Weekday 0=Sun..6=Sat in the employee's timezone. */
  weekday: number;
  inAt: string | null; // "HH:mm" in employee tz, or null
  outAt: string | null;
  isWeeklyOff: boolean;
  code: DayCode;
  dayValue: number;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  workedMinutes: number;
}

export interface MonthSummary {
  /** Sum of dayValue across graded (joined) days — the payable day-count. */
  payableDays: number;
  present: number; // code "P"
  absent: number; // code "A"
  halfDay: number; // code "H/D"
  weeklyOff: number; // code "W/O"
  incomplete: number; // code "incomplete"
  /** Un-waived late instances (late && !lateWaived) — the actionable count. */
  late: number;
  /** All late arrivals incl. those waived by a full day. */
  lateRaw: number;
  leftEarly: number;
  lateWaived: number;
}

export interface EmployeeMonthStatus {
  employeeId: string;
  days: DayRow[];
  summary: MonthSummary;
}

// ── timezone helpers ────────────────────────────────────────────────────────

/** Calendar day (YYYY-MM-DD) of `d` in `tz`. (en-CA => YYYY-MM-DD.) */
function dateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Clock time "HH:mm" (24h) of `d` in `tz`. */
function timeInTz(d: Date, tz: string): string {
  // en-GB with hour12:false yields "HH:mm" (24h, zero-padded).
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Weekday (0=Sun..6=Sat) of a YYYY-MM-DD calendar date. The date is a pure
 *  calendar day (no clock), so UTC midnight is unambiguous. */
function weekdayOfDate(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** All YYYY-MM-DD strings in [start, end] inclusive (calendar days). */
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** First and last calendar day (YYYY-MM-DD) of a year/month (month is 1-12). */
function monthBounds(year: number, month: number): { first: string; last: string } {
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  // Day 0 of next month = last day of this month.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

// ── schedule helpers ────────────────────────────────────────────────────────

/** Company-wide schedule defaults derived from org_settings. */
export function companyDefaults(org: OrgSettings): AttendanceSchedule {
  return {
    lateAfter: org.attLateAfter ?? "10:50",
    earlyBefore: org.attEarlyBefore ?? "19:20",
    fullDayMinutes: Number(org.attFullDayHours ?? 9) * 60,
    halfDayMinutes: Number(org.attHalfDayHours ?? 5) * 60,
  };
}

/** Resolve an employee's effective schedule. Phase A only exposes the two
 *  time overrides on `employees` (lateAfter / earlyBefore); hour overrides are
 *  org-wide, so we never pass fullDayHours/halfDayHours here. */
export function employeeSchedule(
  emp: { attLateAfter: string | null; attEarlyBefore: string | null },
  defaults: AttendanceSchedule,
): AttendanceSchedule {
  return resolveSchedule(
    { lateAfter: emp.attLateAfter, earlyBefore: emp.attEarlyBefore },
    defaults,
  );
}

// ── per-day folding ─────────────────────────────────────────────────────────

interface FoldedDay {
  inAt: string | null;
  outAt: string | null;
}

/** Fold an employee's raw punch rows into per-day in/out "HH:mm" times (in the
 *  employee's timezone). The day key is recomputed from `loggedAt` in `tz` so
 *  it stays consistent with the per-day calendar walk. */
function foldPunches(
  rows: { kind: "in" | "out"; loggedAt: Date }[],
  tz: string,
): Map<string, FoldedDay> {
  const byDay = new Map<string, FoldedDay>();
  for (const r of rows) {
    const day = dateInTz(r.loggedAt, tz);
    let slot = byDay.get(day);
    if (!slot) {
      slot = { inAt: null, outAt: null };
      byDay.set(day, slot);
    }
    const t = timeInTz(r.loggedAt, tz);
    if (r.kind === "in") slot.inAt = t;
    else slot.outAt = t;
  }
  return byDay;
}

function emptySummary(): MonthSummary {
  return {
    payableDays: 0,
    present: 0,
    absent: 0,
    halfDay: 0,
    weeklyOff: 0,
    incomplete: 0,
    late: 0,
    lateRaw: 0,
    leftEarly: 0,
    lateWaived: 0,
  };
}

function tally(summary: MonthSummary, r: DayCodeResult): void {
  summary.payableDays += r.dayValue;
  switch (r.code) {
    case "P":
      summary.present += 1;
      break;
    case "A":
      summary.absent += 1;
      break;
    case "H/D":
      summary.halfDay += 1;
      break;
    case "W/O":
      summary.weeklyOff += 1;
      break;
    case "incomplete":
      summary.incomplete += 1;
      break;
  }
  if (r.late) {
    summary.lateRaw += 1;
    if (!r.lateWaived) summary.late += 1;
  }
  if (r.leftEarly) summary.leftEarly += 1;
  if (r.lateWaived) summary.lateWaived += 1;
}

// ── core grader ─────────────────────────────────────────────────────────────

interface EmpSlice {
  id: string;
  weeklyOff: number;
  timezone: string;
  joinedAt: Date | null;
  createdAt: Date;
  attLateAfter: string | null;
  attEarlyBefore: string | null;
}

/**
 * Grade one employee's month given their already-folded punches. Pure of the
 * DB so the batched dashboard path can reuse it. `refTodayISO` is "today" in
 * the relevant timezone (YYYY-MM-DD); for the current day we pass the live
 * clock as `refNow` so an in-without-out reads "open"; for any past day we use
 * end-of-day ("23:59") so an in-without-out grades as `incomplete`, not open.
 */
function gradeMonth(
  emp: EmpSlice,
  sched: AttendanceSchedule,
  byDay: Map<string, FoldedDay>,
  year: number,
  month: number,
  refTodayISO: string,
): EmployeeMonthStatus {
  const tz = emp.timezone || "Asia/Kolkata";

  const { first, last } = monthBounds(year, month);
  // The employee's local join day. Fall back to createdAt if joinedAt is null.
  const joinSource = emp.joinedAt ?? emp.createdAt;
  const joinDay = dateInTz(joinSource, tz);

  const days: DayRow[] = [];
  const summary = emptySummary();
  // Live clock "HH:mm" in this employee's tz — used only for the refToday row.
  const nowHHmm = timeInTz(new Date(), tz);

  for (const ymd of eachDay(first, last)) {
    const wd = weekdayOfDate(ymd);
    const folded = byDay.get(ymd) ?? { inAt: null, outAt: null };

    // Before the employee joined — not a gradeable day.
    if (ymd < joinDay) {
      days.push({
        logDate: ymd,
        weekday: wd,
        inAt: null,
        outAt: null,
        isWeeklyOff: false,
        code: NOT_JOINED_CODE,
        dayValue: 0,
        late: false,
        leftEarly: false,
        lateWaived: false,
        workedMinutes: 0,
      });
      continue;
    }

    const isWeeklyOff = wd === emp.weeklyOff;
    const refNow = ymd === refTodayISO ? nowHHmm : "23:59";
    const graded = computeDayCode(
      { inAt: folded.inAt, outAt: folded.outAt },
      sched,
      { isWeeklyOff },
      refNow,
    );
    tally(summary, graded);
    days.push({
      logDate: ymd,
      weekday: wd,
      inAt: folded.inAt,
      outAt: folded.outAt,
      isWeeklyOff,
      code: graded.code,
      dayValue: graded.dayValue,
      late: graded.late,
      leftEarly: graded.leftEarly,
      lateWaived: graded.lateWaived,
      workedMinutes: graded.workedMinutes,
    });
  }

  return { employeeId: emp.id, days, summary };
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Full per-day month status for one employee, with a rolled-up summary.
 * `refTodayISO` is "today" (YYYY-MM-DD) — pass the caller's notion of the
 * current day so the live row uses the live clock and past rows use EOD.
 */
export async function getEmployeeMonthStatus(
  employeeId: string,
  year: number,
  month: number,
  refTodayISO: string,
): Promise<EmployeeMonthStatus> {
  const [org, emp] = await Promise.all([
    getOrgSettings(),
    db
      .select({
        id: employees.id,
        weeklyOff: employees.weeklyOff,
        timezone: employees.timezone,
        joinedAt: employees.joinedAt,
        createdAt: employees.createdAt,
        attLateAfter: employees.attLateAfter,
        attEarlyBefore: employees.attEarlyBefore,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!emp) {
    return { employeeId, days: [], summary: emptySummary() };
  }

  const tz = emp.timezone || "Asia/Kolkata";
  const { first, last } = monthBounds(year, month);
  const rows = await db
    .select({
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
    })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        between(attendanceLogs.logDate, first, last),
      ),
    );

  const defaults = companyDefaults(org);
  const sched = employeeSchedule(emp, defaults);
  const byDay = foldPunches(rows, tz);
  return gradeMonth(emp, sched, byDay, year, month, refTodayISO);
}

export interface DashboardRow {
  employeeId: string;
  name: string;
  designation: string | null;
  summary: MonthSummary;
}

export interface MonthDashboardFilters {
  /** Restrict to a single weekly-off cohort, if set. */
  weeklyOff?: number;
}

/**
 * Month dashboard: a summary row per ACTIVE employee. Batched — ONE punch
 * query for the whole month across all employees, then grouped in memory, to
 * avoid an N+1 of per-employee log queries. Holiday/PL/LWP columns are Phase B
 * and are omitted here.
 */
export async function getMonthDashboard(
  year: number,
  month: number,
  refTodayISO: string,
  filters?: MonthDashboardFilters,
): Promise<DashboardRow[]> {
  const { first, last } = monthBounds(year, month);

  const [org, people, allRows] = await Promise.all([
    getOrgSettings(),
    db
      .select({
        id: employees.id,
        name: employees.name,
        weeklyOff: employees.weeklyOff,
        timezone: employees.timezone,
        joinedAt: employees.joinedAt,
        createdAt: employees.createdAt,
        attLateAfter: employees.attLateAfter,
        attEarlyBefore: employees.attEarlyBefore,
      })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(employees.name),
    db
      .select({
        employeeId: attendanceLogs.employeeId,
        kind: attendanceLogs.kind,
        loggedAt: attendanceLogs.loggedAt,
      })
      .from(attendanceLogs)
      .where(between(attendanceLogs.logDate, first, last)),
  ]);

  const defaults = companyDefaults(org);

  // Group raw punches by employee once.
  const rowsByEmp = new Map<string, { kind: "in" | "out"; loggedAt: Date }[]>();
  for (const r of allRows) {
    let arr = rowsByEmp.get(r.employeeId);
    if (!arr) {
      arr = [];
      rowsByEmp.set(r.employeeId, arr);
    }
    arr.push({ kind: r.kind, loggedAt: r.loggedAt });
  }

  const out: DashboardRow[] = [];
  for (const p of people) {
    if (filters?.weeklyOff != null && p.weeklyOff !== filters.weeklyOff) {
      continue;
    }
    const tz = p.timezone || "Asia/Kolkata";
    const sched = employeeSchedule(p, defaults);
    const byDay = foldPunches(rowsByEmp.get(p.id) ?? [], tz);
    const { summary } = gradeMonth(p, sched, byDay, year, month, refTodayISO);
    out.push({
      employeeId: p.id,
      name: p.name,
      designation: null, // Phase B
      summary,
    });
  }
  return out;
}
