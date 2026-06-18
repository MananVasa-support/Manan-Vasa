import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { WeeklyGoalsBoard } from "@/components/weekly-goals/weekly-goals-board";
import type { BoardGoal } from "@/components/weekly-goals/types";
import { requireUser } from "@/lib/auth/current";
import { WeeklyGoalsDashboardView } from "@/components/weekly-goals/weekly-goals-dashboard-view";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import { listGoalEmployeesScoped } from "@/lib/queries/weekly-goals";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
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

const reviewer = alias(employees, "reviewer");

/**
 * Load the week's goals with the full Planning + Review field set (a superset of
 * `WeeklyGoalRow`). Lives here rather than in lib/queries/weekly-goals.ts so the
 * redesigned board gets every additive column without changing the shared
 * `WeeklyGoalRow` contract other surfaces depend on. Archived goals are kept in
 * the result so super-admins can see + restore them; the board hides them from
 * non-reviewers.
 */
async function loadBoardGoals(opts: {
  weekStart: string;
  employeeId?: string;
  employeeIds?: string[];
}): Promise<BoardGoal[]> {
  // Scope precedence: a single employeeId (one-person view) > an employeeIds
  // set (a manager's team) > unscoped (admin "all team members").
  if (opts.employeeIds && opts.employeeIds.length === 0) return [];
  const where = opts.employeeId
    ? and(
        eq(weeklyGoals.weekStart, opts.weekStart),
        eq(weeklyGoals.employeeId, opts.employeeId),
      )
    : opts.employeeIds
      ? and(
          eq(weeklyGoals.weekStart, opts.weekStart),
          inArray(weeklyGoals.employeeId, opts.employeeIds),
        )
      : eq(weeklyGoals.weekStart, opts.weekStart);

  return db
    .select({
      id: weeklyGoals.id,
      employeeId: weeklyGoals.employeeId,
      employeeName: employees.name,
      weekStart: weeklyGoals.weekStart,
      position: weeklyGoals.position,
      client: weeklyGoals.client,
      subject: weeklyGoals.subject,
      priority: weeklyGoals.priority,
      incentive: weeklyGoals.incentive,
      incentiveAmount: weeklyGoals.incentiveAmount,
      kpi: weeklyGoals.kpi,
      targetDone: weeklyGoals.targetDone,
      pctDone: weeklyGoals.pctDone,
      pctUpdatedAt: weeklyGoals.pctUpdatedAt,
      explanation: weeklyGoals.explanation,
      linkUrl: weeklyGoals.linkUrl,
      carriedFromId: weeklyGoals.carriedFromId,
      weight: weeklyGoals.weight,
      targetDate: weeklyGoals.targetDate,
      notes: weeklyGoals.notes,
      status: weeklyGoals.status,
      acceptPct: weeklyGoals.acceptPct,
      reviewNotes: weeklyGoals.reviewNotes,
      archived: weeklyGoals.archived,
      reviewedById: weeklyGoals.reviewedById,
      reviewedByName: reviewer.name,
      reviewedAt: weeklyGoals.reviewedAt,
      approvedAt: weeklyGoals.approvedAt,
    })
    .from(weeklyGoals)
    .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
    .leftJoin(reviewer, eq(weeklyGoals.reviewedById, reviewer.id))
    .where(where)
    .orderBy(
      opts.employeeId ? asc(weeklyGoals.position) : asc(employees.name),
      asc(weeklyGoals.position),
    );
}

export default async function WeeklyGoalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Analytics dashboard is served as a VIEW of this (registered) route rather
  // than a separate /weekly-goals/dashboard route — Vercel's build for this
  // project doesn't register newly added routes, so the dedicated route 404'd.
  if (pick(sp.view) === "dashboard") {
    return <WeeklyGoalsDashboardView />;
  }

  const me = await requireUser();
  const canReview = isSuperAdmin(me.email);

  const thisWeek = currentWeekStart();
  const weekStart = mondayOf(pick(sp.week) ?? thisWeek);

  // Org-chart scope. Admins manage everyone; managers (anyone with a downline)
  // manage themselves + their full downline; everyone else only themselves.
  const scope = await goalScopeFor(me);
  // A "manager" is a non-admin whose scope has more than just themselves.
  const isManager = !scope.all && scope.ids.length > 1;
  const canPickTeam = me.isAdmin || isManager;
  const manageableIds: "all" | string[] = scope.all ? "all" : scope.ids;

  // Scope selection. Admins default to the whole-team overview ("all") and may
  // drill into one person. Managers default to their team ("all" within scope)
  // and may drill into any downline member (or themselves). Everyone else is
  // locked to themselves.
  const empParam = pick(sp.emp);
  let scopeEmp: string;
  if (me.isAdmin) {
    scopeEmp = empParam ?? "all";
  } else if (isManager) {
    // Honour a drill-in only when it targets someone the manager actually owns.
    scopeEmp = empParam && scope.ids.includes(empParam) ? empParam : "all";
  } else {
    scopeEmp = me.id;
  }

  // Resolve the goals for the chosen scope:
  //  - "all" + admin   → every employee's goals this week
  //  - "all" + manager → only their downline + self
  //  - a person id      → just that person
  const boardScope =
    scopeEmp === "all"
      ? me.isAdmin
        ? {}
        : { employeeIds: scope.ids }
      : { employeeId: scopeEmp };

  const [employeesList, clientOptions, subjectOptions, statusDisplay, rows] =
    await Promise.all([
      listGoalEmployeesScoped(scope),
      listActiveClientNames(),
      listActiveSubjectNames(),
      getStatusDisplayMap(),
      loadBoardGoals({ weekStart, ...boardScope }),
    ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <WeeklyGoalsBoard
        me={{ id: me.id, isAdmin: me.isAdmin, canReview }}
        weekStart={weekStart}
        weekLabel={formatWeekLabel(weekStart)}
        isCurrentWeek={weekStart === thisWeek}
        scopeEmp={scopeEmp}
        canPickTeam={canPickTeam}
        manageableIds={manageableIds}
        employees={employeesList}
        rows={rows}
        statusDisplay={statusDisplay}
        clientOptions={clientOptions}
        subjectOptions={subjectOptions}
        prevWeek={prevWeekStart(weekStart)}
        nextWeek={nextWeekStart(weekStart)}
        thisWeek={thisWeek}
        focusId={pick(sp.focus) ?? null}
      />
      <DashboardFooter />
    </>
  );
}
