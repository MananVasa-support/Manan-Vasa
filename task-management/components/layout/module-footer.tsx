import Link from "next/link";
import { MODULE_ORDER, MODULE_THEME } from "@/lib/module-theme";
import { canAccessWorkspace } from "@/lib/workspaces";

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
  return (
    <footer
      aria-label="All modules"
      className="mt-auto border-t border-hairline"
      style={{ background: "var(--color-surface-card)" }}
    >
      <nav className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-center gap-x-1 gap-y-1 px-6 py-3 max-md:px-3">
        {MODULE_ORDER.map((id) => {
          const m = MODULE_THEME[id];
          const allowed = canAccessWorkspace(id, access);
          const Icon = m.Icon;

          const inner = (
            <>
              <Icon size={15} strokeWidth={2.3} aria-hidden />
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
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-subtle opacity-45"
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
              // The accent only appears on hover/focus: ten always-coloured chips
              // would out-shout the page they sit under.
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40"
              style={{ ["--mod-accent" as string]: m.accent }}
            >
              {inner}
            </Link>
          );
        })}
      </nav>
    </footer>
  );
}
