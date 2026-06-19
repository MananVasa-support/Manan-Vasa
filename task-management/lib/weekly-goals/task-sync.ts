import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, weeklyGoals } from "@/db/schema";
import type { TaskStatus } from "@/db/enums";

/**
 * Two-way sync for the Goal⇄Task link (Phase 2). One Weekly Goal owns at most
 * one real Task (`weekly_goals.task_id`); the task points back
 * (`tasks.origin_goal_id`). The link keeps progress honest in both directions
 * without the user maintaining two states:
 *
 *   • Goal side drives the task via the employee's **% done** → status.
 *   • Task side drives the goal via the task's **status** → % + mirrored status.
 *
 * Both sync functions write through `db.update` DIRECTLY (never through the
 * `setWeeklyGoalPct` / `setTaskStatus` actions), so a goal→task write can't
 * re-trigger a task→goal write — no feedback loop. Both are best-effort: a
 * sync failure must never fail the user's primary mutation.
 */

/** Map a goal's % done onto a task status, preserving an existing in-progress
 *  nuance (follow_up / need_info / …) instead of flattening it to "initiated". */
export function pctToTaskStatus(pct: number, currentStatus: TaskStatus): TaskStatus {
  if (pct >= 100) return "done";
  if (pct <= 0) return "not_started";
  const isActiveNuance =
    currentStatus !== "done" &&
    currentStatus !== "not_started" &&
    currentStatus !== "dont_know";
  return isActiveNuance ? currentStatus : "initiated";
}

/** Map a task status onto a goal's % done, preserving an existing partial. */
export function taskStatusToGoalPct(status: TaskStatus, currentPct: number): number {
  if (status === "done") return 100;
  if (status === "not_started" || status === "dont_know") return 0;
  return currentPct > 0 && currentPct < 100 ? currentPct : 50;
}

/** Goal → Task: after a goal's % changes, reflect it on the linked task. */
export async function syncGoalToTask(goalId: string): Promise<void> {
  try {
    const [goal] = await db
      .select({ taskId: weeklyGoals.taskId, pctDone: weeklyGoals.pctDone })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.id, goalId));
    if (!goal?.taskId) return;

    const [task] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, goal.taskId));
    if (!task) return;

    const next = pctToTaskStatus(goal.pctDone, task.status);
    if (next === task.status) return;

    const now = new Date();
    await db
      .update(tasks)
      .set({ status: next, completedAt: next === "done" ? now : null, updatedAt: now })
      .where(eq(tasks.id, goal.taskId));
  } catch (err) {
    console.error("[task-sync] syncGoalToTask failed", goalId, err);
  }
}

/** Task → Goal: after a task's status changes, reflect it on the source goal
 *  (% done + mirrored status). `status` may be passed to skip a re-read. */
export async function syncTaskToGoal(taskId: string, status?: TaskStatus): Promise<void> {
  try {
    const [task] = await db
      .select({ originGoalId: tasks.originGoalId, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (!task?.originGoalId) return;
    const taskStatus = status ?? task.status;

    const [goal] = await db
      .select({ pctDone: weeklyGoals.pctDone, status: weeklyGoals.status })
      .from(weeklyGoals)
      .where(eq(weeklyGoals.id, task.originGoalId));
    if (!goal) return;

    const nextPct = taskStatusToGoalPct(taskStatus, goal.pctDone);
    if (nextPct === goal.pctDone && taskStatus === goal.status) return;

    const now = new Date();
    await db
      .update(weeklyGoals)
      .set({ pctDone: nextPct, status: taskStatus, pctUpdatedAt: now, updatedAt: now })
      .where(eq(weeklyGoals.id, task.originGoalId));
  } catch (err) {
    console.error("[task-sync] syncTaskToGoal failed", taskId, err);
  }
}
