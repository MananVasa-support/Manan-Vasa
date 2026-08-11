import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import {
  todayYmd,
  cascadeGoalLevels,
  listGoalsForPlanner,
  listOpenTasksForChecklist,
  getOverdueItems,
  type OverdueItem,
} from "@/lib/queries/daily-checklist";
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

/** Build the complete PlanBoard payload for one employee's TODAY. */
export async function getPlanDayPayload(employeeId: string, now: Date = new Date()): Promise<PlanDayPayload> {
  const ymd = todayYmd(now);

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
      })
      .from(dailyChecklist)
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
    getOverdueItems(employeeId, ymd),
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
  const initialPhase: PlanPhase = day?.closedAt ? "closed" : day?.startedAt ? "active" : "plan";

  // Cascade provenance (0141, guarded) — without it a GOAL pulled onto today
  // is indistinguishable from a typed commitment and would wear the wrong tag.
  const cascadeLevels = await cascadeGoalLevels(planRows.map((r) => r.id));

  const initialPlan: PlanItem[] = planRows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subject ?? r.client ?? null,
    origin: r.origin === "goal_related" ? ("goal_related" as const) : ("standalone" as const),
    kind: (r.goalId
      ? "weekly"
      : r.taskId
        ? "task"
        : (cascadeLevels.get(r.id) ?? "adhoc")) as PlanKind,
    done: r.done,
    donePct: r.donePct,
    doneNote: r.doneNote,
  }));

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
      return {
      // `id` IS the tasks.id — adding this card calls addTaskToPlan(id), which
      // stores the reference on daily_checklist.task_id. No WMS task is created.
      id: t.id,
      kind: "task",
      title: label,
      subtitle: dedupeSub(label, t.client ?? t.subject ?? null),
      meta: t.taskNo ? `#${t.taskNo}` : null,
      added: false,
      overdue: t.overdue,
      dueLabel: t.overdue ? "Overdue" : t.dueToday ? "Today" : shortDue(t.dueAt),
      important: t.priority === "imp_urgent" || t.priority === "imp_not_urgent",
      // Everything the WMS To-Do column's rows + filters read.
      taskNo: t.taskNo,
      status: t.status,
      priority: t.priority,
      dueYmd: t.dueAt,
      project: t.client ?? t.subject ?? null,
      taskId: t.id,
      };
    }),
    unfinished: buildUnfinished(unfinishedRows, planRows),
  };

  return {
    initialPlan,
    sources,
    minItems: isManager ? 5 : 3,
    isManager,
    initialPhase,
    ymd,
  };
}
