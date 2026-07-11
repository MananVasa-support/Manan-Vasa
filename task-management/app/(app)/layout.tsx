import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan } from "@/lib/daily-checklist/gate";
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
  // Daily gate chain. COMPULSORY for everyone (incl. super-admins): the PLAN gate
  // (daily checklist) and the OWN-DCC fill. SKIPPABLE by super-admins ONLY: the
  // MANAGER (assign-tasks) gate + the DCC-REVIEW (sign-off-your-team) gate — Sir:
  // "me and manan get a skip button on the review and assigning page only, NOT
  // on the daily checklist page". A super-admin's "Skip for today" (sa_gate_skip
  // cookie) bypasses ONLY those two. Day-scoped + FAIL-OPEN.
  {
    const firstName = me.name.split(" ")[0] ?? me.name;
    const isManager = await isManagerWithReports(me.id).catch(() => false);

    // ── COMPULSORY — PLAN gate (≥ MIN_DAILY_ITEMS committed items; counts the
    //    same set as the client, so it can't drift/buffer). Managers exempt
    //    (they do the manager gate). ──
    if (!isManager) {
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) {
        return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
      }
    }

    // ── COMPULSORY — fill YOUR OWN DCC (own compliance, not skippable). ──
    if (process.env.DCC_GATE_OFF !== "true") {
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
      const onDutyRoute = pathname.startsWith("/tasks/new") || pathname.startsWith("/weekly-goals");
      if (!onDutyRoute && process.env.MANAGER_GATES_OFF !== "true") {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) {
          return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
        }
      }
      // DCC REVIEW gate: sign off your DIRECT reports' DCC.
      if (process.env.DCC_GATE_OFF !== "true") {
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
  return (
    <>
      <KeyboardShortcuts />
      <IdleTimerClient timeoutMinutes={15} />
      {children}
    </>
  );
}
