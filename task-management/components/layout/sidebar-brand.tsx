"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { workspaceForPath } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";

/**
 * The rail's brand block — logo + the big animated module wordmark, which
 * TOGETHER form the link back to the Hub. This replaced the standalone "Back to
 * Hub" pill that used to sit directly beneath it, so the brand mark now carries
 * that navigation instead of duplicating it.
 *
 * `flex-col gap-3` on the link reproduces the `gap-3` the two elements used to
 * get as separate children of `.sidebar-brand`, and `w-full` keeps them full
 * width in the collapsed rail (where `.sidebar-brand` switches to
 * `align-items: center`) — so the layout is unchanged in both states.
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
    <Link
      href={"/hub" as Route}
      aria-label="Back to Hub"
      title="Back to Hub"
      className="flex w-full flex-col gap-3 rounded-2xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
    >
      <span className="sidebar-logo flex items-center justify-center">
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
    </Link>
  );
}
