"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_ORDER, MODULE_THEME, moduleShortcut } from "@/lib/module-theme";
import { canAccessWorkspace, workspaceForPath } from "@/lib/workspaces";

/**
 * SITE-WIDE MODULE FOOTER — every room, one row, on every page.
 *
 * A second way into the ten modules that does not depend on getting back to the
 * hub first. The left rail only ever shows the room you are already inside, so
 * moving between modules meant Hub → card → module; this makes it one click from
 * wherever you are.
 *
 * SOURCE OF TRUTH is `MODULE_ORDER` + `MODULE_THEME` — the same pair the hub
 * grid renders, so a room added there appears here automatically and the label,
 * icon and destination can never disagree between the two surfaces. (Note the
 * destinations are NOT uniform: most rooms enter through `/ws/<id>`, which sets
 * the workspace cookie and forwards to that room's landing, while Billing links
 * straight to `/billing`. Taking `href` from the theme is what keeps that right.)
 *
 * ACCESS: every module is LISTED — a room you cannot enter is still worth
 * knowing exists — but one you cannot access renders as plain text rather than a
 * link, because `(app)/layout.tsx` would bounce the click to /hub and a link
 * that silently sends you somewhere else reads as a bug. This mirrors the hub's
 * locked cards. It is presentation only: the real boundary is the layout gate
 * plus each room's own checks.
 *
 * Server component by design — it needs the viewer's workspace access and
 * nothing reactive, so it ships zero JavaScript. The `access` object is passed
 * in rather than resolved here so the layout's single `accessFor(me)` call
 * covers both the route gate and this footer, instead of querying twice a page.
 */

export interface ModuleFooterProps {
  access: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean };
}

export function ModuleFooter({ access }: ModuleFooterProps) {
  const pathname = usePathname();
  const activeWs = workspaceForPath(pathname ?? "/");

  return (
    <div
      aria-label="All modules"
      role="navigation"
      // FLOATING GLASS DOCK, not a page footer. Fixed so it stays reachable
      // without scrolling to the end of a long page; `left-1/2 -translate-x-1/2`
      // centres it independently of the left rail's width, so it does not shift
      // between railed and full-bleed rooms.
      //
      // `max-w` + the inner `overflow-x-auto` keep it from ever exceeding the
      // viewport: on a narrow screen the strip scrolls sideways inside its own
      // glass rather than pushing the page wider.
      className="pointer-events-none fixed bottom-[18px] left-1/2 z-40 w-max max-w-[calc(100vw-24px)] -translate-x-1/2 print:hidden"
    >
      <nav
        className="pointer-events-auto flex items-center gap-x-0.5 overflow-x-auto rounded-[18px] px-2 py-2"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 6px 24px -8px rgba(15,23,42,0.18), 0 1px 2px rgba(15,23,42,0.06)",
          scrollbarWidth: "none",
        }}
      >
        {MODULE_ORDER.map((id, i) => {
          const m = MODULE_THEME[id];
          const allowed = canAccessWorkspace(id, access);
          const Icon = m.Icon;
          const shortcut = moduleShortcut(i);
          const active = activeWs === id;

          const inner = (
            <>
              <Icon size={15} strokeWidth={2.3} aria-hidden />
              {/* The same digit the hub badges show, so the shortcut is learnable
                  from whichever surface you happen to be looking at. Dimmer than
                  the label — a hint, not a heading — and aria-hidden so the row
                  does not read as "one W M S two Goals". */}
              {shortcut && (
                <span aria-hidden className="tabular-nums opacity-55">
                  {shortcut}
                </span>
              )}
              <span className="whitespace-nowrap">{m.label}</span>
            </>
          );

          // Locked: no link, no hover affordance, and said out loud for screen
          // readers rather than left as an unexplained dead label.
          if (!allowed) {
            return (
              <span
                key={id}
                title={`${m.label} — you don't have access to this module`}
                className="inline-flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold"
                style={{ color: "rgba(15,23,42,0.30)" }}
              >
                {inner}
                <span className="sr-only"> (no access)</span>
              </span>
            );
          }

          return (
            <Link
              key={id}
              href={m.href}
              aria-current={active ? "page" : undefined}
              // Resting state is a dark neutral so ten labels do not glare on the
              // light glass; the module's own accent appears on hover/focus, and
              // stays on for the room you are already in.
              className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
              style={{
                ["--mod-accent" as string]: m.accent,
                // ACTIVE is a tint plus the accent on the text — deliberately not
                // a filled pill, which at this size reads as a selected tab in a
                // toolbar rather than a hint of where you are.
                color: active ? m.accent : "rgba(15,23,42,0.62)",
                ...(active
                  ? { background: `color-mix(in srgb, ${m.accent} 10%, transparent)` }
                  : null),
              }}
            >
              {inner}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
