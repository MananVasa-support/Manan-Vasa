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

export const dynamic = "force-dynamic";

/**
 * First IST day of the current calendar quarter, as a Date at UTC midnight.
 *
 * The foundation's `weeklyGoalLeaderboard(window, now)` derives its window
 * start from `periodStart(window, now)`. `PerformerPeriod` is only
 * week/month/year (it has no "quarter"), and `lib/weekly-goals/week.ts` is
 * outside this agent's ownership — so we serve "quarter" by calling the query
 * in `"month"` mode with `now` pinned to the quarter's first day. Because a
 * quarter always starts on a month boundary, `monthStart(quarterStart)` ===
 * quarter start, and the `weekStart >= start` filter then captures every week
 * from quarter-start to today (no future goals exist). Quarter-to-date, exact.
 */
function quarterStartDate(now: Date): Date {
  const year = Number(now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4));
  const month = Number(
    now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(5, 7),
  );
  const quarterFirstMonth = Math.floor((month - 1) / 3) * 3 + 1; // 1, 4, 7, 10
  const mm = String(quarterFirstMonth).padStart(2, "0");
  return new Date(`${year}-${mm}-01T00:00:00Z`);
}

export default async function WeeklyGoalsDashboardPage() {
  const me = await requireUser();
  const now = new Date();

  // Non-admins see the same leaderboard but their own trend line; admins see
  // the org-wide trend. Rankings are always org-wide (it's a leaderboard).
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
    // "Quarter" via the month window pinned to the quarter's first day — see
    // quarterStartDate() above.
    weeklyGoalLeaderboard("month", quarterStartDate(now)),
    weeklyGoalLeaderboard("year", now),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
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
