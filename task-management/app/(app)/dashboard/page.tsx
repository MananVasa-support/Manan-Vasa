
import { DashboardHeader } from "@/components/layout/header";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ManagerActivityTable } from "@/components/dashboard/exec/manager-activity-table";
import { SentBackSection } from "@/components/dashboard/sent-back-section";
import { DeliverySpreadSection } from "@/components/dashboard/delivery-spread-section";
import { StatusTable } from "@/components/dashboard/status-table";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import {
  ExecDashboard,
  ExecOverdueSection,
  ExecDelegationSection,
  ExecOnTimeSection,
} from "@/components/dashboard/exec/exec-dashboard";
import { DashboardSectionNav } from "@/components/dashboard/section-nav";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
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
              {/* `wmsSummaryByKpi` is optional-chained inside KpiStrip for the
                  same reason `sentBack` is below: the Data Cache can serve a
                  payload shaped by the PREVIOUS deploy for the length of its
                  TTL. */}
              <KpiStrip
                kpis={data.kpis}
                summary={data.wmsSummary}
                summaryByKpi={data.wmsSummaryByKpi}
              />

              {/* Section nav, directly beneath the KPI cards. Inside PageShell
                  so it lines up with the sections it points at. */}
              <PageShell as="div" width="full" py={false}>
                <DashboardSectionNav />
              </PageShell>
              {/* Fixed vertical order below the Task Summary:
                    1 Overdue Tasks by Person
                    2 Aging Heatmap
                    3 Delivered on Time
                    4 Insights (the tabbed analytics box)

                  The first three were panels of the Insights "Attention" tab.
                  They are the questions the dashboard is opened to answer, so
                  they are now always on screen instead of behind a click; the
                  tabs keep the deliberate second look (Overview / Performance).
                  Promoting Overdue also fixes a constraint the old layout had to
                  work around — it carries the surface's GLOBAL EMPTY STATE, which
                  previously could only be seen if it lived in the default tab.

                  <ExecDashboard> stays a PROVIDER around the whole stack: it owns
                  the 3/7-day window, the privacy filter, the section search and
                  the drill-down modal, and its sections throw if rendered outside
                  it — so it must sit above both the promoted sections and the
                  tabs. */}
              <ExecDashboard
                doneOnTime={data.doneOnTime}
                initiator={data.initiator}
                avatarById={avatarById}
                isAdmin={Boolean(me?.isAdmin)}
                meId={me?.id ?? null}
              >
                {/* ONE column owns the rhythm: gap-6 (24px) between every block,
                    and nothing carries its own top margin. `mt-6` is the column's
                    own clearance from the KpiStrip above — gap only spaces
                    siblings INSIDE the column. */}
                {/* ONE gap rule for the whole stack. Sections used to add their own
                    top margins on top of this, so the spacing between any two
                    of them depended on which two they were. */}
                <div className="mt-6 flex flex-col gap-6 md:gap-8">
                  {/* 1 — Overdue Tasks by Person. PageShell: outside the tabs box
                      these sections no longer inherit the panel's padding, so each
                      needs the page gutter itself. AgingHeatmap renders its own. */}
                  <div id="overdue-by-person" className="scroll-mt-20">
                    <WidgetBoundary label="the overdue list">
                    <PageShell as="div" width="full" py={false}>
                      <ExecOverdueSection />
                    </PageShell>
                    </WidgetBoundary>
                  </div>

                  {/* 1b — Sent-back work, directly under the overdue card. Both
                      answer "who is carrying work that has gone wrong", so they
                      read as a pair. Moved here from Task Analytics. */}
                  <div id="sent-back-work" className="scroll-mt-20">
                    <WidgetBoundary label="sent-back work">
                  <SentBackSection
                    /* Optional-chained: the Data Cache can serve a payload
                       shaped by the PREVIOUS deploy for the length of its TTL,
                       and reading `.total` off an absent `sentBack` throws
                       during render — past the try/catch above, so it takes the
                       whole page rather than this card. The cache key carries a
                       version for exactly this reason; these are the fallback
                       if one is ever forgotten. */
                    total={data.sentBack?.total ?? 0}
                    byPerson={data.sentBack?.byPerson ?? []}
                    buckets={data.sentBack?.buckets ?? []}
                    undated={data.sentBack?.undated ?? 0}
                    isAdmin={Boolean(me?.isAdmin)}
                    meId={me?.id ?? null}
                    /* THE MAP, not a lookup function. A function cannot be
                       serialised into the RSC payload, so passing one from this
                       server component threw during render and the widget
                       boundary showed "Unable to load sent-back work" — see the
                       prop's own note in sent-back-section.tsx. Every other
                       widget on this page already passes `avatarById` itself. */
                    avatarById={avatarById}
                  />
                    </WidgetBoundary>
                  </div>

                  {/* 2 — Aging Heatmap */}
                  <div id="aging-heatmap" className="scroll-mt-20">
                    <WidgetBoundary label="the aging heatmap">
                  <AgingHeatmap
                    rows={data.agingTable}
                    cellTasks={data.agingHeatmapData.byCell}
                    avatarById={avatarById}
                    me={{ id: me?.id ?? "", isAdmin: Boolean(me?.isAdmin) }}
                  />
                    </WidgetBoundary>
                  </div>

                  {/* 3 — Delivered on Time */}
                  <div id="delivered-on-time" className="scroll-mt-20">
                    <WidgetBoundary label="the on-time gauge">
                    <PageShell as="div" width="full" py={false}>
                      <ExecOnTimeSection />
                    </PageShell>
                    </WidgetBoundary>
                  </div>

                  {/* 3b — The 12-bucket delivery spread, immediately after the
                      on-time overview it elaborates. Moved here from the Task
                      Analytics report; the card itself is unchanged. */}
                  {/* `delivery-vs-due-date`, matching the pill in
                      section-nav.tsx. The id was `delivery-vs-due` and the two
                      were kept in sync by hand; they now read the same string,
                      which is the only thing stopping a silent dead pill. */}
                  <div id="delivery-vs-due-date" className="scroll-mt-20">
                    <WidgetBoundary label="the delivery spread">
                    {/* Same reasoning as sentBack above — render nothing
                        rather than throw if a pre-deploy payload lacks it. */}
                    {data.doneSpread ? (
                      <DeliverySpreadSection dist={data.doneSpread} />
                    ) : null}
                    </WidgetBoundary>
                  </div>

                  {/* 4 — Insights. No longer a TABBED box: the
                      Overview | Performance switcher kept half of this hidden
                      behind a tab, and the section nav above navigates one
                      continuous page instead. Top Performers therefore moves
                      into the flow rather than being orphaned with its tab. */}
                  <div id="status-by-doer" className="scroll-mt-20">
                    <WidgetBoundary label="Status by Doer">
                    <StatusTable
                      rows={data.statusTable}
                      view={filters.view}
                      avatarById={avatarById}
                    />
                    </WidgetBoundary>
                  </div>

                  <div id="delegation-scorecard" className="scroll-mt-20 flex flex-col gap-6 md:gap-8">
                    <WidgetBoundary label="the delegation scorecards">
                    <ExecDelegationSection />
                    {/* Sits directly under the initiation scorecards: the two
                        read the same manager hierarchy, one asking who DELEGATES
                        tasks and this one asking what each team is actually
                        CARRYING across goals, tasks and daily commitments. */}
                    <ManagerActivityTable avatarById={avatarById} />
                    </WidgetBoundary>
                  </div>

                  {/* 5 — Top Performers. The only section with no anchor of
                      its own, so its nav pill had nowhere to point and the bar
                      dropped it at mount (see DASHBOARD_SECTIONS). */}
                  <div id="top-performers" className="scroll-mt-20">
                    <TopPerformersSection
                      performers={data.topPerformers}
                      avatarById={avatarById}
                    />
                  </div>
                </div>
              </ExecDashboard>
            </div>
          </>
        )}
      </main>

    </div>
  );
}
