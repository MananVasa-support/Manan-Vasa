import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
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
  // COMPULSORY daily gate chain — NO bypass. The super-admin "Skip for today"
  // escape was removed (Sir: "how am I able to come here?" — the skip cookie let
  // super-admins roam past the gate). Everyone, super-admins included, must clear
  // the gate. Only MANAGERS skip the plan gate — they do the manager gate instead.
  // All checks are day-scoped + FAIL-OPEN (a DB hiccup never traps anyone).
  {
    const firstName = me.name.split(" ")[0] ?? me.name;
    const isManager = await isManagerWithReports(me.id).catch(() => false);

    // PLAN gate — commit ≥ MIN_DAILY_ITEMS (3) COMMITTED items to today. Reads
    // the SAME constant + counts the SAME set (countPlannedItems / source
    // "personal") as the client, so it can never drift or buffer.
    if (!isManager) {
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) {
        return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
      }
    }

    // MANAGER gate: give each report their daily tasks. Duty routes (/tasks/new,
    // /weekly-goals) exempt so the gate's own links work. Kill-switch MANAGER_GATES_OFF.
    const onDutyRoute = pathname.startsWith("/tasks/new") || pathname.startsWith("/weekly-goals");
    if (!onDutyRoute && process.env.MANAGER_GATES_OFF !== "true") {
      const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
      if (dailyGate && !dailyGate.satisfied) {
        return <ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />;
      }
    }

    // DCC compliance gate — LAST link. Day-scoped, FAIL-OPEN, DCC_GATE_OFF switch.
    if (process.env.DCC_GATE_OFF !== "true") {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) {
        return <DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />;
      }
      const dccReview = await dccManagerReviewState(me).catch(() => null);
      if (dccReview && !dccReview.satisfied) {
        return <DccManagerReviewGate greetingName={firstName} state={dccReview} />;
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
