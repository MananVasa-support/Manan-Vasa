import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { db } from "@/lib/db";
import { weeklyGoals, goals, employees } from "@/db/schema";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import {
  currentWeekStart,
  mondayOf,
  nextWeekStart,
  prevWeekStart,
  formatWeekLabel,
} from "@/lib/weekly-goals/week";
import { weekNoOf } from "@/lib/goals/fy-calendar";
import { monthKey } from "@/lib/goals/types";
import { WeeklyCascadeBoard } from "@/components/goals/weekly/weekly-cascade-board";
import type {
  CascadeWeeklyGoal,
  RosterMember,
  MonthGoalOption,
} from "@/components/goals/weekly/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const parentGoal = alias(goals, "parent_month_goal");

/**
 * The Goals-workspace Weekly board — a cascade-aware SURFACE over the existing
 * `weekly_goals` engine (design §6, §11-C). It shows what the legacy board can't:
 * the monthly-goal linkage (`month_goal_id`), the adopt/cross-out toggle, and the
 * cascade fields (area / uom / target+actual qty & amount / team involved /
 * dependency % / evidence). Weeks are labelled W1..W52 (FY calendar). Team
 * Involved resolves LIVE against active employees (departed members auto-drop).
 *
 * It never edits the legacy `/weekly-goals` files — reads the same table and the
 * mature week/hierarchy helpers, and mutates only the additive columns via its
 * own `actions.ts`.
 */
