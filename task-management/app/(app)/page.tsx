import { redirect } from "next/navigation";

/**
 * The app root is the HUB (the workspace switchboard), not the WMS dashboard.
 * Everyone lands on /hub after login and whenever they hit the bare root —
 * the WMS dashboard now lives at /dashboard. The auth middleware already
 * redirects authed "/" → "/hub" before this renders; this is the belt-and-
 * suspenders fallback so the route always resolves to the hub.
 */
export default function RootPage() {
  redirect("/hub");
}
