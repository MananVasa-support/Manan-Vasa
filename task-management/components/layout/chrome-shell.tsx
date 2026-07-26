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
  // surfaces (ws === undefined) render bare. Exceptions: the HR front door (`/hr`),
  // the Candidate Interview Form (`/hr/intake`), the Candidate Records list
  // (`/hr/candidates`), the per-person HR Record hub (`/hr/record`) and the Letters
  // library + each letter page (`/hr/letters`, `/hr/letters/<key>`) are full-screen
  // focused surfaces — all render with NO rail (their own back button is the nav).
  // Other stage sub-pages keep their rail.
  // The HR module never shows the left rail — it navigates via its own cards,
  // stage pop-ups and in-page back buttons. Every /hr surface is full-bleed. The
  // Help Desk (`/support`) is part of the HR room too — reached from the HR-home
  // quick-popup — so it is rail-less as well, matching the rest of the module.
  const isHrFullBleed =
    pathname === "/hr" ||
    (pathname?.startsWith("/hr/") ?? false) ||
    pathname === "/support" ||
    (pathname?.startsWith("/support/") ?? false);
  const showSidebar = Boolean(ws) && !isHrFullBleed;

  if (!showSidebar) return <>{children}</>;

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className="min-w-0 flex-1 max-md:pt-14">{children}</div>
    </div>
  );
}
