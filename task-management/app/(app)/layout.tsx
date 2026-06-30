import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { needsGoalActuals } from "@/lib/weekly-goals/actuals";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { workspaceForPath, canAccessWorkspace } from "@/lib/workspaces";
import { managerDailyTaskGate, isManagerWithReports } from "@/lib/manager-gates";
import { ManagerDailyTaskGate } from "@/components/manager-gates/manager-daily-task-gate";
import { dccGateTarget, dccManagerReviewState } from "@/lib/dcc/gate";
import { DccGateView } from "@/components/dcc/dcc-gate-view";
import { DccManagerReviewGate } from "@/components/dcc/dcc-manager-review-gate";

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
  if (ws && !canAccessWorkspace(ws, await accessFor(me))) {
    redirect("/hub");
  }

  // The daily ritual gate chain. Policy: "once before any workspace" — required
  // when entering ANY room (WMS/Employees/Sales/…), but the hub launcher and
  // shared surfaces (workspaceForPath === null) are NEVER gated. All checks are
  // day-scoped + FAIL-OPEN, so a finished ritual / DB hiccup never traps anyone.
  //
  // Super-admins (Manan, Hetesh) get a floating "Skip for today" button on every
  // gate; once clicked, `gateSkipActive` returns true and the whole chain is
  // bypassed for the rest of the day.
  const canSkip = isSuperAdmin(me.email);
  const skipToday = await gateSkipActive(me).catch(() => false);
  // Wrap a gate render with the floating skip button for super-admins.
  const gate = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);

  if (ws && !skipToday) {
    const firstName = me.name.split(" ")[0] ?? me.name;
    // Managers (have direct reports), admins and super-admins are EXEMPT from the
    // EMPLOYEE planning gate — their loop is give-tasks → DCC, not plan-your-day.
    const isManager = await isManagerWithReports(me.id).catch(() => false);
    const planExempt = me.isAdmin || canSkip || isManager;

    // EMPLOYEE gate — "Plan Your Day": commit ≥5 today AND log today's progress
    // on each open weekly goal, before entering the room. (Replaces the old
    // Mon/Thu weekly-goals fill gate — goal progress is now filled DAILY here.)
    if (!planExempt) {
      const mustPlan =
        (await needsDailyPlan(me.id).catch(() => false)) ||
        (await needsGoalActuals(me.id).catch(() => false));
      if (mustPlan) {
        return gate(<DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />);
      }
    }

    // MANAGER gate: give each direct report their daily tasks. EXEMPT the duty
    // routes (/tasks/new, /weekly-goals) so the gate's own links work. The Wed/Sat
    // weekly-goal gate was removed — managers are now gated on Monday at clock-IN
    // instead (see attendance punch). Kill-switch MANAGER_GATES_OFF.
    const onDutyRoute = pathname.startsWith("/tasks/new") || pathname.startsWith("/weekly-goals");
    const gatesOff = process.env.MANAGER_GATES_OFF === "true";
    if (!onDutyRoute && !gatesOff) {
      const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
      if (dailyGate && !dailyGate.satisfied) {
        return gate(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
      }
    }

    // DCC compliance gate — the LAST link: every employee (managers included)
    // fills the most recent present working day's DCC, then managers sign off
    // their team's. Day-scoped, FAIL-OPEN, DCC_GATE_OFF kill-switch.
    if (process.env.DCC_GATE_OFF !== "true") {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) {
        return gate(<DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />);
      }
      const dccReview = await dccManagerReviewState(me).catch(() => null);
      if (dccReview && !dccReview.satisfied) {
        return gate(<DccManagerReviewGate greetingName={firstName} state={dccReview} />);
      }
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
