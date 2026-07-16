import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan, needsGoalsPlanCommit } from "@/lib/daily-checklist/gate";
import { planGateOn, managerTaskGateOn, dccReviewGateOn, goalsCascadeEnabled, loginPlanGateOn, loginDccGateOn } from "@/lib/goals/flag";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
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
  // Daily gate chain. COMPULSORY for everyone (incl. super-admins): the PLAN gate
  // (daily checklist) and the OWN-DCC fill. SKIPPABLE by super-admins ONLY: the
  // MANAGER (assign-tasks) gate + the DCC-REVIEW (sign-off-your-team) gate — Sir:
  // "me and manan get a skip button on the review and assigning page only, NOT
  // on the daily checklist page". A super-admin's "Skip for today" (sa_gate_skip
  // cookie) bypasses ONLY those two. Day-scoped + FAIL-OPEN.
  {
    const firstName = me.name.split(" ")[0] ?? me.name;
    const isManager = await isManagerWithReports(me.id).catch(() => false);

    // ── COMPULSORY — PLAN gate. Two implementations, switched by planGateOn():
    //    • NEW (planGateOn on): the redesigned Plan-Your-Day at /goals/plan with
    //      a role-based minimum (3 IC / 5 manager, design §4). Under-min → send
    //      them to /goals/plan; the plan route itself is exempt (else it loops).
    //    • LEGACY (default, planGateOn off): the daily-checklist plan gate for
    //      non-managers, rendered inline. UNCHANGED — flipping the flag on is the
    //      only thing that swaps behaviour. Counts the same committed-items set
    //      as the client either way, so it can't drift/buffer. ──
    if (planGateOn() && goalsCascadeEnabled()) {
      const onPlanRoute = pathname.startsWith("/goals/plan");
      if (!onPlanRoute) {
        const minItems = isManager ? 5 : 3;
        const underMin = await needsGoalsPlanCommit(me.id, minItems).catch(() => false);
        if (underMin) redirect("/goals/plan");
      }
    } else if (loginPlanGateOn() && !isManager) {
      // Legacy "commit your day" wall — now OFF by default (Sir). LOGIN_PLAN_GATE_ON=true restores.
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) {
        return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
      }
    }

    // ── Own-DCC "fill your DCC" wall — now OFF by default at login (Sir).
    //    LOGIN_DCC_GATE_ON=true restores. (The punch-out DCC block still uses
    //    DCC_GATE_OFF, so clock-out compliance is unaffected.) ──
    if (loginDccGateOn()) {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) {
        return <DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />;
      }
    }

    // ── SKIPPABLE by super-admins — the manager duties (assign + review). ──
    const canSkip = isSuperAdmin(me.email);
    const skipDuties = canSkip && (await gateSkipActive(me).catch(() => false));
    const withSkip = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);
    if (!skipDuties) {
      // MANAGER gate: give each report their daily tasks. Duty routes exempt.
      // Rewired to managerTaskGateOn() (default OFF ⇒ the "manager must assign
      // tasks daily" rule is REMOVED, per design §4). Set MANAGER_TASK_GATE_ON=
      // true to restore it. The legacy MANAGER_GATES_OFF switch no longer gates
      // this branch.
      const onDutyRoute = pathname.startsWith("/tasks/new") || pathname.startsWith("/weekly-goals");
      if (!onDutyRoute && managerTaskGateOn()) {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) {
          return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
        }
      }
      // DCC REVIEW gate: sign off your DIRECT reports' DCC. Rewired to
      // dccReviewGateOn() (default OFF ⇒ the review step is removed for now,
      // design §4). Set DCC_REVIEW_GATE_ON=true to restore it. (The COMPULSORY
      // own-DCC fill above still honors DCC_GATE_OFF — unchanged.)
      if (dccReviewGateOn()) {
        const dccReview = await dccManagerReviewState(me).catch(() => null);
        if (dccReview && !dccReview.satisfied) {
          return withSkip(<DccManagerReviewGate greetingName={firstName} state={dccReview} />);
        }
      }
    }
  }

  // Auto sign-out after 15 minutes of inactivity → back to the login screen
  // (Sir's policy). On timeout IdleTimerClient revokes the Firebase + DB session
  // and hard-navigates to /login?reason=idle, so the next day starts fresh:
  // login → daily-checklist + weekly-goals gate → hub.
  // Sir's "left → right" layout: every module EXCEPT WMS uses a vertical LEFT-RAIL
  // instead of the top header. The rail is an IN-FLOW flex child here, so the page
  // (flex-1) is offset by the rail's real width — content can never overlap it.
  // On phones the rail hides (a slim fixed top bar takes over → pt on content).
  // WMS keeps its top header (the page renders it itself; no flex wrap here).
  const sidebarWs = Boolean(ws && ws !== "wms");
  return (
    <>
      <KeyboardShortcuts />
      <IdleTimerClient timeoutMinutes={15} />
      {sidebarWs ? (
        <div className="flex min-h-dvh">
          <DashboardSidebar />
          <div className="min-w-0 flex-1 max-md:pt-14">{children}</div>
        </div>
      ) : (
        children
      )}
    </>
  );
}
