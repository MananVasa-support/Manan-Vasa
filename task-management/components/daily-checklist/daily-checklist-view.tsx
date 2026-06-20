import {
  getTodayItems,
  getOverdueItems,
  listPullableGoals,
} from "@/lib/queries/daily-checklist";
import { TZ } from "@/lib/weekly-goals/week";
import { withTimeout } from "@/lib/db/with-timeout";
import { DayLedger } from "./day-ledger";
import { DailyPlanGate } from "./daily-plan-gate";

/**
 * Server view for the Daily Checklist — fetches today's items, overdue carry-
 * overs, and pullable weekly goals, then renders the interactive ledger. Used
 * both by the /daily-checklist page (mode="page") and the compulsory login gate
 * rendered inline in the (app) layout (mode="gate").
 */
export async function DailyChecklistView({
  employeeId,
  greetingName,
  mode = "page",
}: {
  employeeId: string;
  greetingName?: string;
  mode?: "page" | "gate";
}) {
  // Fail-safe: the gate renders inside the (app) layout for every page, so a DB
  // hiccup here must never throw the layout for the whole company. On error we
  // render empty lists (the user can still add items) rather than crash.
  let items: Awaited<ReturnType<typeof getTodayItems>> = [];
  let overdue: Awaited<ReturnType<typeof getOverdueItems>> = [];
  let pullable: Awaited<ReturnType<typeof listPullableGoals>> = [];
  try {
    // Bounded so a hung query (stale pooled connection) can't freeze this view
    // — which renders inline as the compulsory gate on every page. On timeout we
    // throw → caught → render the empty (but usable) ledger instead of hanging.
    [items, overdue, pullable] = await withTimeout(
      Promise.all([
        getTodayItems(employeeId),
        getOverdueItems(employeeId),
        listPullableGoals(employeeId),
      ]),
      12000,
      "daily-checklist-view",
    );
  } catch {
    // keep the empty defaults
  }

  // Date labels computed server-side in IST → passed as strings (no client
  // toLocaleString → avoids the hydration-wipe gotcha).
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
  const date = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });

  // The compulsory login gate gets the authored "Day Ledger" experience;
  // the in-app /daily-checklist page keeps the working DayLedger surface.
  if (mode === "gate") {
    return (
      <DailyPlanGate
        greetingName={greetingName}
        today={{ weekday, date }}
        items={items}
        overdue={overdue}
        pullable={pullable}
      />
    );
  }

  return (
    <DayLedger
      mode={mode}
      greetingName={greetingName}
      today={{ weekday, date }}
      items={items}
      overdue={overdue}
      pullable={pullable}
    />
  );
}
