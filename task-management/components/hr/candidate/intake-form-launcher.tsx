"use client";

import dynamic from "next/dynamic";
import type { Route } from "next";
import { useRouter } from "next/navigation";

// The 108-field wizard is a full-screen surface — load it only on the client.
const IntakeWizard = dynamic(
  () => import("@/components/hr/candidate/intake-wizard").then((m) => m.IntakeWizard),
  { ssr: false },
);

/**
 * Renders the Candidate Interview Form DIRECTLY on its own plain page (/hr/intake).
 * Back → returns to the HR landing with the Pre-Interview pop-up re-opened.
 * Saved → jumps to the Candidate Records list (Post-Interview).
 */
export function IntakeFormLauncher() {
  const router = useRouter();
  return (
    <IntakeWizard
      onClose={() => router.push("/hr?open=pre-interview" as Route)}
      onSaved={() => router.push("/hr/candidates" as Route)}
    />
  );
}
