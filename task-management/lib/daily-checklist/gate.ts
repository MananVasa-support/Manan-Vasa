import "server-only";
import {
  todayYmd,
  countPlannedItems,
  countPlannedWork,
} from "@/lib/queries/daily-checklist";
import { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";
// Re-export so existing server-side callers can still import it from here.
// CLIENT components must import from "@/lib/daily-checklist/constants" instead
// (this module is server-only — importing it from "use client" breaks the build).
export { MIN_DAILY_ITEMS, MIN_ATTENDANCE_ITEMS } from "./constants";

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
 * Role-based variant for the redesigned Plan-Your-Day (Goals Module 4). The
 * committed minimum differs by role — 3 for individual contributors, 5 for
 * managers (design §4) — so the caller passes `minItems`. Counts the SAME
 * `countPlannedItems` set as the legacy gate + the planner writes (daily_checklist
 * commits), so the gate and the /goals/plan surface can never drift. Used only
 * behind `planGateOn()`; the legacy `needsDailyChecklistPlan` is untouched.
 */
export async function needsGoalsPlanCommit(
  employeeId: string,
  minItems: number,
  now: Date = new Date(),
): Promise<boolean> {
  return (await countPlannedItems(employeeId, todayYmd(now))) < minItems;
}

/**
 * Daily-plan gate for ATTENDANCE: nobody marks themselves present without a real
 * plan for the day. The day qualifies once there are at least
 * `MIN_ATTENDANCE_ITEMS` things lined up.
 *
 * WHAT COUNTS — anything on today's plan, plus assigned work due today:
 * pulled weekly goals, pulled Y/Q/M goals, pulled WMS tasks, typed daily
 * commitments, yesterday's unfinished carried onto today, and open assigned
 * tasks due (or overdue) today. `countPlannedWork` dedupes the overlap.
 *
 * ⚠ THIS IS NOW STRICTER, and deliberately so. It previously asked only for ONE
 * item (`hasPlannedWork`) and its comment advertised that nobody who could clock
 * in before would be newly blocked. That is no longer true: someone with four
 * items who could clock in yesterday cannot today. The rule is that a day with
 * fewer than five things on it is not a planned day.
 *
 * `hasPlannedWork` in lib/queries/daily-checklist is left in place but now has
 * no callers — it is the ≥1 predicate this replaced.
 */
export async function needsDailyPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await countPlannedWork(employeeId, todayYmd(now))) < MIN_ATTENDANCE_ITEMS;
}

/**
 * How short of the bar the employee is, for messaging. Returns the count and
 * the requirement so the punch can say "3 of 5" instead of merely refusing —
 * a gate that will not say how far off you are makes people guess.
 */
export async function dailyPlanShortfall(
  employeeId: string,
  now: Date = new Date(),
): Promise<{ have: number; need: number }> {
  const have = await countPlannedWork(employeeId, todayYmd(now));
  return { have, need: MIN_ATTENDANCE_ITEMS };
}
