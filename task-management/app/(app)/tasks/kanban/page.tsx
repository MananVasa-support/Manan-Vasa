import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { listBoardTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listWeekGoalsAsTasks } from "@/lib/weekly-goals/as-task-row";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import {
  resolveAdminColumnOrder,
  USER_COLUMN_ORDER,
} from "@/lib/kanban-columns";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function KanbanPage({ searchParams }: PageProps) {
  const me = await requireUser();
  // Kanban is an admin-only board — doers work from the list / My Day. A doer
  // who lands here by typing the URL is sent to their task list.
  if (!me.isAdmin) redirect("/tasks" as Route);

  const sp = await searchParams;
  const filters = parseTaskFilters(sp, /*archived*/ false, {});

  // Kanban is admin-only, so the board shows everyone's goals unless the
  // assignee filter narrows the scope. They're injected as badged, link-out
  // cards inside their status column (design §10) and never counted as tasks.
  const goalScope =
    filters.assigneeMode === "all" ? undefined : filters.doerIds;

  const [tasks, statusDisplay, employees, org, subjects, clients, weeklyGoals] =
    await Promise.all([
      listBoardTasks(filters),
      getStatusDisplayMap(),
      listEmployeeOptions(),
      getOrgSettings(),
      listDistinctSubjects(),
      listActiveClientNames(),
      listWeekGoalsAsTasks({
        scope: { employeeIds: goalScope },
        filters: {
          priorities: filters.priorities,
          subjects: filters.subjects,
          clients: filters.clients,
        },
      }).catch(() => []),
    ]);
  const labels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const tones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  // Admins see the admin-configurable order; everyone else the curated list.
  const columnOrder = me.isAdmin
    ? resolveAdminColumnOrder(org.boardColumnOrder)
    : USER_COLUMN_ORDER;

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }));
  const statusOptions = TASK_STATUSES.filter((s) => !isDeprecatedStatus(s)).map((s) => ({
    value: s,
    label: labels[s] ?? s,
  }));
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
        initial={{
          start:  isoDay(filters.startDate),
          end:    isoDay(filters.endDate),
          emp:    filters.doerIds,
          view:   "doer",
          dept:   filters.departments,
          prio:   filters.priorities,
          subj:   filters.subjects,
          status: filters.statuses,
          client: filters.clients,
        }}
      />
      <main className="w-full px-6 max-md:px-4 pt-6 pb-10">
        {/* Light canvas (sir's changes #1) — full-bleed (no centred max-width
            gutters), clean white surface; status colour lives in the columns. */}
        <section
          className="relative overflow-hidden rounded-section border border-hairline p-5 max-md:p-4"
          style={{
            background:
              "linear-gradient(150deg, #ffffff 0%, #ffffff 60%, #fff7f6 100%)",
            boxShadow:
              "0 1px 2px rgba(15,23,42,0.04), 0 24px 56px -40px rgba(225,6,0,0.20)",
          }}
        >
          {/* Brand strip + soft red wash — WMS red identity, light craft. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0"
            style={{
              height: 3,
              background:
                "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep) 55%, transparent)",
            }}
          />
          <span
            aria-hidden
            className="absolute -right-32 -top-40 size-[360px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 8%, transparent), transparent 70%)",
            }}
          />
          <header className="wg-rise relative mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p
                className="uppercase font-black"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 13,
                  letterSpacing: "0.14em",
                  color: "var(--color-altus-red-deep)",
                }}
              >
                WMS · Board
              </p>
              <h1
                className="mt-1.5 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(34px, 3.6vw, 46px)",
                  letterSpacing: "-0.025em",
                  lineHeight: 1,
                }}
              >
                Kanban
              </h1>
              <p className="mt-2.5 text-ink-soft" style={{ fontSize: 15.5 }}>
                Drag a task between columns to change its status.
                {me.isAdmin ? " Drag a column header to reorder the board." : ""}
              </p>
            </div>
            <Link
              href={"/tasks" as Route}
              className="wg-btn inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 h-10 text-[14px] font-bold text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
            >
              List View →
            </Link>
          </header>
          <div className="relative">
            <KanbanBoard
              tasks={tasks}
              weeklyGoals={weeklyGoals}
              labels={labels}
              tones={tones}
              isAdmin={me.isAdmin}
              columnOrder={columnOrder}
            />
          </div>
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
