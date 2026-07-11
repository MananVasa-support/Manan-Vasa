import "server-only";
import { todayYmd, hasPlannedWork, countPlannedItems } from "@/lib/queries/daily-checklist";
import { MIN_DAILY_ITEMS } from "./constants";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS } from "./constants";

/**
 * Daily-checklist gate for the compulsory post-login wall: the day is planned
 * once there are ≥ MIN_DAILY_ITEMS items on today's plan.
 *
 * CRITICAL — counts `countPlannedItems` = the employee's COMMITTED items
 * (daily_checklist rows for today: personal items + tasks they actively pulled).
 * The client gate counts the SAME set (items where source === "personal"), so
 * the two can never disagree. Merely-assigned tasks due today do NOT count —
 * the user must ACTIVELY commit ≥ MIN, which is the whole point of the plan gate
 * (they show up as a pull-pool, not as pre-filled plan).
 */
export async function needsDailyChecklistPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await countPlannedItems(employeeId, todayYmd(now))) < MIN_DAILY_ITEMS;
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
