"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath, WORKSPACE_LANDING } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";

/**
 * The rail's brand block — logo (linked to the CURRENT module's home) + the big
 * animated module wordmark. CLIENT-reactive via usePathname so, like the nav
 * pills, it tracks the current route across soft navigations instead of freezing
 * to the server-rendered `x-pathname` (which the shared layout reads once). See
 * chrome-shell.tsx for the full "stale shared layout" explanation.
 */
export function SidebarBrand() {
  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  const theme = ws && ws !== "wms" ? MODULE_THEME[ws] : null;
  const ModuleIcon = theme?.Icon;
  const landing = ws ? WORKSPACE_LANDING[ws] : "/dashboard";

  return (
    <>
      <a
        href={landing}
        className="sidebar-logo flex items-center justify-center"
        aria-label="Go to this module's home"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Altus Corp" className="h-14 w-auto" style={{ display: "block" }} />
      </a>

      {theme && ModuleIcon && (
        <span className="module-wordmark inline-flex items-center gap-2.5" aria-label={theme.label}>
          <span
            className="module-wordmark-icon inline-grid place-items-center rounded-2xl text-white"
            style={{
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDeep})`,
              boxShadow: `0 8px 20px -8px ${theme.accentDeep}`,
              width: 40,
              height: 40,
            }}
          >
            <ModuleIcon size={20} strokeWidth={2.6} aria-hidden />
          </span>
          <span
            className="module-wordmark-text leading-none"
            style={
              {
                "--mw-a": theme.accent,
                "--mw-b": theme.accentDeep,
                fontSize: "clamp(18px, 1.5vw, 22px)",
              } as React.CSSProperties
            }
          >
            {theme.label}
          </span>
        </span>
      )}
    </>
  );
}
