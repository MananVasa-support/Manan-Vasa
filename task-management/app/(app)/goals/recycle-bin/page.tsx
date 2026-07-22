import { redirect } from "next/navigation";
import type { Route } from "next";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { tasks, employees, goals } from "@/db/schema";
import { isManagerWithReports } from "@/lib/manager-gates";
import { MODULE_THEME } from "@/lib/module-theme";
import { RecycleBinList } from "@/components/goals/recycle-bin-list";
import { RecycleBinGoals, type BinGoal } from "@/components/goals/recycle-bin-goals";
import { goalCode, periodKeyLabel } from "@/components/goals/cascade/util";
import { goalsSpace } from "@/lib/goals/space";
import type { GoalPeriod } from "@/lib/goals/types";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.goals;

/**
 * Recycle Bin — where "abandoned" tasks land (Sir). A MANAGER reviews their
 * team's abandoned tasks and either restores one to the daily loop or permanently
 * deletes it. Admins see everyone; managers see their active direct reports.
 */
export default async function RecycleBinPage() {
  const me = await requireUser();
  const isManager = me.isAdmin || (await isManagerWithReports(me.id));
  if (!isManager) redirect("/goals/plan" as Route);

  const doer = alias(employees, "doer");
  const abandonedBy = alias(employees, "abandoned_by");

  let scopeIds: string[] | null = null;
  if (!me.isAdmin) {
    const reports = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)));
    scopeIds = [me.id, ...reports.map((r) => r.id)];
  }

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      abandonedAt: tasks.abandonedAt,
      doerName: doer.name,
      abandonedByName: abandonedBy.name,
    })
    .from(tasks)
    .leftJoin(doer, eq(doer.id, tasks.doerId))
    .leftJoin(abandonedBy, eq(abandonedBy.id, tasks.abandonedById))
    .where(
      scopeIds
        ? and(isNotNull(tasks.abandonedAt), inArray(tasks.doerId, scopeIds))
        : isNotNull(tasks.abandonedAt),
    )
    .orderBy(desc(tasks.abandonedAt))
    .limit(300);

  const items = rows.map((r) => ({
    id: r.id,
    taskNo: r.taskNo,
    title: r.title,
    client: r.client,
    doerName: r.doerName,
    abandonedByName: r.abandonedByName,
    abandonedAt: r.abandonedAt ? r.abandonedAt.toISOString() : null,
  }));

  // ── Archived (deleted) GOALS — the goals recycle bin, in the active space ──
  const space = await goalsSpace(me.isAdmin);
  const goalOwner = alias(employees, "goal_owner");
  const goalRows = await db
    .select({
      id: goals.id,
      title: goals.title,
      area: goals.area,
      period: goals.period,
      periodKey: goals.periodKey,
      position: goals.position,
      updatedAt: goals.updatedAt,
      ownerName: goalOwner.name,
    })
    .from(goals)
    .leftJoin(goalOwner, eq(goalOwner.id, goals.employeeId))
    .where(
      scopeIds
        ? and(eq(goals.archived, true), eq(goals.scope, space), inArray(goals.employeeId, scopeIds))
        : and(eq(goals.archived, true), eq(goals.scope, space)),
    )
    .orderBy(desc(goals.updatedAt))
    .limit(300);

  const binGoals: BinGoal[] = goalRows.map((g) => ({
    id: g.id,
    title: g.title,
    area: g.area,
    code: goalCode({ period: g.period as GoalPeriod, periodKey: g.periodKey, position: g.position, id: g.id }),
    periodLabel: periodKeyLabel(g.periodKey),
    ownerName: g.ownerName ?? "—",
    deletedAt: g.updatedAt ? g.updatedAt.toISOString() : null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${"#E10600"}, ${"#A80400"})` }}
          >
            Goals · Recycle Bin
          </span>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 3.2vw, 38px)",
              letterSpacing: "-0.025em",
              marginTop: 6,
            }}
          >
            Recycle Bin
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15 }}>
            Deleted goals and abandoned tasks. Restore them, or permanently delete.
          </p>
        </header>

        {/* Deleted GOALS — restore or permanently delete (select-all + confirm). */}
        <RecycleBinGoals items={binGoals} />

        {/* Abandoned daily-loop TASKS (existing). */}
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-black uppercase tracking-[0.08em] text-ink-muted">
            Abandoned tasks
          </h2>
          <RecycleBinList items={items} />
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
