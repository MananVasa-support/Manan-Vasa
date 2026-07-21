import { redirect } from "next/navigation";
import type { Route } from "next";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { tasks, employees } from "@/db/schema";
import { isManagerWithReports } from "@/lib/manager-gates";
import { MODULE_THEME } from "@/lib/module-theme";
import { RecycleBinList } from "@/components/goals/recycle-bin-list";

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
            Tasks your team abandoned from the daily loop. Restore one back into play, or permanently delete it.
          </p>
        </header>
        <RecycleBinList items={items} />
      </main>
      <DashboardFooter />
    </>
  );
}
