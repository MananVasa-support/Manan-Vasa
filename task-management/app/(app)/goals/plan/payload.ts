import "server-only";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay, tasks, weeklyGoals } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import { MIN_ATTENDANCE_ITEMS } from "@/lib/daily-checklist/constants";
import {
  ymdForOffset,
  clampDayOffset,
  todayYmd,
  cascadeGoalLevels,
  listGoalsForPlanner,
  listOpenTasksForChecklist,
  getOverdueItems,
  type OverdueItem,
} from "@/lib/queries/daily-checklist";
import { istYmd } from "@/lib/weekly-goals/week";
import { yearKey, quarterKey, monthKey } from "@/lib/goals/types";
import { isManagerWithReports } from "@/lib/manager-gates";
import type {
  PlanDayPayload,
  PlanItem,
  PlanKind,
  PlanPhase,
  SourceItem,
} from "@/components/goals/plan/types";
import type { Goal } from "@/lib/goals/types";

/**
 * Plan-Your-Day payload assembler — the ONE place the person-day data set is
 * built. Consumed by BOTH surfaces so they can never drift (Phase 5, design
 * §2.1: "the /goals/plan route stays as a deep-link alias but renders the same
 * component"):
 *   · app/(app)/goals/plan/page.tsx        — the full-page route (production)
 *   · loadPlanDay (plan/actions.ts)        — the canvas Day zoom stage, lazily
 *                                            fetched behind GOALS_CANVAS_ON.
 *
 * ⚠ Runs on the PRODUCTION path regardless of the canvas flag — it must never
 * reference `daily_checklist.cascade_goal_id` (migration 0141 may be
 * unapplied). Every select below uses an explicit column list.
 */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-20" → "20 Jul" (no timezone parse, so no off-by-one shift). */
function shortDue(ymd: string | null): string | null {
  if (!ymd) return null;
  const [, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return null;
  return `${Number(d)} ${MONTH_ABBR[mi]}`;
}

/** Whole calendar-days from `from` to `to` (both IST ymd); +ve when to > from. */
function ymdDiffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Previously-unfinished commitments (prior-day rows, not done) → the "Unfinished"
 * pull box. Dedupe by origin (goal/task/title), drop anything already re-pulled
 * onto today's plan, and cap so a long tail can't flood the column.
 */
/** The most descriptive label for a task card: its real description first, then
 *  the title — many WMS tasks store the CLIENT in `title`, so the description is
 *  what the user actually wants to read. Falls back to the client / "Untitled". */
function displayTitle(title: string | null, description: string | null, client: string | null): string {
  const desc = description?.trim();
  if (desc) return desc;
  const t = title?.trim();
  if (t) return t;
  return client?.trim() || "Untitled";
}

/** Drop the subtitle when it just repeats the title (the "Altus Corp / Altus Corp"
 *  duplication). */
function dedupeSub(title: string, subtitle: string | null): string | null {
  const s = subtitle?.trim();
  if (!s) return null;
  return s.toLowerCase() === title.trim().toLowerCase() ? null : s;
}

function buildUnfinished(
  rows: OverdueItem[],
  planRows: { goalId: string | null; taskId: string | null }[],
): SourceItem[] {
  const todayGoals = new Set(planRows.map((r) => r.goalId).filter(Boolean) as string[]);
  const todayTasks = new Set(planRows.map((r) => r.taskId).filter(Boolean) as string[]);
  const seen = new Set<string>();
  const out: SourceItem[] = [];
  for (const r of rows) {
    if (r.goalId && todayGoals.has(r.goalId)) continue;
    if (r.taskId && todayTasks.has(r.taskId)) continue;
    const key = r.goalId ?? r.taskId ?? `t:${r.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = displayTitle(r.title, r.description, r.client);
    out.push({
      id: r.id,
      kind: "unfinished",
      title: label,
      subtitle: dedupeSub(label, r.client ?? r.subject ?? null),
      meta: r.taskNo ? `#${r.taskNo}` : null,
      added: false,
      overdue: true,
      dueLabel: "Carried over",
      // Provenance — a carried-over row shows what it originally was and the
      // day it was first committed. Re-adding it REUSES that goal_id/task_id
      // (addUnfinishedToPlan), so nothing is duplicated.
      originKind: r.goalId ? "weekly" : r.taskId ? "task" : "adhoc",
      fromYmd: r.planDate,
      taskNo: r.taskNo,
      project: r.client ?? r.subject ?? null,
      taskId: r.taskId,
    });
  }
  return out.slice(0, 40);
}

