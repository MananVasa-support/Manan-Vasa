import { listUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { currentWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { WeeklyGoalsFillForm } from "@/components/weekly-goals/weekly-goals-fill-form";

/**
 * The mandatory weekly-goals fill screen, as a self-contained async view.
 *
 * Rendered INLINE by the (app) layout when the user is gated — NOT via a
 * redirect to a separate route. Vercel's build for this project doesn't
 * register newly added route files (a fresh `/fill-weekly-goals` 404'd in
 * production), so rendering the gate in place — inside the already-registered
 * (app) layout — is immune to that. After the user submits, the form refreshes
 * and the layout re-checks, dropping the gate.
 */
export async function WeeklyGoalsFillView({
  employeeId,
  greetingName,
}: {
  employeeId: string;
  greetingName: string;
}) {
  const goals = await listUnfilledWeekGoals(employeeId);
  const weekLabel = formatWeekLabel(currentWeekStart());

  return (
    <WeeklyGoalsFillForm
      goals={goals}
      weekLabel={weekLabel}
      greetingName={greetingName}
    />
  );
}
