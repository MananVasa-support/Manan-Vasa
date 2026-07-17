/**
 * Attendance PERIOD summary — the numbers Sir wants on the self-view + salary:
 * "how many of how many days present, late, early, half-days, hours/day, and how
 * much salary got reduced." Pure so it's unit-testable; the query layer feeds it
 * pre-computed per-day results (from computeDayCode) + the per-day salary rate.
 *
 * Two Sir rules live HERE (they're period-level, not per-day):
 *  • WEEKLY 54h WAIVER (#8): if a Mon–Sat week totals ≥ 54 worked hours, ALL of
 *    that week's late / early / half-day marks are waived — the half-days are
 *    upgraded to full present days and the late/early marks drop to zero.
 *  • COMBINED late+early DEDUCTION (#3/#5): after waivers, every 3 marks (late
 *    check-in + early check-out counted together) costs an extra ½ day.
 */
import type { DayCodeResult } from "./status";

/** Weekly worked-hours target (Mon–Sat, 6 × 9h). */
export const WEEK_TARGET_MINUTES = 54 * 60;

export interface SummaryDay {
  /** yyyy-mm-dd (IST). */
  date: string;
  /** Monday of this day's week, yyyy-mm-dd — the 54h-waiver bucket. */
  weekKey: string;
  /** Off / holiday days don't count toward working days or marks. */
  offDay: boolean;
  /** True once the day is in the past (don't count future days of the month). */
  elapsed: boolean;
  result: DayCodeResult;
}

export interface AttendanceSummary {
  workingDays: number; // elapsed, non-off days expected in
  presentDays: number; // Σ day value AFTER the weekly waiver (full 1 / half 0.5)
  lateDays: number; // late-check-in marks after waiver
  earlyDays: number; // early-check-out marks after waiver
  halfDays: number; // half-day marks after waiver
  absentDays: number; // full absences
  workedHours: number; // total, 1-dp
  avgHoursPerDay: number; // over days present, 1-dp
  markDeductionDays: number; // floor((late+early)/3) × 0.5
  deductionDays: number; // (workingDays − presentDays) + markDeductionDays
  payableDays: number; // workingDays − deductionDays (before any wave-off)
  salaryReduced: number; // deductionDays × perDayRate, rounded
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarize(days: SummaryDay[], perDayRate: number): AttendanceSummary {
  // Group the elapsed, non-off days by week so we can test the 54h target.
  const byWeek = new Map<string, SummaryDay[]>();
  for (const d of days) {
    if (d.offDay || !d.elapsed) continue;
    const arr = byWeek.get(d.weekKey);
    if (arr) arr.push(d);
    else byWeek.set(d.weekKey, [d]);
  }

  let workingDays = 0;
  let presentDays = 0;
  let lateDays = 0;
  let earlyDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let workedMinutes = 0;

  for (const [, week] of byWeek) {
    const weekWorked = week.reduce((s, d) => s + d.result.workedMinutes, 0);
    const waived = weekWorked >= WEEK_TARGET_MINUTES;

    for (const d of week) {
      workingDays += 1;
      workedMinutes += d.result.workedMinutes;
      const isAbsent = d.result.code === "A";
      const isHalf = d.result.dayValue === 0.5;

      if (isAbsent) {
        absentDays += 1;
        // an absence is not "waivable" by hours — you weren't there
        continue;
      }

      if (waived) {
        // Week hit 54h → this day counts as a FULL present day, marks cleared.
        presentDays += 1;
        continue;
      }

      presentDays += d.result.dayValue;
      if (isHalf) halfDays += 1;
      // A day already forgiven per-day (worked full 9h despite late/early) doesn't
      // count its late/early mark; otherwise it does.
      if (d.result.late && !d.result.lateWaived) lateDays += 1;
      if (d.result.leftEarly && !d.result.lateWaived) earlyDays += 1;
    }
  }

  const markDeductionDays = Math.floor((lateDays + earlyDays) / 3) * 0.5;
  const deductionDays = workingDays - presentDays + markDeductionDays;
  const payableDays = workingDays - deductionDays;
  const salaryReduced = Math.round(deductionDays * perDayRate);
  const daysCounted = presentDays > 0 ? presentDays : 1;

  return {
    workingDays,
    presentDays: round1(presentDays),
    lateDays,
    earlyDays,
    halfDays,
    absentDays,
    workedHours: round1(workedMinutes / 60),
    avgHoursPerDay: round1(workedMinutes / 60 / daysCounted),
    markDeductionDays,
    deductionDays: round1(deductionDays),
    payableDays: round1(payableDays),
    salaryReduced,
  };
}
