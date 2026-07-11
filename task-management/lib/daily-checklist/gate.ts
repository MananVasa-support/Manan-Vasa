import "server-only";
import { todayYmd, hasPlannedWork, getTodayItems } from "@/lib/queries/daily-checklist";
import { MIN_DAILY_ITEMS } from "./constants";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS } from "./constants";

/**
 * Daily-checklist gate for the compulsory post-login wall: the day is planned
 * once there are ≥ MIN_DAILY_ITEMS items on today's plan.
 *
 * CRITICAL — counts `getTodayItems().length` (assigned-due tasks + personal
 * rows): the EXACT same set the client gate (daily-plan-gate.tsx) renders and
 * counts. Counting a DIFFERENT set here (e.g. personal rows only) is what made
 * "Start my day" buffer forever — the client showed "10 of 3, ready" while the
 * server counted 0 committed rows and re-blocked. Same query on both sides =
 * they can never disagree.
 */
export async function needsDailyChecklistPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const items = await getTodayItems(employeeId, todayYmd(now));
  return items.length < MIN_DAILY_ITEMS;
}

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
