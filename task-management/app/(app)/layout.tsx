import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { hasUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { WeeklyGoalsFillView } from "@/components/weekly-goals/weekly-goals-fill-view";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { workspaceForPath, canAccessWorkspace } from "@/lib/workspaces";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Load directly (no timeout wrapper). A slow read completes; wrapping auth in
  // a hard timeout turned slow-but-fine reads into thrown "We hit a snag" pages.
  const me = await requireUser();

  // `x-pathname` is set by the auth middleware (layouts can't read the path
  // otherwise) → which workspace this page belongs to.
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const ws = workspaceForPath(pathname);

  // Workspace access control: department-restricted rooms (e.g. Sales) are
  // reachable only by super-admins or members of that department. Everyone else
  // is bounced to the hub before the page renders — covers deep links too.
  if (ws && !canAccessWorkspace(ws, accessFor(me))) {
    redirect("/hub");
  }

  // The weekly-goals fill + daily-plan gates are the daily-loop ritual. Policy:
  // "once before any workspace" — the ritual is required when entering ANY room
  // (WMS/Employees/Sales/Marketing), but the hub launcher and shared surfaces
  // (/inbox, /profile — workspaceForPath === null) are NEVER gated. Because both
  // checks are day-scoped, once the ritual is done it returns false for the rest
  // of the day, so the user is never interrupted again mid-room.
  if (ws) {
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
    // plan before entering the room. Same inline render + fail-open discipline.
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

  // Auto sign-out on idle was removed — sessions now persist like a normal app
  // (Firebase keeps you signed in until you sign out or the cookie expires).
  return (
    <>
      <KeyboardShortcuts />
      {children}
    </>
  );
}
