import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { listUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { WeeklyGoalsFillForm } from "@/components/weekly-goals/weekly-goals-fill-form";

export const dynamic = "force-dynamic";

/**
 * The mandatory weekly-goals fill screen (design §11). Listed for any user the
 * layout gate redirected here because they have un-filled current-week goals.
 * They enter % Done (+ optional explanation) for each and submit once to enter
 * the app. If there's nothing to fill (e.g. they navigated here directly after
 * filling) we send them straight in — the gate is satisfied.
 */
export default async function WeeklyGoalsFillPage() {
  const me = await requireUser();
  const goals = await listUnfilledWeekGoals(me.id);

  // Nothing left to fill → the gate is satisfied; go to the app.
  if (goals.length === 0) {
    redirect("/" as Route);
  }

  const weekStart = currentWeekStart();

  return (
    <WeeklyGoalsFillForm
      goals={goals}
      weekLabel={formatWeekLabel(weekStart)}
      greetingName={me.name.split(" ")[0] ?? me.name}
    />
  );
}
