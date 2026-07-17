import { notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { db } from "@/lib/db";
import { weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { getYearBoard, getAssignedGoals } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import { CascadeWorkspace, type WeeklyDTO } from "@/components/goals/cascade/cascade-workspace";
import { resolveGoalsView } from "./view";

export const dynamic = "force-dynamic";

/** Flatten a goal tree back to every node (children ignored by toGoalDTO). */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

/** Calendar week number (1..53) for a Monday date "YYYY-MM-DD". */
function weekNoOf(weekStart: string): number {
  const d = new Date(`${weekStart}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.max(1, Math.ceil((d.getTime() - start) / 86_400_000 / 7) + 1);
}

export default async function GoalsCascadePage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const sp = await searchParams;
  const view = await resolveGoalsView(me, isAdmin, sp.emp);
  const fy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : fyStartYearOf(new Date());

  const [board, wrows, assigned] = await Promise.all([
    getYearBoard(view.viewedEmployeeId, fy),
    db
      .select({
        id: weeklyGoals.id,
        weekStart: weeklyGoals.weekStart,
        monthGoalId: weeklyGoals.monthGoalId,
        subject: weeklyGoals.subject,
        targetDone: weeklyGoals.targetDone,
        area: weeklyGoals.area,
        uom: weeklyGoals.uom,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        position: weeklyGoals.position,
        carriedFromId: weeklyGoals.carriedFromId,
      })
      .from(weeklyGoals)
      .where(
        and(
          eq(weeklyGoals.employeeId, view.viewedEmployeeId),
          eq(weeklyGoals.archived, false),
          gte(weeklyGoals.weekStart, `${fy}-04-01`),
          lte(weeklyGoals.weekStart, `${fy + 1}-03-31`),
        ),
      ),
    getAssignedGoals(view.viewedEmployeeId, fy),
  ]);

  const goals: GoalDTO[] = [...collect(board.years), ...collect(board.standalone)].map(toGoalDTO);

  const weekly: WeeklyDTO[] = wrows.map((w) => ({
    id: w.id,
    weekStart: w.weekStart,
    monthKey: w.weekStart.slice(0, 7),
    weekNo: weekNoOf(w.weekStart),
    title: (w.targetDone?.trim() || w.subject?.trim() || "Weekly goal") as string,
    area: w.area,
    uom: w.uom,
    pctDone: w.pctDone,
    acceptPct: w.acceptPct,
    position: w.position,
    cascade: w.monthGoalId != null,
    spillover: w.carriedFromId != null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-6 max-md:px-3 pt-6 pb-16">
        <CascadeWorkspace
          goals={goals}
          weekly={weekly}
          assigned={assigned}
          fyStartYear={fy}
          viewedEmployeeId={view.viewedEmployeeId}
          viewedName={view.viewedName}
          roster={view.roster}
          canWrite={view.canWrite}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
