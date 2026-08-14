import "server-only";

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, tasks } from "@/db/schema";
import { todayYmd, ymdForOffset, cascadeGoalLevels, PLAN_HORIZON_DAYS } from "@/lib/queries/daily-checklist";
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


/* ------------------------------------------------------------------------- */
/* WEEK BOARD — Overdue + the next 7 days as draggable columns                */
/* ------------------------------------------------------------------------- */

/** One column of the week board. `offset` is null for the Overdue column. */
export interface MyDayColumn {
  /** null for Overdue; 0 = today … 6 = six days out. */
  offset: number | null;
  /** The column's date, or null for Overdue (it spans every earlier day). */
  ymd: string | null;
  /** "Overdue" · "Today" · "Tomorrow" · "Wed" … */
  label: string;
  /** "12 AUG" — omitted for Overdue. */
  dateLabel: string | null;
  items: MyDayItem[];
}

export interface MyDayWeekPayload {
  ymd: string;
  columns: MyDayColumn[];
}

const WB_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WB_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/**
 * The whole planning week in ONE load: everything still open from BEFORE today
 * (the Overdue column) plus each of the next 7 days.
 *
 * Sir: "I need to see 7 days at a time + overdue for me to shift the tasks from
 * one day to the other" — so this is deliberately a single query over the same
 * `daily_checklist` rows the single-day view uses. Dragging a card between
 * columns re-dates that one row (transferPlanItem), which is why an item can
 * only ever be in one column.
 *
 * Overdue only counts NOT-DONE rows: a finished commitment belongs to the day it
 * was completed on, not to a pile of things still owed.
 */
export async function getMyDayWeekPayload(
  employeeId: string,
  now: Date = new Date(),
): Promise<MyDayWeekPayload> {
  const ymd = todayYmd(now);
  const lastYmd = ymdForOffset(PLAN_HORIZON_DAYS - 1, now);

  const rows = await db
    .select({
      id: dailyChecklist.id,
      planDate: dailyChecklist.planDate,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      subject: dailyChecklist.subject,
      goalId: dailyChecklist.goalId,
      taskId: dailyChecklist.taskId,
      done: dailyChecklist.done,
      donePct: dailyChecklist.donePct,
      doneNote: dailyChecklist.doneNote,
      taskNo: tasks.taskNo,
      taskStatus: tasks.status,
      taskPriority: tasks.priority,
      taskClient: tasks.client,
      taskUpdatedAt: tasks.updatedAt,
      effectiveDue: effectiveDueAtSql(),
    })
    .from(dailyChecklist)
    .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
    .where(
      and(
        eq(dailyChecklist.employeeId, employeeId),
        // Everything up to the end of the horizon. Rows BEFORE today are kept
        // (they feed the Overdue column) but only while still open — the column
        // build below drops the done ones, which are history for their own day.
        lte(dailyChecklist.planDate, lastYmd),
      ),
    )
    .orderBy(asc(dailyChecklist.planDate), asc(dailyChecklist.position), asc(dailyChecklist.committedAt));

  const cascadeLevels = await cascadeGoalLevels(rows.map((r) => r.id));

  const toItem = (r: (typeof rows)[number]): MyDayItem => {
    const dueYmd = r.effectiveDue ? istYmd(r.effectiveDue) : null;
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subject ?? r.client ?? null,
      kind: (r.goalId ? "weekly" : r.taskId ? "task" : (cascadeLevels.get(r.id) ?? "adhoc")) as PlanKind,
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
  };

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const columns: MyDayColumn[] = [
    {
      offset: null,
      ymd: null,
      label: "Overdue",
      dateLabel: null,
      items: rows.filter((r) => String(r.planDate) < ymd && !r.done).map(toItem),
    },
    ...Array.from({ length: PLAN_HORIZON_DAYS }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const dayYmd = ymdForOffset(i, now);
      return {
        offset: i,
        ymd: dayYmd,
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : (WB_WEEKDAYS[d.getDay()] ?? ""),
        dateLabel: `${String(d.getDate()).padStart(2, "0")} ${WB_MONTHS[d.getMonth()] ?? ""}`,
        items: rows.filter((r) => String(r.planDate) === dayYmd).map(toItem),
      };
    }),
  ];

  return { ymd, columns };
}
