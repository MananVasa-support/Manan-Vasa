import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { CollapsibleVelocity } from "@/components/dashboard/collapsible-velocity";
import { StatusTable } from "@/components/dashboard/status-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import { PunctualityCard } from "@/components/dashboard/punctuality-card";
import { AgingHeatmap } from "@/components/dashboard/aging-heatmap";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { MyDayCard } from "@/components/dashboard/my-day-card";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { listEmployees } from "@/lib/queries/employees";
import { listDistinctSubjects } from "@/lib/queries/tasks";
import { loadDashboardData } from "@/lib/queries/dashboard";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getMyDayCounts, getMyTodayTasks } from "@/lib/queries/my-day";
import { MobileToday } from "@/components/dashboard/mobile-today";
import { getCurrentEmployee } from "@/lib/auth/current";
import { listWeekGoalsAsTasks } from "@/lib/weekly-goals/as-task-row";
import { WeeklyGoalTaskGroup } from "@/components/weekly-goals/weekly-goal-task-group";
import { parseFilters } from "@/lib/filters";
import { withTimeout } from "@/lib/db/with-timeout";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const me = await getCurrentEmployee().catch(() => null);

  // Mobile home: phones open on "Today" (the user's overdue + due-today
  // tasks, priority-first) instead of the company dashboard. `?full=1`
  // opts back into the full dashboard on mobile; desktop is unaffected.
  const showFullOnMobile = sp.full === "1";

  // Resilience: the dashboard fires many queries against a remote DB. A
  // single transient timeout must NOT crash the whole page. My Day
  // degrades to hidden (.catch → null); a core-data failure renders a
  // friendly Retry panel instead of the global "we hit a snag" boundary.
  let allEmployees: Awaited<ReturnType<typeof listEmployees>>;
  let data: Awaited<ReturnType<typeof loadDashboardData>>;
  let statusDisplay: Awaited<ReturnType<typeof getStatusDisplayMap>>;
  let myDay: Awaited<ReturnType<typeof getMyDayCounts>> | null;
  let todayTasks: Awaited<ReturnType<typeof getMyTodayTasks>> | null;
  let subjects: string[];
  // My Day: this week's goals assigned to ME, pinned above today's tasks
  // (design §10). Display-only; never mixed into the dashboard task KPIs.
  let myGoals: Awaited<ReturnType<typeof listWeekGoalsAsTasks>>;
  try {
    [allEmployees, data, statusDisplay, myDay, todayTasks, subjects, myGoals] = await withTimeout(Promise.all([
      listEmployees(),
      loadDashboardData(filters),
      getStatusDisplayMap(),
      me ? getMyDayCounts(me.id).catch(() => null) : Promise.resolve(null),
      // Mobile "Today" home list — degrades to null (mobile falls back to
      // the full dashboard) rather than crashing the page.
      me ? getMyTodayTasks(me.id).catch(() => null) : Promise.resolve(null),
      // Auxiliary (only powers the Subject filter chip) — must NEVER take down
      // the whole dashboard, so it degrades to an empty list on failure.
      listDistinctSubjects().catch(() => [] as string[]),
      // My weekly goals — degrade to empty so a failure never takes down My Day.
      me
        ? listWeekGoalsAsTasks({ scope: { employeeIds: [me.id] } }).catch(() => [])
        : Promise.resolve([]),
    ]), 18000, "dashboard-load");
  } catch (err) {
    console.error("[dashboard] data load failed:", err);
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main>
          <DashboardLoadError />
        </main>
        <DashboardFooter />
      </>
    );
  }

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const isEmpty =
    allEmployees.length === 0 && data.statusTable.length === 0;

  const employeeOptions = allEmployees.map((e) => ({
    value: e.id,
    label: e.name,
  }));
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  // The mobile Today home replaces the dashboard on phones only when its
  // data actually loaded — on a query failure phones fall back to the
  // regular dashboard rather than a blank screen.
  const mobileToday = !isEmpty && !showFullOnMobile && me && todayTasks ? todayTasks : null;

  return (
    <>
      <DashboardHeader generatedAt={data.generatedAt} />
      <div className={mobileToday ? "max-md:hidden" : undefined}>
        <FilterBar
          employees={employeeOptions}
          subjects={subjects}
          initial={{
            start: isoDay(filters.startDate ?? new Date()),
            end:   isoDay(filters.endDate   ?? new Date()),
            emp:   filters.employeeIds,
            view:  filters.view,
            dept:  filters.departments,
            prio:  filters.priorities,
            subj:  filters.subjects,
          }}
        />
      </div>
      <main>
        {isEmpty ? (
          <WelcomeHero />
        ) : (
          <>
            {/* Pinned "This week's goals" group at the very top of My Day
                (design §10) — visible on both the mobile Today home and the
                desktop dashboard. Display-only; not counted in any task KPI. */}
            {myGoals.length > 0 && (
              <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-6">
                <WeeklyGoalTaskGroup goals={myGoals} />
              </section>
            )}
            {mobileToday && me && (
              <div className="md:hidden">
                <MobileToday
                  firstName={me.name.split(" ")[0] ?? me.name}
                  tasks={mobileToday}
                  doneToday={myDay?.doneToday ?? 0}
                  statusLabels={statusLabels}
                  statusTones={statusTones}
                />
              </div>
            )}
            <div className={mobileToday ? "max-md:hidden" : undefined}>
              {me && myDay && (
                <MyDayCard
                  firstName={me.name.split(" ")[0] ?? me.name}
                  counts={myDay}
                />
              )}
              <KpiStrip kpis={data.kpis} summary={data.wmsSummary} />
              <div className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 grid grid-cols-2 max-lg:grid-cols-1 gap-6">
                <StatusDistributionChart
                  data={data.statusDistribution}
                  labels={statusLabels}
                  tones={statusTones}
                  isAdmin={Boolean(me?.isAdmin)}
                />
                <TopPerformersSection performers={data.topPerformers} />
              </div>
              <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-6">
                <PunctualityCard data={data.punctuality} isAdmin={Boolean(me?.isAdmin)} />
              </section>
              <StatusTable rows={data.statusTable} view={filters.view} />
              <AgingHeatmap rows={data.agingTable} cellTasks={data.agingHeatmapData.byCell} />
              <CollapsibleVelocity data={data.velocity} />
            </div>
          </>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
