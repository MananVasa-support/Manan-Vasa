import { Suspense } from "react";
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
import { DashboardBodySkeleton } from "@/components/dashboard/dashboard-body-skeleton";
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
import { withRetry } from "@/lib/db/with-timeout";
import type { DashboardFilters } from "@/lib/types";
import type { Employee } from "@/db/schema";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Dashboard. Streaming-first: the page resolves auth (fast, cached, retried)
 * then renders the header SHELL immediately and streams the data-heavy body in
 * via <Suspense>. The big fan-out (employees + dashboard rollups + charts +
 * tables) lives in <DashboardBody>, so the page is NEVER fully blank — the
 * header paints instantly and the skeleton fills the body until the data lands.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  // Auth at the top: fast, React-cache()d, and withRetry-self-healing so a stale
  // pooled connection here doesn't sink the page. The result is reused by both
  // the shell and the streamed body (same request → same cached value).
  const me = await getCurrentEmployee().catch(() => null);

  // Mobile home: phones open on "Today" (the user's overdue + due-today
  // tasks, priority-first) instead of the company dashboard. `?full=1`
  // opts back into the full dashboard on mobile; desktop is unaffected.
  const showFullOnMobile = sp.full === "1";

  return (
    <>
      {/* Shell — paints instantly, before the fan-out resolves. generatedAt is
          "now" here; the body re-renders the header context with the real data
          timestamp once it streams in. */}
      <DashboardHeader generatedAt={new Date()} />
      <Suspense fallback={<DashboardBodySkeleton />}>
        <DashboardBody
          filters={filters}
          me={me}
          showFullOnMobile={showFullOnMobile}
        />
      </Suspense>
      <DashboardFooter />
    </>
  );
}

/**
 * The data-heavy half of the dashboard. Streamed inside <Suspense> so its
 * (sometimes slow / retried) fan-out never blocks the header shell from
 * painting. Preserves the exact fan-out, filter parsing, mobile-Today logic,
 * and the <DashboardLoadError/> fallback from the original single-pass page.
 */
async function DashboardBody({
  filters,
  me,
  showFullOnMobile,
}: {
  filters: DashboardFilters;
  me: Employee | null;
  showFullOnMobile: boolean;
}) {
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

  // FACTORY (not a bare promise) so withRetry can re-invoke it on a stale
  // pooled connection: the timed-out attempt stays reserved draining its dead
  // socket while the retry builds a FRESH Promise.all that postgres-js checks
  // out on a different, healthy connection. Each per-call .catch degrader is
  // preserved so an auxiliary failure never takes down the whole dashboard.
  const loadAll = () =>
    Promise.all([
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
    ]);

  try {
    [allEmployees, data, statusDisplay, myDay, todayTasks, subjects, myGoals] =
      await withRetry(loadAll, {
        attempts: 2,
        timeoutMs: [6000, 12000],
        label: "dashboard-load",
      });
  } catch (err) {
    console.error("[dashboard] data load failed:", err);
    return (
      <main>
        <DashboardLoadError />
      </main>
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

  // Pure in-memory avatar map from the already-loaded roster (no new query).
  const avatarById: Record<string, string | null> = Object.fromEntries(
    allEmployees.map((e) => [e.id, e.avatarUrl ?? null]),
  );
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  // The mobile Today home replaces the dashboard on phones only when its
  // data actually loaded — on a query failure phones fall back to the
  // regular dashboard rather than a blank screen.
  const mobileToday = !isEmpty && !showFullOnMobile && me && todayTasks ? todayTasks : null;

  return (
    <>
      {/* Sticky filter bar: the app header is `sticky top-0` and stays on
          screen (96px tall desktop / 72px mobile), so the filter bar pins
          just below it. A cream-glass surface + backdrop-blur lets dashboard
          content scroll cleanly under it; z-40 sits under the z-50 header.
          We only style the page's wrapper — the shared FilterBar is untouched. */}
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
              <KpiStrip kpis={data.kpis} summary={data.wmsSummary} />
              {/* Delivery & quality dashboards — surfaced ABOVE doer-status /
                  top-performers per founder (2026-06-21). The V2 Executive
                  Control Room replaces the four previously-stacked sections
                  (Punctuality / Done-Aging / Not-Approved / Initiator). */}
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
    </>
  );
}
