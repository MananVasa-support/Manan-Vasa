import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { WeeklyGoalsBoard } from "@/components/weekly-goals/weekly-goals-board";
import { requireUser } from "@/lib/auth/current";
import {
  listWeeklyGoals,
  listGoalsForWeek,
  listGoalEmployees,
} from "@/lib/queries/weekly-goals";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import {
  currentWeekStart,
  mondayOf,
  nextWeekStart,
  prevWeekStart,
  formatWeekLabel,
} from "@/lib/weekly-goals/week";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function WeeklyGoalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();

  const thisWeek = currentWeekStart();
  const weekStart = mondayOf(pick(sp.week) ?? thisWeek);

  // Scope: non-admins are always locked to themselves. Admins default to the
  // whole-team overview ("all") and may drill into one person.
  const empParam = pick(sp.emp);
  const scopeEmp = me.isAdmin ? empParam ?? "all" : me.id;

  const [employees, clientOptions, subjectOptions] = await Promise.all([
    listGoalEmployees(),
    listActiveClientNames(),
    listActiveSubjectNames(),
  ]);

  const rows =
    scopeEmp === "all"
      ? await listGoalsForWeek(weekStart)
      : await listWeeklyGoals({ employeeId: scopeEmp, weekStart });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <WeeklyGoalsBoard
        me={{ id: me.id, isAdmin: me.isAdmin }}
        weekStart={weekStart}
        weekLabel={formatWeekLabel(weekStart)}
        isCurrentWeek={weekStart === thisWeek}
        scopeEmp={scopeEmp}
        employees={employees}
        rows={rows}
        clientOptions={clientOptions}
        subjectOptions={subjectOptions}
        prevWeek={prevWeekStart(weekStart)}
        nextWeek={nextWeekStart(weekStart)}
        thisWeek={thisWeek}
      />
      <DashboardFooter />
    </>
  );
}
