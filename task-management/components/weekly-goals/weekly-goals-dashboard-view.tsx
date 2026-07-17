import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, User, X } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { WeeklyGoalsDashboard } from "@/components/weekly-goals/weekly-goals-dashboard";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import {
  employeeRankings,
  performerOf,
  globalStarOf,
  weekWiseTrend,
  weeklyGoalLeaderboard,
} from "@/lib/queries/weekly-goals";

/**
 * The Weekly Goals analytics dashboard, as a self-contained async view.
 *
 * Rendered via the EXISTING `/weekly-goals?view=dashboard` route (and the
 * `/weekly-goals/dashboard` route where it resolves). It is deliberately NOT
 * its own new route: Vercel's build for this project does not register newly
 * added route files, so a fresh `/weekly-goals/dashboard` 404'd in production —
 * surfacing it through the already-registered `/weekly-goals` route sidesteps
 * that entirely.
 */
function quarterStartDate(now: Date): Date {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const quarterFirstMonth = Math.floor((month - 1) / 3) * 3 + 1; // 1, 4, 7, 10
  const mm = String(quarterFirstMonth).padStart(2, "0");
  return new Date(`${year}-${mm}-01T00:00:00Z`);
}

export async function WeeklyGoalsDashboardView({ employeeId }: { employeeId?: string } = {}) {
  const me = await requireUser();
  const now = new Date();

  // Resolve who this dashboard is scoped to. Admin/super may drill into anyone;
  // a manager only into their downline (or self); an individual contributor only
  // ever sees themselves. `emp` (when set) filters EVERY query to that person, so
  // selecting an employee shows ONLY their data — not the same org leaderboard.
  const isAdminLike = me.isAdmin || isSuperAdmin(me.email);
  const scope = isAdminLike ? null : await goalScopeFor(me);
  const isManager = scope ? scope.ids.length > 1 : true;
  let emp: string | undefined;
  if (isAdminLike) emp = employeeId || undefined;
  else if (isManager) emp = employeeId && scope!.ids.includes(employeeId) ? employeeId : undefined;
  else emp = me.id;

  const empName = emp
    ? (await db.select({ name: employees.name }).from(employees).where(eq(employees.id, emp)).limit(1))[0]?.name ?? null
    : null;
  const scoped = emp != null;

  const [
    trend,
    weekRanks,
    monthRanks,
    yearRanks,
    performerWeek,
    performerMonth,
    performerYear,
    starMonth,
    leaderWeek,
    leaderMonth,
    leaderQuarter,
    leaderYear,
  ] = await Promise.all([
    weekWiseTrend({ weeks: 8, employeeId: emp ?? (isAdminLike ? undefined : me.id) }),
    employeeRankings("week", now, emp),
    employeeRankings("month", now, emp),
    employeeRankings("year", now, emp),
    performerOf("week"),
    performerOf("month"),
    performerOf("year"),
    globalStarOf("month"),
    weeklyGoalLeaderboard("week", now, emp),
    weeklyGoalLeaderboard("month", now, emp),
    weeklyGoalLeaderboard("month", quarterStartDate(now), emp),
    weeklyGoalLeaderboard("year", now, emp),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <div className="mx-auto max-w-[1280px] px-8 max-md:px-4 pt-6 flex items-center gap-3 flex-wrap">
        <Link
          href={"/weekly-goals" as Route}
          className="brand-btn inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to goals
        </Link>
        {scoped && (
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13.5px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <User size={14} strokeWidth={2.6} />
            Viewing {empName ?? "one person"}
            <Link href={"/weekly-goals?view=dashboard" as Route} aria-label="Clear employee filter" className="ml-1 inline-flex items-center rounded-full bg-white/25 p-0.5 hover:bg-white/40">
              <X size={13} strokeWidth={3} />
            </Link>
          </span>
        )}
      </div>
      <WeeklyGoalsDashboard
        trend={trend}
        trendScope={scoped ? (empName ?? "Their") : me.isAdmin ? "Team" : "Your"}
        rankings={{ week: weekRanks, month: monthRanks, year: yearRanks }}
        performers={{ week: performerWeek, month: performerMonth, year: performerYear }}
        starOfMonth={starMonth}
        leaderboards={{
          week: leaderWeek,
          month: leaderMonth,
          quarter: leaderQuarter,
          year: leaderYear,
        }}
        myId={me.id}
      />
      <DashboardFooter />
    </>
  );
}
