import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { hasUnfilledWeekGoals } from "@/lib/weekly-goals/gate";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();

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
  // nudge, not a security boundary. The redirect() call stays OUTSIDE the
  // try/catch so its internal control-flow throw is never swallowed.
  let mustFill = false;
  try {
    mustFill = await hasUnfilledWeekGoals(me.id);
  } catch {
    mustFill = false;
  }
  if (mustFill) {
    redirect("/fill-weekly-goals" as Route);
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
