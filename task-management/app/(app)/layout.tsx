import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";
import { hasUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { WeeklyGoalsFillView } from "@/components/weekly-goals/weekly-goals-fill-view";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { withTimeout, withTimeoutOr } from "@/lib/db/with-timeout";

// This layout wraps EVERY authed page; if any await here hangs (e.g. a query on
// a stale pooled connection), the whole app is stuck on its skeleton. So every
// DB await below is bounded by a hard timeout — a hang becomes a fast rejection
// the existing fail-open / default handling absorbs.
const GATE_TIMEOUT_MS = 7000;
const AUTH_TIMEOUT_MS = 10000;

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Auth must NOT fail open — but a hang here freezes every page. Bound it so a
  // dead connection surfaces as an error (→ error boundary / retry) instead of
  // an endless "Loading…". The user simply retries onto a fresh connection.
  const me = await withTimeout(requireUser(), AUTH_TIMEOUT_MS, "requireUser");

  // Mandatory weekly-goals fill gate (design §11). Every authed page renders
  // through this layout, so a user with any un-filled current-week goal is
  // redirected to the fill screen here — direct URLs, deep links, the back
  // button and bookmarks all pass through. Applies to EVERYONE (admins and
  // super-admins included); zero bypass. The fill page lives outside this
  // (app) group so it stays reachable without an infinite redirect.
  //
  // FAIL OPEN: the gate check must never be able to take the whole app down.
  // If the DB hiccups (we've had transient pool/connection blips), we do NOT
  // gate this request rather than throw the layout for every page. The gate
  // re-applies on the next render once the DB is healthy — it's a workflow
  // nudge, not a security boundary.
  // FAIL OPEN on error OR timeout: a hung gate query must never freeze the app.
  const mustFill = await withTimeoutOr(
    hasUnfilledWeekGoals(me.id),
    GATE_TIMEOUT_MS,
    false,
    "weekly-goals-gate",
  );
  // Render the fill screen INLINE (not a redirect to a separate route): Vercel's
  // build for this project doesn't register newly added routes, so a redirect
  // target like /fill-weekly-goals 404'd in prod. Rendering it here — inside the
  // already-registered (app) layout — is immune to that. The form refreshes on
  // submit, this layout re-checks, and the gate drops. Every authed page passes
  // through here, so direct URLs/deep links/back button are all gated. Applies
  // to everyone incl. super-admins.
  if (mustFill) {
    return (
      <WeeklyGoalsFillView employeeId={me.id} greetingName={me.name.split(" ")[0] ?? me.name} />
    );
  }

  // Mandatory DAILY-PLAN gate (WMS_OVERHAUL_MASTER_PLAN §5.3). After weekly
  // goals, every authed page also gates on today's checklist: a user must
  // commit ≥1 item to today before entering — the in-app replacement for the
  // WhatsApp daily plan. Same inline render (not a redirect) + fail-open
  // discipline as the weekly gate above.
  const mustPlan = await withTimeoutOr(
    needsDailyPlan(me.id),
    GATE_TIMEOUT_MS,
    false,
    "daily-plan-gate",
  );
  if (mustPlan) {
    return (
      <DailyChecklistView
        employeeId={me.id}
        greetingName={me.name.split(" ")[0] ?? me.name}
        mode="gate"
      />
    );
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
