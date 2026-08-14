"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { MODULE_ORDER, MODULE_THEME, moduleShortcut } from "@/lib/module-theme";
import { canAccessWorkspace, workspaceForPath } from "@/lib/workspaces";

/** How close to the bottom edge the pointer must get to summon the dock, in px.
 *  Small enough that it takes intent — you have to drive into the edge — but not
 *  so small that a fast flick overshoots between mousemove samples. */
const REVEAL_ZONE_PX = 6;

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

  // A HIDDEN DOCK, summoned from the bottom edge.
  //
  // It is not a hover menu: once revealed it STAYS revealed, and only the X puts
  // it away. Tying visibility to continued hover would mean holding the cursor
  // inside a 46px strip while reading the labels, which is exactly the fiddly
  // behaviour this replaces.
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      // Already open? Nothing to do — moving away must NOT dismiss it.
      if (visible) return;
      if (e.clientY >= window.innerHeight - REVEAL_ZONE_PX) setVisible(true);
    }
    // `mouseleave` off the bottom of the window fires when the pointer exits
    // faster than mousemove can sample the last few pixels — without it, a quick
    // flick to the edge feels unresponsive.
    function onLeave(e: MouseEvent) {
      if (!visible && e.clientY >= window.innerHeight - REVEAL_ZONE_PX) setVisible(true);
    }
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [visible]);

  // Escape closes it, matching every other dismissible overlay in the app.
  React.useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <div
      aria-label="All modules"
      role="navigation"
      // Hidden state is inert as well as invisible: `inert` drops it out of the
      // tab order and the accessibility tree, so a keyboard user never lands on
      // ten invisible links. Revealing it restores both.
      inert={!visible}
      // FLOATING GLASS DOCK, not a page footer. STICKY, not fixed — and that is
      // the whole alignment story.
      //
      // It used to be `fixed left-1/2 -translate-x-1/2`, i.e. centred on the
      // VIEWPORT. Every railed room then drew it off-centre under its content,
      // and on a narrow window it slid under the rail itself. A pixel offset
      // could not fix that: the rail is 74px collapsed, 212/228/288px expanded
      // depending on the module, and hidden below `md` — so any constant would
      // be wrong in most states.
      //
      // As a sticky, `mt-auto` element it is the last child of the page column
      // (see ChromeShell), which already begins where the rail ends. `mx-auto`
      // then centres it in the CONTENT, and it tracks the rail collapsing,
      // widening or disappearing for free, because layout does the arithmetic
      // instead of a magic number. `bottom-18px` keeps the pinned-while-scrolling
      // behaviour the fixed version had; `mt-auto` keeps it at the bottom of a
      // short page rather than floating mid-screen.
      //
      // `max-w` + the inner `overflow-x-auto` keep it from ever exceeding its
      // column: on a narrow screen the strip scrolls sideways inside its own
      // glass rather than pushing the page wider.
      //
      // `pt-4` rather than a top margin: `mt-auto` already owns margin-top, and
      // padding inside a `bottom`-anchored sticky box adds the gap above the
      // glass without moving its bottom edge. It keeps the dock off the end of
      // a long page's content even where that page sets no bottom padding of
      // its own. The padded strip inherits `pointer-events-none`, so it never
      // swallows a click meant for the content behind it.
      //
      // The wrapper KEEPS ITS LAYOUT FOOTPRINT whether or not the dock is shown.
      // That is deliberate and is what satisfies "never permanently cover page
      // content": the space is already reserved, so revealing the dock slides it
      // into a gap that exists rather than on top of a table row. Only the glass
      // itself animates.
      className="pointer-events-none sticky bottom-[18px] z-40 mx-auto mt-auto w-max max-w-[calc(100%-24px)] pt-4 print:hidden"
    >
      <nav
        className="pointer-events-auto flex items-center gap-x-0.5 overflow-x-auto rounded-[18px] px-2 py-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
        style={{
          opacity: visible ? 1 : 0,
          // Slides down past its own height plus the bottom offset, so no sliver
          // of glass is left peeking above the viewport edge.
          transform: visible ? "translateY(0)" : "translateY(calc(100% + 24px))",
          // Belt and braces with `inert`: an invisible dock must not eat a click
          // aimed at whatever sits behind it.
          pointerEvents: visible ? "auto" : "none",
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

        {/* Dismiss. Separated by a hairline so it reads as a control on the dock
            rather than an eleventh module. The dock can always be summoned again
            from the bottom edge, so this hides rather than disables anything. */}
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[rgba(15,23,42,0.12)]" />
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Hide module bar"
          title="Hide — move the pointer to the bottom edge to bring it back"
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 outline-none transition-colors hover:bg-[rgba(15,23,42,0.06)] focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.35)]"
          style={{ color: "rgba(15,23,42,0.45)" }}
        >
          <X size={14} strokeWidth={2.6} />
        </button>
      </nav>
    </div>
  );
}
