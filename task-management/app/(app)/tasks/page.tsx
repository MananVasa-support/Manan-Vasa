import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { TaskListPage } from "@/components/tasks/task-list-page";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listWeekGoalsAsTasks } from "@/lib/weekly-goals/as-task-row";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  // Non-admins default to "assigned to me" when no explicit ?emp= is set.
  const filters = parseTaskFilters(sp, /*archived*/ false, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  // This week's goals for the view's scope, surfaced as a pinned group above
  // the task table (design §10). Honours the shared client/subject/priority
  // filters. Display-only — never counted in the KPIs.
  //
  // PRIVACY: weekly goals are private to their owner. A NON-ADMIN must never see
  // other people's goals — even via ?emp=all (which collapses doerIds to []).
  // So clamp non-admins to their own goal scope (self + downline, matching the
  // Weekly Goals board's rule); only admins may widen to "all" (undefined).
  let goalScope: string[] | undefined;
  if (me.isAdmin) {
    goalScope = filters.assigneeMode === "all" ? undefined : filters.doerIds;
  } else {
    const scope = await goalScopeFor(me);
    goalScope = filters.doerIds.length
      ? filters.doerIds.filter((id) => scope.ids.includes(id))
      : scope.ids;
  }

  const [allEmployees, rows, subjects, clients, statusDisplay, weeklyGoals] =
    await Promise.all([
      listEmployeeOptions(),
      listTasks(filters),
      listDistinctSubjects(),
      listActiveClientNames(),
      getStatusDisplayMap(),
      listWeekGoalsAsTasks({
        scope: { employeeIds: goalScope },
        filters: {
          priorities: filters.priorities,
          subjects: filters.subjects,
          clients: filters.clients,
        },
      }).catch(() => []),
    ]);

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const employeeOptions = allEmployees.map((e) => ({
    value: e.id,
    label: e.name,
  }));

  // Status filter options in canonical workflow order, carrying the
  // admin-overridable human labels. Retired statuses (follow_up_1/2/3,
  // cancelled, transferred) are dropped from the picker — see sir's changes
  // #2/#4/#6 — but approved/not_approved stay so the KPI links still filter.
  const statusOptions: { value: string; label: string }[] = [
    ...TASK_STATUSES.filter((s) => !isDeprecatedStatus(s)).map((s) => ({
      value: s as string,
      label: statusLabels[s] ?? s,
    })),
    // Pseudo-status: selecting it shows archived tasks (handled in
    // parseTaskFilters → filters.archived). Lets you reach the Archive from the
    // main Tasks list without leaving for the dedicated /archived page.
    { value: "archived", label: "Archived" },
  ];

  const isoDay = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <FilterBar
        employees={employeeOptions}
        subjects={subjects}
        statusOptions={statusOptions}
        clients={clients}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        assigneeMode={filters.assigneeMode}
        taskCount={rows.length}
        initial={{
          start:  isoDay(filters.startDate),
          end:    isoDay(filters.endDate),
          emp:    filters.doerIds,
          view:   "doer",
          dept:   filters.departments,
          prio:   filters.priorities,
          subj:   filters.subjects,
          // Reflect the Archived pseudo-chip back into the picker when active.
          status: filters.archived ? [...filters.statuses, "archived"] : filters.statuses,
          client: filters.clients,
        }}
      />
      <TaskListPage
        title="Tasks"
        rows={rows}
        filters={filters}
        employees={allEmployees}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        statusLabels={statusLabels}
        statusTones={statusTones}
        subjects={subjects}
        clients={clients}
        weeklyGoals={weeklyGoals}
      />
      <DashboardFooter />
    </>
  );
}
