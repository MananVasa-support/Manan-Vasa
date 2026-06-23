import type { ReactNode } from "react";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/current";
import { hasUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { WeeklyGoalsFillView } from "@/components/weekly-goals/weekly-goals-fill-view";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { workspaceForPath } from "@/lib/workspaces";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Load directly (no timeout wrapper). A slow read completes; wrapping auth in
  // a hard timeout turned slow-but-fine reads into thrown "We hit a snag" pages.
  const me = await requireUser();

  // The weekly-goals fill + daily-plan gates are WMS daily-loop rituals — they
  // belong to the WMS workspace only. A user in Employees / Sales / Marketing
  // (or on a shared surface like /inbox, /admin, the /hub launcher) is NOT
  // gated. `x-pathname` is set by the auth middleware (layouts can't read the
  // path otherwise).
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const inWms = workspaceForPath(pathname) === "wms";

  if (inWms) {
    // Mandatory weekly-goals fill gate (design §11). Rendered INLINE (not a
    // redirect) so it can't 404 on a newly-added route. FAIL OPEN: a DB hiccup
    // must never take the app down — on error we simply don't gate this render;
    // the gate re-applies next render. It's a workflow nudge, not a security
    // boundary.
    const mustFill = await hasUnfilledWeekGoals(me.id).catch(() => false);
    if (mustFill) {
      return (
        <WeeklyGoalsFillView employeeId={me.id} greetingName={me.name.split(" ")[0] ?? me.name} />
      );
    }

    // Mandatory DAILY-PLAN gate (WMS_OVERHAUL_MASTER_PLAN §5.3): commit today's
    // plan before entering WMS. Same inline render + fail-open discipline.
    const mustPlan = await needsDailyPlan(me.id).catch(() => false);
    if (mustPlan) {
      return (
        <DailyChecklistView
          employeeId={me.id}
          greetingName={me.name.split(" ")[0] ?? me.name}
          mode="gate"
        />
      );
    }
  }

  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <KeyboardShortcuts />
      {children}
    </>
  );
}
