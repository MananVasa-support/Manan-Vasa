import { redirect } from "next/navigation";
import type { Route } from "next";

/**
 * Root route — the app starts at the Hub.
 *
 * `/` previously had no page at all, so hitting the bare origin fell through
 * to not-found.tsx. It now sends you to the workspace switchboard, which is
 * the app's real front door.
 *
 * Deliberately a bare redirect with no auth check of its own, so it behaves
 * correctly in BOTH modes: with DISABLE_AUTH=true you land on the Hub
 * directly, and without it the Hub's own `requireUser()` bounces you to
 * /login first and returns you here after sign-in. No auth logic duplicated.
 */
export default function RootPage() {
  redirect("/hub" as Route);
}
