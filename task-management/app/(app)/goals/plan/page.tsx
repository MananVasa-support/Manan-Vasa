import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { db } from "@/lib/db";
import { dailyChecklist, dailyPlanDay } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import {
  todayYmd,
  listGoalsForPlanner,
  listOpenTasksForChecklist,
  getOverdueItems,
  type OverdueItem,
} from "@/lib/queries/daily-checklist";
import { yearKey, quarterKey, monthKey } from "@/lib/goals/types";
import { isManagerWithReports } from "@/lib/manager-gates";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { MODULE_THEME } from "@/lib/module-theme";
import type { PlanItem, PlanPhase, SourceItem } from "@/components/goals/plan/types";
import type { Goal } from "@/lib/goals/types";

const THEME = MODULE_THEME.goals;
const ACCENT = THEME.accent;
const ACCENT_DEEP = THEME.accentDeep;

export const dynamic = "force-dynamic";

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
    out.push({
      id: r.id,
      kind: "unfinished",
      title: r.title,
      subtitle: r.client ?? r.subject ?? null,
      meta: r.taskNo ? `#${r.taskNo}` : null,
      added: false,
      overdue: true,
      dueLabel: "Carried over",
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
 * Plan-Your-Day (Module 4) — the redesigned drag-drop planner. Reads the goal
 * cascade + open tasks as drag sources and today's committed rows as the plan.
 * The board persists to `daily_checklist` (same table the plan gate counts).
 */
export default async function GoalsPlanPage() {
  const { me } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const now = new Date();
  const ymd = todayYmd(now);

  const [planRows, weekly, monthG, quarterG, yearG, openTasks, unfinishedRows, isManager, dayRow] = await Promise.all([
    db
      .select()
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, me.id), eq(dailyChecklist.planDate, ymd)))
      .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt)),
    listGoalsForPlanner(me.id, now),
    getPeriodGoals(me.id, "month", monthKey(now)),
    getPeriodGoals(me.id, "quarter", quarterKey(now)),
    getPeriodGoals(me.id, "year", yearKey(now)),
    // To-Do source: only overdue + due-within-7-days (Sir — hide far-future).
    listOpenTasksForChecklist(me.id, now, { horizonDays: 7 }),
    getOverdueItems(me.id, ymd),
    isManagerWithReports(me.id),
    db
      .select({ startedAt: dailyPlanDay.startedAt, closedAt: dailyPlanDay.closedAt })
      .from(dailyPlanDay)
      .where(and(eq(dailyPlanDay.employeeId, me.id), eq(dailyPlanDay.planDate, ymd)))
      .limit(1),
  ]);

  // Phase: no started stamp → PLAN (morning) · started, not closed → ACTIVE ·
  // closed → CLOSED. Close-out is entered from ACTIVE, so it isn't a load state.
  const day = dayRow[0];
  const initialPhase: PlanPhase = day?.closedAt ? "closed" : day?.startedAt ? "active" : "plan";

  const initialPlan: PlanItem[] = planRows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subject ?? r.client ?? null,
    origin: r.origin === "goal_related" ? "goal_related" : "standalone",
    kind: r.goalId ? "weekly" : r.taskId ? "task" : "adhoc",
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
    task: openTasks.map<SourceItem>((t) => ({
      id: t.id,
      kind: "task",
      title: t.title,
      subtitle: t.client ?? t.subject ?? null,
      meta: t.taskNo ? `#${t.taskNo}` : null,
      added: false,
      overdue: t.overdue,
      dueLabel: t.overdue ? "Overdue" : t.dueToday ? "Today" : shortDue(t.dueAt),
      important: t.priority === "imp_urgent" || t.priority === "imp_not_urgent",
      taskId: t.id,
    })),
    unfinished: buildUnfinished(unfinishedRows, planRows),
  };

  const minItems = isManager ? 5 : 3;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 wg-rise">
          <div className="flex items-start justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              Goals · Daily Loop
            </span>
            {isManager && (
              <a
                href="/goals/recycle-bin"
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
              >
                <Trash2 size={13} /> Recycle Bin
              </a>
            )}
          </div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px, 3.4vw, 42px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
            }}
          >
            Plan my day
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "60ch" }}>
            Line up today from your goals and tasks — drag a card into the plan, or
            tap +. Hit your minimum to start a focused day.
          </p>
        </header>
        <PlanBoard initialPlan={initialPlan} sources={sources} minItems={minItems} isManager={isManager} initialPhase={initialPhase} />
      </main>
      <DashboardFooter />
    </>
  );
}
