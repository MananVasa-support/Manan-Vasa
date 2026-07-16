import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/db/schema";
import { getPeriodGoals } from "@/lib/goals/queries";
import {
  todayYmd,
  listGoalsForPlanner,
  listOpenTasksForChecklist,
} from "@/lib/queries/daily-checklist";
import { yearKey, quarterKey, monthKey } from "@/lib/goals/types";
import { isManagerWithReports } from "@/lib/manager-gates";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { MODULE_THEME } from "@/lib/module-theme";
import type { PlanItem, SourceItem } from "@/components/goals/plan/types";
import type { Goal } from "@/lib/goals/types";

const THEME = MODULE_THEME.goals;
const ACCENT = THEME.accent;
const ACCENT_DEEP = THEME.accentDeep;

export const dynamic = "force-dynamic";

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

  const [planRows, weekly, monthG, quarterG, yearG, openTasks, isManager] = await Promise.all([
    db
      .select()
      .from(dailyChecklist)
      .where(and(eq(dailyChecklist.employeeId, me.id), eq(dailyChecklist.planDate, ymd)))
      .orderBy(asc(dailyChecklist.position), asc(dailyChecklist.committedAt)),
    listGoalsForPlanner(me.id, now),
    getPeriodGoals(me.id, "month", monthKey(now)),
    getPeriodGoals(me.id, "quarter", quarterKey(now)),
    getPeriodGoals(me.id, "year", yearKey(now)),
    listOpenTasksForChecklist(me.id, now),
    isManagerWithReports(me.id),
  ]);

  const initialPlan: PlanItem[] = planRows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subject ?? r.client ?? null,
    origin: r.origin === "goal_related" ? "goal_related" : "standalone",
    kind: r.goalId ? "weekly" : r.taskId ? "task" : "adhoc",
    done: r.done,
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
    })),
  };

  const minItems = isManager ? 5 : 3;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Goals · Daily Loop
          </span>
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
            Plan your day
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "60ch" }}>
            Line up today from your goals and tasks — drag a card into the plan, or
            tap +. Hit your minimum to start a focused day.
          </p>
        </header>
        <PlanBoard initialPlan={initialPlan} sources={sources} minItems={minItems} isManager={isManager} />
      </main>
      <DashboardFooter />
    </>
  );
}
