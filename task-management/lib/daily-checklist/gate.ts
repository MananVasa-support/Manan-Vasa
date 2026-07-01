import "server-only";
import { todayYmd, hasPlannedWork } from "@/lib/queries/daily-checklist";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS } from "./constants";

/**
 * Daily-plan gate. The day is "planned" once the checklist EXISTS — i.e. the
 * employee has at least one planned item today, whether that's a manager-ASSIGNED
 * task (live from the `tasks` table) or a PERSONAL item (a `daily_checklist` row)
 * or both. So when a manager has already planned the day, the employee can clock
 * in immediately without recreating anything (one task · one owner · one record).
 *
 * This is strictly MORE permissive than the old "commit 5 rows" rule — nobody who
 * could clock in before is newly blocked — and it finally recognises assigned work.
 */
export async function needsDailyPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return !(await hasPlannedWork(employeeId, todayYmd(now)));
}
