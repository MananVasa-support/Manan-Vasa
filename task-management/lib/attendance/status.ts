import type { AttendanceCode } from "@/db/enums";
import type { AttendanceSchedule } from "./schedule";

/** Parse a "HH:mm" clock string into minutes-since-midnight. */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return parseInt(h ?? "0", 10) * 60 + parseInt(m ?? "0", 10);
}

/** Per-day context the engine needs. joined/holiday/leave handling is applied
 *  by the query layer, NOT here. */
export interface DayContext {
  isWeeklyOff: boolean;
}

export interface DayCodeResult {
  code: AttendanceCode;
  dayValue: number;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  workedMinutes: number;
}

/**
 * Pure day-code rules engine. Given a check-in/check-out pair, the resolved
 * schedule, the day context, and a reference "now" (HH:mm) used to compute
 * worked minutes when the person hasn't checked out yet, return the day code.
 */
export function computeDayCode(
  punch: { inAt: string | null; outAt: string | null },
  sched: AttendanceSchedule,
  ctx: DayContext,
  refNow: string,
): DayCodeResult {
  const { inAt, outAt } = punch;

  // No check-in: weekly off => W/O (full credit), otherwise absent.
  if (!inAt) {
    return ctx.isWeeklyOff
      ? { code: "W/O", dayValue: 1, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 }
      : { code: "A", dayValue: 0, late: false, leftEarly: false, lateWaived: false, workedMinutes: 0 };
  }

  const worked = Math.max(0, (outAt ? toMin(outAt) : toMin(refNow)) - toMin(inAt));
  const late = toMin(inAt) > toMin(sched.lateAfter);
  const leftEarly = outAt != null && toMin(outAt) <= toMin(sched.earlyBefore);

  // Checked in but not out yet — can't grade the day.
  if (!outAt) {
    return { code: "incomplete", dayValue: 0, late, leftEarly: false, lateWaived: false, workedMinutes: worked };
  }

  if (worked < sched.halfDayMinutes) {
    return { code: "H/D", dayValue: 0.5, late, leftEarly, lateWaived: false, workedMinutes: worked };
  }

  // Late/early arrival is forgiven when the person still puts in a full day.
  const lateWaived = (late || leftEarly) && worked >= sched.fullDayMinutes;
  // Phase A keeps a worked weekly-off as "P" — HP (holiday-pay) extra-pay
  // crediting is a Phase B concern, so we don't special-case W/O here.
  return { code: "P", dayValue: 1, late, leftEarly, lateWaived, workedMinutes: worked };
}

/** Which attendance kind a finalized in+out day should email about (Task A8).
 *  Pure so it can be unit-tested alongside `computeDayCode`. Returns null when
 *  no email is warranted (clean day, or the day isn't finalized yet). */
export type CheckoutNotifyKind =
  | "attendance_late_waived"
  | "attendance_half_day";

export function decideCheckoutNotification(input: {
  inAt: string | null;
  outAt: string | null;
  sched: AttendanceSchedule;
}): CheckoutNotifyKind | null {
  const { inAt, outAt, sched } = input;
  if (!inAt || !outAt) return null;
  const worked = Math.max(0, toMin(outAt) - toMin(inAt));
  const late = toMin(inAt) > toMin(sched.lateAfter);
  const leftEarly = toMin(outAt) <= toMin(sched.earlyBefore);
  if (worked < sched.halfDayMinutes) return "attendance_half_day";
  if ((late || leftEarly) && worked >= sched.fullDayMinutes) {
    return "attendance_late_waived";
  }
  return null;
}