export default async function GoalsWeeklyPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { me, isAdmin } = await requireGoalsAccess();

  // PERSONAL space (admins) → the private week board (goals table, scope=personal).
  // Professional keeps the cascade-aware weekly_goals surface below.
  if ((await goalsSpace(isAdmin)) === "personal") {
    const data = await loadPersonalWD("week", {
      wk: pick(sp.wk),
      day: pick(sp.day),
      emp: pick(sp.emp),
    });
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <PersonalWDBoard data={data} />
        <DashboardFooter />
      </>
    );
  }

  const thisWeek = currentWeekStart();
  const weekStart = mondayOf(pick(sp.week) ?? thisWeek);

  // Org-chart scope (same model as weekly goals): admins → everyone; managers →
  // self + full downline; everyone else → self only.
  const scope = isAdmin ? { all: true, ids: [] } : await goalScopeFor(me);
  const isManager = !scope.all && scope.ids.length > 1;
  const canPickPerson = isAdmin || isManager;

  // Which person's board are we viewing? Default self; admins/managers may drill
  // into someone they own (validated against scope).
  const empParam = pick(sp.emp);
  let scopeEmp = me.id;
  if (isAdmin && empParam) scopeEmp = empParam;
  else if (isManager && empParam && scope.ids.includes(empParam)) scopeEmp = empParam;

  // The month this week's Monday belongs to (for the "link to monthly goal" picker).
  const thisMonthKey = monthKey(weekStart);

  const [rawRows, monthGoalRows] = await Promise.all([
    db
      .select({
        id: weeklyGoals.id,
        employeeId: weeklyGoals.employeeId,
        employeeName: employees.name,
        weekStart: weeklyGoals.weekStart,
        position: weeklyGoals.position,
        subject: weeklyGoals.subject,
        targetDone: weeklyGoals.targetDone,
        area: weeklyGoals.area,
        uom: weeklyGoals.uom,
        targetQty: weeklyGoals.targetQty,
        targetAmount: weeklyGoals.targetAmount,
        actualQty: weeklyGoals.actualQty,
        actualAmount: weeklyGoals.actualAmount,
        teamInvolved: weeklyGoals.teamInvolved,
        teamDependencyPct: weeklyGoals.teamDependencyPct,
        evidenceUrl: weeklyGoals.evidenceUrl,
        pctDone: weeklyGoals.pctDone,
        acceptPct: weeklyGoals.acceptPct,
        weight: weeklyGoals.weight,
        adopted: weeklyGoals.adopted,
        committedAt: weeklyGoals.committedAt,
        approvedByManagerAt: weeklyGoals.approvedByManagerAt,
        carriedFromId: weeklyGoals.carriedFromId,
        monthGoalId: weeklyGoals.monthGoalId,
        monthGoalTitle: parentGoal.title,
        monthGoalPeriodKey: parentGoal.periodKey,
      })
      .from(weeklyGoals)
      .innerJoin(employees, eq(weeklyGoals.employeeId, employees.id))
      .leftJoin(parentGoal, eq(weeklyGoals.monthGoalId, parentGoal.id))
      .where(
        and(
          eq(weeklyGoals.employeeId, scopeEmp),
          eq(weeklyGoals.weekStart, weekStart),
          eq(weeklyGoals.archived, false),
        ),
      )
      .orderBy(asc(weeklyGoals.position)),
    // Monthly cascade goals this person owns for the current month → linkable parents.
    db
      .select({ id: goals.id, title: goals.title, area: goals.area })
      .from(goals)
      .where(
        and(
          eq(goals.employeeId, scopeEmp),
          eq(goals.period, "month"),
          eq(goals.periodKey, thisMonthKey),
          eq(goals.archived, false),
        ),
      )
      .orderBy(asc(goals.position)),
  ]);

  // Resolve Team Involved live: collect every referenced employee id, fetch the
  // ACTIVE ones (departed / inactive are simply absent → the UI drops them but
  // the stored id is preserved on the row). Also build the add-member roster.
  const referencedIds = new Set<string>();
  for (const r of rawRows) {
    for (const m of r.teamInvolved ?? []) if (m.employeeId) referencedIds.add(m.employeeId);
  }

  // Add-member picker roster: active employees within the viewer's scope.
  const rosterWhere = scope.all
    ? eq(employees.isActive, true)
    : and(
        eq(employees.isActive, true),
        inArray(employees.id, Array.from(new Set([me.id, scopeEmp, ...scope.ids]))),
      );
  const rosterRows = await db
    .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
    .from(employees)
    .where(rosterWhere)
    .orderBy(asc(employees.name));

  // Ensure every referenced-but-out-of-roster id still gets an active/inactive
  // verdict so the card can decide to drop it.
  const rosterIds = new Set(rosterRows.map((r) => r.id));
  const missingRefs = Array.from(referencedIds).filter((id) => !rosterIds.has(id));
  const extraRows =
    missingRefs.length > 0
      ? await db
          .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
          .from(employees)
          .where(inArray(employees.id, missingRefs))
      : [];

  const roster: RosterMember[] = [...rosterRows, ...extraRows].map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
  }));

  const rows: CascadeWeeklyGoal[] = rawRows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    weekStart: String(r.weekStart),
    position: r.position,
    subject: r.subject,
    targetDone: r.targetDone,
    area: r.area,
    uom: r.uom,
    targetQty: r.targetQty,
    targetAmount: r.targetAmount,
    actualQty: r.actualQty,
    actualAmount: r.actualAmount,
    teamInvolved: r.teamInvolved ?? [],
    teamDependencyPct: r.teamDependencyPct,
    evidenceUrl: r.evidenceUrl,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    weight: r.weight,
    adopted: r.adopted,
    committed: r.committedAt != null,
    approvedByManager: r.approvedByManagerAt != null,
    carriedFromId: r.carriedFromId,
    monthGoalId: r.monthGoalId,
    monthGoalTitle: r.monthGoalTitle ?? null,
  }));

  const monthGoalOptions: MonthGoalOption[] = monthGoalRows.map((g) => ({
    id: g.id,
    title: g.title,
    area: g.area,
  }));

  // People picker (admins/managers) — scoped active employees.
  const people = canPickPerson
    ? roster
        .filter((r) => r.isActive)
        .map((r) => ({ id: r.id, name: r.name }))
    : [];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <WeeklyCascadeBoard
        me={{ id: me.id, isAdmin }}
        weekStart={weekStart}
        weekNo={weekNoOf(weekStart)}
        weekLabel={formatWeekLabel(weekStart)}
        isCurrentWeek={weekStart === thisWeek}
        prevWeek={prevWeekStart(weekStart)}
        nextWeek={nextWeekStart(weekStart)}
        thisWeek={thisWeek}
        scopeEmp={scopeEmp}
        canPickPerson={canPickPerson}
        people={people}
        rows={rows}
        roster={roster}
        monthGoalOptions={monthGoalOptions}
      />
      <DashboardFooter />
    </>
  );
}
