import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, tasks } from "@/db/schema";
import { todayYmd, cascadeGoalLevels } from "@/lib/queries/daily-checklist";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import { istYmd } from "@/lib/weekly-goals/week";
import type { PlanKind } from "@/components/goals/plan/types";
import type { TaskPriority, TaskStatus } from "@/db/enums";

/**
 * My Day (EXECUTION) payload.
 *
 * Reads the SAME `daily_checklist` rows for today that Plan My Day writes —
 * there is exactly one daily plan, and this is a second view of it, not a
 * second planning system. Whatever you committed to in Goals › Plan My Day
 * shows up here, and completing it here reflects back to the origin task /
 * goal through the same `setItemProgress` pipeline.
 *
 * ⚠ Like the plan payload, every select uses an EXPLICIT column list — never a
 * bare `select()` on daily_checklist, because that enumerates 0141's
 * `cascade_goal_id`, which may be unapplied in prod (see db/schema.ts).
 */

export interface MyDayItem {
  /** daily_checklist row id — the handle for completing / re-ordering. */
  id: string;
  title: string;
  subtitle: string | null;
  kind: PlanKind;
  done: boolean;
  donePct: number | null;
  doneNote: string | null;

  /* ── WMS linkage (kind === "task") ── */
  taskId: string | null;
  taskNo: number | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  /** EFFECTIVE due (revised ?? due_at) as an IST "YYYY-MM-DD". */
  dueYmd: string | null;
  client: string | null;
  /** Optimistic-lock token that `setTaskStatus` requires (ISO string). */
  taskUpdatedAt: string | null;
  /** Effective due is before today (IST). */
  overdue: boolean;
}

export interface MyDayPayload {
  /** IST today ("YYYY-MM-DD") — what the due marks compare against. */
  ymd: string;
  items: MyDayItem[];
  /** Has the user pressed "Start My Day"? Has the day been closed out? */
  started: boolean;
  closed: boolean;
}

export async function getMyDayPayload(employeeId: string, now: Date = new Date()): Promise<MyDayPayload> {
  const ymd = todayYmd(now);

  const [rows, dayRow] = await Promise.all([
    db
      .select({
        id: dailyChecklist.id,
        title: dailyChecklist.title,
        client: dailyChecklist.client,
        subject: dailyChecklist.subject,
        goalId: dailyChecklist.goalId,
        taskId: dailyChecklist.taskId,
        done: dailyChecklist.done,
        donePct: dailyChecklist.donePct,
        doneNote: dailyChecklist.doneNote,
        // Live WMS detail for task-linked commitments — read from `tasks`, never
        // copied, so status/priority/due are always the task's real values.
        taskNo: tasks.taskNo,
        taskStatus: tasks.status,
        taskPriority: tasks.priority,
        taskClient: tasks.client,
        taskUpdatedAt: tasks.updatedAt,
        effectiveDue: effectiveDueAtSql(),
      })
      .from(dailyChecklist)
      .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
      .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)))
      .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt)),
    db
      .select({ startedAt: dailyPlanDay.startedAt, closedAt: dailyPlanDay.closedAt })
      .from(dailyPlanDay)
      .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, ymd)))
      .limit(1),
  ]);

  const cascadeLevels = await cascadeGoalLevels(rows.map((r) => r.id));

  const items: MyDayItem[] = rows.map((r) => {
    const dueYmd = r.effectiveDue ? istYmd(r.effectiveDue) : null;
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subject ?? r.client ?? null,
      kind: (r.goalId
        ? "weekly"
        : r.taskId
          ? "task"
          : (cascadeLevels.get(r.id) ?? "adhoc")) as PlanKind,
      done: r.done,
      donePct: r.donePct,
      doneNote: r.doneNote,
      taskId: r.taskId,
      taskNo: r.taskNo,
      status: r.taskStatus,
      priority: r.taskPriority,
      dueYmd,
      client: r.taskClient ?? r.client,
      taskUpdatedAt: r.taskUpdatedAt ? r.taskUpdatedAt.toISOString() : null,
      overdue: dueYmd != null && dueYmd < ymd,
    };
  });

  const day = dayRow[0];
  return { ymd, items, started: !!day?.startedAt, closed: !!day?.closedAt };
}
