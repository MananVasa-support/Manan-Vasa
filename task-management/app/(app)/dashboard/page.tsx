import Link from "next/link";
import type { Route } from "next";
import { BarChart3, ArrowRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { StatusTable } from "@/components/dashboard/status-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import {
  ExecDashboard,
  ExecOverdueSection,
  ExecDelegationSection,
  ExecOnTimeSection,
} from "@/components/dashboard/exec/exec-dashboard";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { AgingHeatmap } from "@/components/dashboard/aging-heatmap";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { PageShell } from "@/components/layout/page-shell";
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
    // Flat WHITE canvas for the whole dashboard. `body` paints an app-wide
    // red/purple/green radial wash (globals.css) which read as a pink-peach
    // tint here; this opaque layer covers it for THIS route only, leaving every
    // other module's backdrop alone. min-h-dvh so short dashboards stay white
    // all the way down.
    <div className="flex min-h-dvh flex-1 flex-col" style={{ background: "#ffffff" }}>
      <DashboardHeader generatedAt={new Date()} />

      {/* Sticky filter bar: WMS now uses the vertical left rail (no horizontal
          top header), so the bar pins to the very top of the content column on
          desktop; on phones it clears the rail's 56px fixed top bar (top-14).
          Solid white — it must stay opaque, or the content scrolling under it
          shows through. */}
      <div
        className={`sticky sticky-below-topbar max-md:top-14 z-40 ${mobileToday ? "max-md:hidden" : ""}`}
        style={{
          background: "#ffffff",
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
              <PageShell as="div" width="full" py={false} className="mt-6">
                <WeeklyGoalTaskGroup goals={myGoals} />
              </PageShell>
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
              {/* Task Analytics deep-dive — on-demand route (load-neutral),
                  surfaced for admins + managers (anyone with a downline).
                  Passed INTO KpiStrip as children so the summary's single
                  maximize/minimize toggle folds the banner away with the cards.
                  No PageShell of its own: KpiStrip already renders one, and
                  nesting them would apply the page gutter twice. */}
              <KpiStrip kpis={data.kpis} summary={data.wmsSummary}>
              {(me?.isAdmin || allEmployees.some((e) => e.managerId === me?.id)) && (
                <div className="mt-4">
                  {/* Minimalist white surface with a red accent border — the
                      solid red fill it replaced competed with the KPI cards
                      directly above it for the eye, and read as an alert rather
                      than a link. `shadow-sm → hover:shadow-md` carries the
                      affordance the fill used to. */}
                  <Link
                    href={"/dashboard/task-report" as Route}
                    className="wg-rise group flex items-center justify-between gap-4 rounded-2xl border-2 border-red-500/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md active:scale-[0.997] max-md:p-4"
                  >
                    <span className="flex min-w-0 items-center gap-3.5">
                      <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-red-50 p-3 text-red-600">
                        <BarChart3 size={22} strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold uppercase tracking-wider text-red-600">
                          Task Analytics
                        </span>
                        <span className="mt-0.5 block text-xl font-bold leading-tight text-gray-900">
                          Open the full Task Report
                        </span>
                        <span className="mt-0.5 block text-sm font-normal text-gray-500">
                          Done-on-time spread · not-approved aging · initiator target-vs-actual
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-red-50 p-3 text-red-600">
                      <ArrowRight
                        size={22}
                        strokeWidth={2.6}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                </div>
              )}
              </KpiStrip>
              {/* Everything below the Task Report banner is dealt into three
                  tabs — Attention (default) · Overview · Performance — grouped
                  by the question each answers:

                    Attention   — Delivered On Time · Overdue by Person ·
                                  Aging Heatmap
                    Overview    — Status Distribution · Status by Doer ·
                                  Who is Delegating
                    Performance — Top Performers

                  Attention leads because the dashboard is opened to find out
                  what is on fire. Only the selected tab is MOUNTED, so each is
                  its own short scroll rather than one long one.

                  The "Attention Required" (declined / re-work) widget is gone
                  entirely — component, section and query plumbing.

                  <ExecDashboard> wraps the WHOLE tab container, not each panel:
                  it is a context provider (3/7-day window, privacy filter,
                  section search, drill-down modal) and its sections throw if
                  rendered outside it. Panels are built in this render but only
                  the active one mounts, so the provider must sit above them. */}
              <ExecDashboard
                doneOnTime={data.doneOnTime}
                initiator={data.initiator}
                avatarById={avatarById}
                isAdmin={Boolean(me?.isAdmin)}
                meId={me?.id ?? null}
              >
                <DashboardTabs
                  attention={
                    <div className="flex flex-col gap-6">
                      <ExecOnTimeSection />
                      {/* Also carries the surface's global empty state, so it
                          must live in the DEFAULT tab or that state can never
                          be seen. */}
                      <ExecOverdueSection />
                      <AgingHeatmap
                        rows={data.agingTable}
                        cellTasks={data.agingHeatmapData.byCell}
                        avatarById={avatarById}
                        me={{ id: me?.id ?? "", isAdmin: Boolean(me?.isAdmin) }}
                      />
                    </div>
                  }
                  overview={
                    <div className="flex flex-col gap-6">
                      <StatusDistributionChart
                        data={data.statusDistribution}
                        labels={statusLabels}
                        tones={statusTones}
                        isAdmin={Boolean(me?.isAdmin)}
                      />
                      <StatusTable
                        rows={data.statusTable}
                        view={filters.view}
                        avatarById={avatarById}
                      />
                      <ExecDelegationSection />
                    </div>
                  }
                  performance={
                    <div className="flex flex-col gap-6">
                      <TopPerformersSection
                        performers={data.topPerformers}
                        avatarById={avatarById}
                      />
                    </div>
                  }
                />
              </ExecDashboard>
            </div>
          </>
        )}
      </main>

    </div>
  );
}
