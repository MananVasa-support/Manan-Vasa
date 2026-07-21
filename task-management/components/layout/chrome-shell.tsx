"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";

/**
 * Decides the app chrome CLIENT-side so it stays correct across SOFT navigations.
 *
 * WHY THIS EXISTS: the `(app)` layout is a SHARED layout — Next.js does NOT re-run
 * it on client-side navigation between routes it wraps (only the pages re-render).
 * So a server value the layout reads once (the middleware's `x-pathname` header)
 * goes STALE the moment you soft-navigate: the sidebar would stick to whatever
 * workspace you first landed on — showing on the hub, vanishing on a module — and
 * only "correct itself" on a full reload / HMR. `usePathname()` is reactive on the
 * client, so the show/hide decision here is always in sync with the current page.
 *
 * Rule: EVERY module — including WMS — uses the vertical left rail. Only the hub
 * and shared surfaces (which have no workspace) render without it. The `sidebar`
 * is server-rendered once and passed in; its inner nav (MainNav) + brand already
 * read `usePathname()`, so its contents track the current route too.
 */
export function ChromeShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  // WMS now uses the rail too — show it for ANY workspace; only the hub / shared
  // surfaces (ws === undefined) render bare.
  const showSidebar = Boolean(ws);

  if (!showSidebar) return <>{children}</>;

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className="min-w-0 flex-1 max-md:pt-14">{children}</div>
    </div>
  );
}
