import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { CollapsibleVelocity } from "@/components/dashboard/collapsible-velocity";
import { StatusTable } from "@/components/dashboard/status-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import { ExecDashboard } from "@/components/dashboard/exec/exec-dashboard";
import { AgingHeatmap } from "@/components/dashboard/aging-heatmap";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
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
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Dashboard. Loads DIRECTLY — the same single-pass `await Promise.all(...)`
 * pattern the (fast) Tasks page uses. No Suspense/streaming, no per-attempt
 * timeout, no retry wrapper: those turned the dashboard's heavier (but valid)
 * rollup scans into a premature "taking longer than usual" error even when the
 * query would have completed. A slow read just takes a moment and resolves;
 * Next's route-level loading.tsx covers the wait.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  // Auth is cached for the request. `.catch → null` keeps the public-ish
  // dashboard rendering even if the auth read hiccups (My Day just hides).
  const me = await getCurrentEmployee().catch(() => null);

  // Mobile home: phones open on "Today" (the user's overdue + due-today tasks)
  // instead of the company dashboard. `?full=1` opts into the full dashboard.
  const showFullOnMobile = sp.full === "1";

  // One fan-out, awaited directly (no timeout/retry — that layer was what turned
  // slow-but-valid reads into failures). Auxiliary reads (My Day, today's tasks,
  // subjects, my goals) degrade to null/empty so they can never take down the
  // page. The three CORE reads aren't degradable, so on a genuine error we show
  // a friendly in-place Retry panel instead of throwing to the global boundary.
  let loaded: [
    Awaited<ReturnType<typeof listEmployees>>,
    Awaited<ReturnType<typeof loadDashboardData>>,
    Awaited<ReturnType<typeof getStatusDisplayMap>>,
    Awaited<ReturnType<typeof getMyDayCounts>> | null,
    Awaited<ReturnType<typeof getMyTodayTasks>> | null,
    string[],
    Awaited<ReturnType<typeof listWeekGoalsAsTasks>>,
  ];
  try {
    loaded = await Promise.all([
      listEmployees(),
      loadDashboardData(filters),
      getStatusDisplayMap(),
      me ? getMyDayCounts(me.id).catch(() => null) : Promise.resolve(null),
      me ? getMyTodayTasks(me.id).catch(() => null) : Promise.resolve(null),
      listDistinctSubjects().catch(() => [] as string[]),
      me
        ? listWeekGoalsAsTasks({ scope: { employeeIds: [me.id] } }).catch(() => [])
        : Promise.resolve([]),
    ]);
  } catch (err) {
    console.error("[dashboard] core load failed:", err);
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
  const [allEmployees, data, statusDisplay, myDay, todayTasks, subjects, myGoals] =
    loaded;

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const isEmpty = allEmployees.length === 0 && data.statusTable.length === 0;

  const employeeOptions = allEmployees.map((e) => ({ value: e.id, label: e.name }));

  // Pure in-memory avatar map from the already-loaded roster (no new query).
  const avatarById: Record<string, string | null> = Object.fromEntries(
    allEmployees.map((e) => [e.id, e.avatarUrl ?? null]),
  );
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  // The mobile Today home replaces the dashboard on phones only when its data
  // actually loaded — otherwise phones fall back to the regular dashboard.
  const mobileToday =
    !isEmpty && !showFullOnMobile && me && todayTasks ? todayTasks : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />

      {/* Sticky filter bar: the app header is `sticky top-0` and stays on
          screen, so the filter bar pins just below it; z-40 under the z-50
          header. We only style the page's wrapper — the shared FilterBar is
          untouched. */}
      <div
        className={`sticky top-[96px] max-md:top-[72px] z-40 ${mobileToday ? "max-md:hidden" : ""}`}
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-surface-soft) 94%, transparent) 0%, color-mix(in srgb, var(--color-surface-soft) 86%, transparent) 100%)",
          backdropFilter: "blur(14px) saturate(150%)",
          WebkitBackdropFilter: "blur(14px) saturate(150%)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <FilterBar
          employees={employeeOptions}
          subjects={subjects}
          initial={{
            start: isoDay(filters.startDate ?? new Date()),
            end: isoDay(filters.endDate ?? new Date()),
            emp: filters.employeeIds,
            view: filters.view,
            dept: filters.departments,
            prio: filters.priorities,
            subj: filters.subjects,
          }}
        />
      </div>

      <main>
        {isEmpty ? (
          <WelcomeHero />
        ) : (
          <>
            {/* Pinned "This week's goals" group at the top of My Day (design
                §10) — visible on mobile Today + desktop. Display-only. */}
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
              <KpiStrip kpis={data.kpis} summary={data.wmsSummary} />
              {/* Executive Control Room — surfaced above doer-status /
                  top-performers per founder (2026-06-21). */}
              <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12">
                <ExecDashboard
                  doneOnTime={data.doneOnTime}
                  initiator={data.initiator}
                  notApprovedAging={data.notApprovedAging}
                  avatarById={avatarById}
                  isAdmin={Boolean(me?.isAdmin)}
                  meId={me?.id ?? null}
                />
              </section>
              <div className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 grid grid-cols-2 max-lg:grid-cols-1 gap-6">
                <StatusDistributionChart
                  data={data.statusDistribution}
                  labels={statusLabels}
                  tones={statusTones}
                  isAdmin={Boolean(me?.isAdmin)}
                />
                <TopPerformersSection performers={data.topPerformers} avatarById={avatarById} />
              </div>
              <StatusTable rows={data.statusTable} view={filters.view} avatarById={avatarById} />
              <AgingHeatmap rows={data.agingTable} cellTasks={data.agingHeatmapData.byCell} avatarById={avatarById} />
              <CollapsibleVelocity data={data.velocity} />
            </div>
          </>
        )}
      </main>

      <DashboardFooter />
    </>
  );
}
