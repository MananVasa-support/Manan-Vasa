import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { WeeklyGoalsDashboard } from "@/components/weekly-goals/weekly-goals-dashboard";
import { requireUser } from "@/lib/auth/current";
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

export async function WeeklyGoalsDashboardView() {
  const me = await requireUser();
  const now = new Date();

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
    weekWiseTrend({ weeks: 8, employeeId: me.isAdmin ? undefined : me.id }),
    employeeRankings("week"),
    employeeRankings("month"),
    employeeRankings("year"),
    performerOf("week"),
    performerOf("month"),
    performerOf("year"),
    globalStarOf("month"),
    weeklyGoalLeaderboard("week", now),
    weeklyGoalLeaderboard("month", now),
    weeklyGoalLeaderboard("month", quarterStartDate(now)),
    weeklyGoalLeaderboard("year", now),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <div className="mx-auto max-w-[1280px] px-8 max-md:px-4 pt-6">
        <Link
          href={"/weekly-goals" as Route}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3.5 py-1.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to goals
        </Link>
      </div>
      <WeeklyGoalsDashboard
        trend={trend}
        trendScope={me.isAdmin ? "Team" : "Your"}
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
