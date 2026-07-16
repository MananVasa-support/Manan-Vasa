"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/**
 * The collapsible shell for the module LEFT-RAIL (dashboard-sidebar). Keeps the
 * rail VERTICAL but lets the user shrink it to an icon-only strip so the page
 * content gets full width, and expand it back to full labels.
 *
 * State lives here (client) for instant toggle, and is mirrored to the
 * `sidebar_collapsed` cookie so the SERVER renders the correct width on the next
 * navigation — no first-paint flicker. The icon-only look is pure CSS keyed off
 * `data-collapsed` (see globals.css `.sidebar-rail[data-collapsed="true"]`), so
 * the server-rendered nav/brand children need no client rewrite.
 */
export function SidebarRail({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={`sidebar-rail sticky top-0 z-40 header-light flex h-dvh shrink-0 flex-col max-md:hidden ${collapsed ? "w-[74px]" : "w-[268px]"}`}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.86)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderRight: "1px solid var(--color-hairline)",
      }}
    >
      {/* Collapse / expand toggle — a chevron chip on the rail's right edge,
          reachable in both states. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-7 z-20 grid h-6 w-6 place-items-center rounded-full border border-hairline bg-surface-card text-ink-soft shadow-sm transition-colors hover:border-hairline-strong hover:text-ink-strong"
      >
        {collapsed ? <PanelLeftOpen size={13} strokeWidth={2.4} /> : <PanelLeftClose size={13} strokeWidth={2.4} />}
      </button>

      {children}
    </aside>
  );
}
