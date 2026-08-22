import {
  WORKING_DAYS_PER_WEEK,
  defaultDailyMinutesFor,
} from "@/lib/attendance/effective-config";
import type { WorkerType } from "@/lib/attendance/worker-type";

/**
 * Display helpers for the editor's schedule panel — PURE, no React, so the
 * numbers on screen can be unit-tested without rendering anything.
 *
 * ⚠ NOT A SECOND SOURCE OF TRUTH. Every figure is derived from
 * `lib/attendance/effective-config.ts`, the resolver the attendance grader and
 * the salary engine read. "9 hours/day · 54 hours/week" and "4.5 hours/day · 27
 * hours/week" appear nowhere as literals: they fall out of
 * `defaultDailyMinutesFor` × `WORKING_DAYS_PER_WEEK`. Change the policy there
 * and this panel follows automatically.
 */

/** 540 → "9h", 270 → "4.5h". */
export function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h}h`;
}

/** This worker type's daily and weekly requirement, e.g. "9h/day · 54h/week". */
export function requirementFor(w: WorkerType): string {
  const daily = defaultDailyMinutesFor(w);
  return `${hoursLabel(daily)}/day · ${hoursLabel(daily * WORKING_DAYS_PER_WEEK)}/week`;
}

/** Daily + weekly target minutes for the summary card. */
export function targetsFor(w: WorkerType): { daily: number; weekly: number } {
  const daily = defaultDailyMinutesFor(w);
  return { daily, weekly: daily * WORKING_DAYS_PER_WEEK };
}

/** "10:00" → "10:00 AM". Anything not HH:mm returns "" so callers can fall back. */
export function to12h(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  if (h > 23 || m > 59) return "";
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