/** Cascade goal → source card. subtitle = its Area; meta = self-% when logged. */
function goalToSource(g: Goal, kind: SourceItem["kind"]): SourceItem {
  return {
    id: g.id,
    kind,
    title: g.title,
    subtitle: g.area ?? g.uom ?? null,
    meta: g.pctDone > 0 ? `${g.pctDone}%` : null,
    added: false,
  };
}

/**
 * Build the complete PlanBoard payload for one employee's plan day. `dayOffset`
 * 0/1/2 = today / tomorrow / day-after (the 3-day planner). Period goals stay
 * anchored to the real `now` (weekly/monthly/… are period-scoped, not per-day);
 * only the plan rows, unfinished carry-over, WMS due-labels and the day
 * lifecycle re-scope to the chosen day.
 */
/**
 * DEADLINE → DAY (Sir): a weekly goal with a target date of the 15th must appear
 * on the 15th's plan by itself — you should not have to remember to drag it over.
 *
 * Run when a planner day is opened: any of the viewer's unfinished weekly goals
 * whose `target_date` IS this day and which are not ALREADY planned on some day
 * are materialised onto it.
 *
 * The "not already planned on ANY day" test is the important half. It respects a
 * deliberate move — if you pushed the goal to the 17th, it stays on the 17th
 * instead of springing back every time you open the 15th — and it upholds the
 * one-item-one-day rule. Best-effort: a failure here must never stop the board
 * from rendering, so the caller swallows it.
 */
