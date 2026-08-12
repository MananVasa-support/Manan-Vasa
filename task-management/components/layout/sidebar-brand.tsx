"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";

/**
 * The rail's brand block — the Altus Corp logo above the animated module
 * wordmark.
 *
 * DISPLAY ONLY: this used to be a <Link> to /hub, and is deliberately no longer
 * clickable. "Back to Hub" still exists as its own always-visible button in
 * `header.tsx`, on every module — so the route is not lost, it just isn't hidden
 * behind the logo any more.
 *
 * Centring lives HERE rather than on the parent. `.sidebar-brand` also wraps the
 * history/search/collapse row, so putting `items-center` up there would shrink
 * that row to its content width instead of letting it span the rail. This block
 * centres itself (`items-center` + `w-full` children) and stays centred in the
 * collapsed rail too.
 *
 * CLIENT-reactive via usePathname so, like the nav pills, it tracks the current
 * route across soft navigations instead of freezing to the server-rendered
 * `x-pathname` (which the shared layout reads once). See chrome-shell.tsx for
 * the full "stale shared layout" explanation.
 */
export function SidebarBrand() {
  const pathname = usePathname();
  const ws = workspaceForPath(pathname ?? "/");
  const theme = ws ? MODULE_THEME[ws] : null;
  const ModuleIcon = theme?.Icon;

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center gap-3 text-center">
      <span className="sidebar-logo flex w-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Altus Corp" className="h-[68px] w-auto" style={{ display: "block" }} />
      </span>

      {theme && ModuleIcon && (
        <span className="module-wordmark inline-flex w-full items-center justify-center gap-2.5">
          <span
            className="module-wordmark-icon inline-grid place-items-center rounded-2xl text-white"
            style={{
              background: `linear-gradient(135deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400))`,
              boxShadow: `0 8px 20px -8px var(--color-altus-red-deep, #A80400)`,
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
                "--mw-a": "var(--color-altus-red, #E10600)",
                "--mw-b": "var(--color-altus-red-deep, #A80400)",
                fontSize: "clamp(18px, 1.5vw, 22px)",
              } as React.CSSProperties
            }
          >
            {theme.label}
          </span>
        </span>
      )}
    </div>
  );
}
