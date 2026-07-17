"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/**
 * The collapsible shell for the module LEFT-RAIL. Owns the collapsed state (client,
 * for instant toggle) and mirrors it to the `sidebar_collapsed` cookie so the
 * SERVER renders the right width on the next navigation — no first-paint flicker.
 * The icon-only collapsed look is pure CSS keyed off `data-collapsed`
 * (globals.css `.sidebar-rail[data-collapsed="true"]`).
 *
 * The collapse/expand toggle is NOT rendered here — it's exposed via context so it
 * can sit up in the brand row beside the search icon (`<SidebarToggle />`).
 */
const CollapseCtx = React.createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebarCollapse() {
  return React.useContext(CollapseCtx);
}

export function SidebarRail({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <CollapseCtx.Provider value={{ collapsed, toggle }}>
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={`sidebar-rail sticky top-0 z-40 header-light flex h-dvh shrink-0 flex-col max-md:hidden ${collapsed ? "w-[74px]" : "w-[212px]"}`}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.86)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderRight: "1px solid var(--color-hairline)",
        }}
      >
        {children}
      </aside>
    </CollapseCtx.Provider>
  );
}

/** Collapse/expand toggle — placed beside the search icon in the brand row. */
export function SidebarToggle() {
  const { collapsed, toggle } = useSidebarCollapse();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-pressed={collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
    >
      {collapsed ? <PanelLeftOpen size={15} strokeWidth={2.3} /> : <PanelLeftClose size={15} strokeWidth={2.3} />}
    </button>
  );
}