async function materialiseGoalsDueOn(employeeId: string, ymd: string): Promise<void> {
  const due = await db
    .select({
      id: weeklyGoals.id,
      subject: weeklyGoals.subject,
      client: weeklyGoals.client,
      targetDone: weeklyGoals.targetDone,
    })
    .from(weeklyGoals)
    .where(
      and(
        eq(weeklyGoals.employeeId, employeeId),
        eq(weeklyGoals.archived, false),
        eq(weeklyGoals.targetDate, ymd),
        ne(weeklyGoals.pctDone, 100),
        // Not planned on ANY day already (a manual move wins over the deadline).
        sql`not exists (
          select 1 from daily_checklist dc
           where dc.goal_id = ${weeklyGoals.id}
             and dc.employee_id = ${employeeId}
        )`,
      ),
    );
  if (due.length === 0) return;

  const [pos] = await db
    .select({ max: sql<number>`coalesce(max(${dailyChecklist.position}), 0)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  let next = (pos?.max ?? 0) + 1;

  await db
    .insert(dailyChecklist)
    .values(
      due.map((g) => ({
        employeeId,
        planDate: ymd,
        goalId: g.id,
        origin: "goal_related" as const,
        title: g.targetDone?.trim() || g.subject?.trim() || "Weekly goal",
        client: g.client,
        subject: g.subject,
        position: next++,
      })),
    )
    .onConflictDoNothing();
}

export async function getPlanDayPayload(
  employeeId: string,
  now: Date = new Date(),
  dayOffset: number = 0,
): Promise<PlanDayPayload> {
  const offset = clampDayOffset(dayOffset);
  const ymd = ymdForOffset(offset, now);

  // Pull in anything whose DEADLINE is this day before reading the plan, so the
  // very first render already shows it. Never blocks the board.
  await materialiseGoalsDueOn(employeeId, ymd).catch(() => {});

  const [planRows, weekly, monthG, quarterG, yearG, openTasks, unfinishedRows, isManager, dayRow] = await Promise.all([
    db
      .select({
        // Explicit list on purpose — see the module header (no bare select()).
        id: dailyChecklist.id,
        title: dailyChecklist.title,
        client: dailyChecklist.client,
        subject: dailyChecklist.subject,
        origin: dailyChecklist.origin,
        goalId: dailyChecklist.goalId,
        taskId: dailyChecklist.taskId,
        done: dailyChecklist.done,
        donePct: dailyChecklist.donePct,
        doneNote: dailyChecklist.doneNote,
        // ── Added for the post-"Start My Day" review TABLE ──────────────
        // `committedAt` was already the tie-break in the ORDER BY below; it is
        // now selected so the table can show Created (and derive Age).
        committedAt: dailyChecklist.committedAt,
        // Set when a row was rolled forward from an earlier, unfinished day.
        // This is the ONLY reliable "Unfinished" signal: once carried over, a
        // row's `kind` reverts to weekly/task/adhoc, so kind can't tell you.
        movedFromDate: dailyChecklist.movedFromDate,
        // From the linked WMS task, where there is one. Plan rows for goals and
        // ad-hoc commitments have no task, so these are null for them — the
        // table renders an em-dash rather than inventing a value.
        taskNo: tasks.taskNo,
        taskPriority: tasks.priority,
        taskDescription: tasks.description,
        taskDueAt: tasks.dueAt,
        taskRevisedDueAt: tasks.revisedTargetDate,
        // Weekly-goal rows carry their deadline here instead.
        goalTargetDate: weeklyGoals.targetDate,
      })
      .from(dailyChecklist)
      // Both LEFT joins: a plan row is valid with neither a task nor a goal.
      .leftJoin(tasks, eq(tasks.id, dailyChecklist.taskId))
      .leftJoin(weeklyGoals, eq(weeklyGoals.id, dailyChecklist.goalId))
      .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)))
      .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt)),
    listGoalsForPlanner(employeeId, now),
    getPeriodGoals(employeeId, "month", monthKey(now)),
    getPeriodGoals(employeeId, "quarter", quarterKey(now)),
    getPeriodGoals(employeeId, "year", yearKey(now)),
    // WMS To-Do source. The column filters by due date itself (All / Overdue /
    // Due Today / This Week), so it needs the whole open set to filter over —
    // a 7-day horizon here would make "All" quietly mean "next 7 days". The
    // far-future work Sir wanted out of the way is handled by the
    // attention-first sort + the collapsed row cap instead of by starving the
    // filter of rows.
    listOpenTasksForChecklist(employeeId, now, { limit: 200 }),
    // TODAY's date, never the VIEWED day (Sir's bug: on the Tomorrow / Day-after
    // boards this was passed `ymd`, so `plan_date < viewedDay` swept up TODAY's
    // and TOMORROW's still-open commitments and listed them as "Unfinished ·
    // carried over from earlier days" — the same items appeared on every board
    // and looked like they had all gone stale on refresh). Unfinished means
    // genuinely BEFORE today, whichever day you happen to be planning.
    getOverdueItems(employeeId, todayYmd(now)),
    isManagerWithReports(employeeId),
    db
      .select({ startedAt: dailyPlanDay.startedAt, closedAt: dailyPlanDay.closedAt })
      .from(dailyPlanDay)
      .where(and(eq(dailyPlanDay.employeeId, employeeId), eq(dailyPlanDay.planDate, ymd)))
      .limit(1),
  ]);

  // Phase: no started stamp → PLAN (morning) · started, not closed → ACTIVE ·
  // closed → CLOSED. Close-out is entered from ACTIVE, so it isn't a load state.
  const day = dayRow[0];
  // Future days are plan-only — you can't start or close a day that hasn't
  // arrived. Today keeps the real lifecycle (plan → active → closed).
  const initialPhase: PlanPhase =
    offset !== 0 ? "plan" : day?.closedAt ? "closed" : day?.startedAt ? "active" : "plan";

  // Cascade provenance (0141, guarded) — without it a GOAL pulled onto today
  // is indistinguishable from a typed commitment and would wear the wrong tag.
  const cascadeLevels = await cascadeGoalLevels(planRows.map((r) => r.id));

  /**
   * "YYYY-MM-DD" on the team's IST clock — same convention as `plan_date`.
   * Accepts a string too: `weekly_goals.target_date` is a DATE column, which
   * drizzle hands back already formatted, and re-parsing it through a Date
   * would drag it across a timezone boundary and land on the wrong day.
   */
  const ymdOf = (d: Date | string): string =>
    typeof d === "string" ? d.slice(0, 10) : istYmd(d);
  /** Whole IST days between two instants; 0 for anything created today. */
  const daysBetween = (from: Date, to: Date): number => {
    const a = Date.parse(`${istYmd(from)}T00:00:00Z`);
    const b = Date.parse(`${istYmd(to)}T00:00:00Z`);
    return Math.max(0, Math.round((b - a) / 86_400_000));
  };

  const initialPlan: PlanItem[] = planRows.map((r) => {
    // Effective due = revised ?? original, matching `pickEffectiveDue` and the
    // rest of the app; goal rows fall back to their own target date.
    const due = r.taskRevisedDueAt ?? r.taskDueAt ?? r.goalTargetDate ?? null;
    const created = r.committedAt ?? null;
    return {
      id: r.id,
      title: r.title,
      // `subtitle` stays for the plan-phase cards, which still render it.
      subtitle: r.subject ?? r.client ?? null,
      // …and the two halves are now carried separately for the table, which
      // shows them as their own columns.
      client: r.client ?? null,
      subject: r.subject ?? null,
      origin: r.origin === "goal_related" ? ("goal_related" as const) : ("standalone" as const),
      kind: (r.goalId
        ? "weekly"
        : r.taskId
          ? "task"
          : (cascadeLevels.get(r.id) ?? "adhoc")) as PlanKind,
      done: r.done,
      donePct: r.donePct,
      doneNote: r.doneNote,
      taskId: r.taskId ?? null,
      taskNo: r.taskNo ?? null,
      priority: r.taskPriority ?? null,
      description: r.taskDescription ?? null,
      dueYmd: due ? ymdOf(due) : null,
      createdYmd: created ? ymdOf(created) : null,
      ageDays: created ? daysBetween(created, now) : null,
      carriedOver: r.movedFromDate != null,
    };
  });

  const sources = {
    weekly: weekly.map<SourceItem>((g) => ({
      id: g.id,
      kind: "weekly",
      title: g.targetDone?.trim() || g.subject?.trim() || "Weekly goal",
      subtitle: g.client ?? g.subject ?? null,
      meta: g.pctDone > 0 ? `${g.pctDone}%` : null,
      added: g.pulledToday,
    })),
    monthly: monthG.filter((g) => g.adopted).map((g) => goalToSource(g, "monthly")),
    quarterly: quarterG.filter((g) => g.adopted).map((g) => goalToSource(g, "quarterly")),
    yearly: yearG.filter((g) => g.adopted).map((g) => goalToSource(g, "yearly")),
    task: openTasks.map<SourceItem>((t) => {
      const label = displayTitle(t.title, t.description, t.client);
      // Due labels are relative to the VIEWED day: a task due on the viewed day
      // reads "Due"; due before it reads "Overdue" (with a day count). So a task
      // due tomorrow surfaces as "Due" on the Tomorrow board (task #4).
      const overdue = t.dueAt != null && t.dueAt < ymd;
      const dueOnDay = t.dueAt === ymd;
      const overdueDays = overdue && t.dueAt ? ymdDiffDays(t.dueAt, ymd) : null;
      return {
      // `id` IS the tasks.id — adding this card calls addTaskToPlan(id), which
      // stores the reference on daily_checklist.task_id. No WMS task is created.
      id: t.id,
      kind: "task",
      title: label,
      subtitle: dedupeSub(label, t.client ?? t.subject ?? null),
      meta: t.taskNo ? `#${t.taskNo}` : null,
      added: false,
      overdue,
      dueLabel: overdue ? "Overdue" : dueOnDay ? "Due" : shortDue(t.dueAt),
      important: t.priority === "imp_urgent" || t.priority === "imp_not_urgent",
      // Everything the WMS To-Do column's rows + filters read.
      taskNo: t.taskNo,
      status: t.status,
      priority: t.priority,
      dueYmd: t.dueAt,
      project: t.client ?? t.subject ?? null,
      taskId: t.id,
      // Rich detail for hover + double-click pop-out (no notes).
      assigner: t.assigner,
      description: t.description,
      overdueDays,
      };
    }),
    unfinished: buildUnfinished(unfinishedRows, planRows),
  };

  return {
    initialPlan,
    sources,
    // 5 for EVERYONE, not 5-for-managers / 3-for-ICs (Sir). This is the same
    // constant the attendance gate and the startMyDay guard read: if the button
    // enabled at 3 for an IC, they would start their day and then be refused at
    // the clock — the worst of both. One number, one source of truth.
    minItems: MIN_ATTENDANCE_ITEMS,
    isManager,
    initialPhase,
    ymd,
    dayOffset: offset,
  };
}
