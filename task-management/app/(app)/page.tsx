import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { VelocityHero } from "@/components/dashboard/velocity-hero";
import { StatusTable } from "@/components/dashboard/status-table";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution";
import { TopPerformersSection } from "@/components/dashboard/top-performers";
import { AgingHeatmap } from "@/components/dashboard/aging-heatmap";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { listEmployees } from "@/lib/queries/employees";
import { loadDashboardData } from "@/lib/queries/dashboard";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { parseFilters } from "@/lib/filters";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [allEmployees, data, statusDisplay] = await Promise.all([
    listEmployees(),
    loadDashboardData(filters),
    getStatusDisplayMap(),
  ]);

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

  return (
    <>
      <DashboardHeader generatedAt={data.generatedAt} />
      <FilterBar
        employees={employeeOptions}
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
      <main>
        {isEmpty ? (
          <WelcomeHero />
        ) : (
          <>
            <KpiStrip kpis={data.kpis} />
            <VelocityHero data={data.velocity} />
            <div className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 grid grid-cols-2 max-lg:grid-cols-1 gap-6">
              <StatusDistributionChart
                data={data.statusDistribution}
                labels={statusLabels}
                tones={statusTones}
              />
              <TopPerformersSection performers={data.topPerformers} />
            </div>
            <StatusTable rows={data.statusTable} view={filters.view} />
            <AgingHeatmap rows={data.agingTable} cellTasks={data.agingHeatmapData.byCell} />
          </>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
