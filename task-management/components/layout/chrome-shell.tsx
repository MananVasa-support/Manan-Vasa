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
    (pathname?.startsWith("/support/") ?? false) ||
    // The universal signing surface is a FOCUSED task flow reached from the
    // (rail-less) HR Letters / Policies / Agreements pages. It maps to the WMS
    // workspace by path, which wrongly stacked the WMS rail on top of its own
    // header — render it full-bleed like the HR surfaces it's launched from.
    (pathname?.startsWith("/documents/sign") ?? false);
  const showSidebar = Boolean(ws) && !isHrFullBleed;

  // Full-height frame (both branches): the page column is a FULL-HEIGHT flex
  // column, so a short page still reaches the bottom of the viewport instead of
  // stopping mid-screen. Content keeps its natural height and simply grows past
  // the fold on long pages. This outlived the global footer it was originally
  // built for — `.app-shell-column > main` (globals.css) is what now absorbs the
  // slack, and the body's fixed gradient paints everything below the content.
  if (!showSidebar) {
    return <div className="flex min-h-dvh flex-col">{children}</div>;
  }

  return (
    <div className="flex min-h-dvh">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col max-md:pt-14">{children}</div>
    </div>
  );
}
