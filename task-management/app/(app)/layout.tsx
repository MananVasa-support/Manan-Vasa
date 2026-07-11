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
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
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

  // The daily ritual gate chain. Policy: a COMPULSORY post-login wall — the daily
  // rituals (plan-your-day / DCC / manager duties) must be done before ANY app
  // surface opens, INCLUDING the hub launcher. There is no ungated landing spot:
  // you cannot slip past by going to /hub or any other route. All checks are
  // day-scoped + FAIL-OPEN, so a finished ritual / DB hiccup never traps anyone,
  // and each has a kill-switch (DCC_GATE_OFF / MANAGER_GATES_OFF).
  //
  // The gate view takes over full-screen and its ritual is filled inline (no
  // navigation), so gating every route is safe — the manager duty routes
  // (/tasks/new, /weekly-goals) stay reachable via the `onDutyRoute` exemption.
  //
  // Super-admins (Manan, Hetesh) get a floating "Skip for today" button on every
  // gate; once clicked, `gateSkipActive` returns true and the whole chain is
  // bypassed for the rest of the day. Skip is super-admin ONLY (server-verified),
  // so employees + managers can never bypass.
  const canSkip = isSuperAdmin(me.email);
  const skipToday = await gateSkipActive(me).catch(() => false);
  // Wrap a gate render with the floating skip button for super-admins.
  const gate = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);

  if (!skipToday) {
    const firstName = me.name.split(" ")[0] ?? me.name;
    // Managers (have direct reports), admins and super-admins are EXEMPT from the
    // EMPLOYEE planning gate — their loop is give-tasks → DCC, not plan-your-day.
    const isManager = await isManagerWithReports(me.id).catch(() => false);
    const planExempt = me.isAdmin || canSkip || isManager;

    // EMPLOYEE gate — "Plan Your Day": commit at least ONE item to TODAY'S
    // checklist AND log today's progress on each open weekly goal, before
    // entering. CRITICAL: this threshold MUST match the client gate's own
    // enable rule (`met = count >= 1` in daily-plan-gate.tsx) — a mismatch
    // (server wanted ≥5, client enabled at ≥1) made "Start my day" buffer
    // forever: the button lit up, router.refresh() re-ran the server wall,
    // which re-blocked, re-rendering the same gate. Keep them in lock-step.
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

  // Auto sign-out after 15 minutes of inactivity → back to the login screen
  // (Sir's policy). On timeout IdleTimerClient revokes the Firebase + DB session
  // and hard-navigates to /login?reason=idle, so the next day starts fresh:
  // login → daily-checklist + weekly-goals gate → hub.
  return (
    <>
      <KeyboardShortcuts />
      <IdleTimerClient timeoutMinutes={15} />
      {children}
    </>
  );
}
