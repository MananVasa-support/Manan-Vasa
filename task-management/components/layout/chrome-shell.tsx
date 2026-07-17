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
 * Rule (unchanged from before, just now reactive): every module EXCEPT WMS uses the
 * left rail; WMS + the hub + shared surfaces use their own top header (or none), so
 * the rail is hidden there. The `sidebar` is server-rendered once and passed in; its
 * inner nav (MainNav) + brand already read `usePathname()`, so its contents track
 * the current route too.
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
  const showSidebar = Boolean(ws && ws !== "wms");

  if (!showSidebar) return <>{children}</>;

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className="min-w-0 flex-1 max-md:pt-14">{children}</div>
    </div>
  );
}
