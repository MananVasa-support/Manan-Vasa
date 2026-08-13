"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MODULE_THEME, moduleForShortcut } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * NUMBER-ROW MODULE SHORTCUTS — 1–9 and 0 open the ten modules in MODULE_ORDER,
 * from ANYWHERE in the app.
 *
 * Mounted once in `(app)/layout.tsx`, beside the module footer that displays the
 * same digits. That pairing is the point: the footer teaches the number and this
 * makes it work on the page you are already on, so moving from WMS to
 * Productivity is one keystroke rather than Hub → card → module. It used to be
 * mounted only on the hub, where the digits were visible but useless the moment
 * you entered a room.
 *
 * Renders nothing — it exists only to own the key listener, so the pages that
 * mount it can stay server components. The destination is `MODULE_THEME[id].href`,
 * the same value the hub card and the footer link to, so a room whose entry route
 * changes (Billing goes straight to /billing; everything else via /ws/<id>) keeps
 * working here without a second mapping to maintain.
 *
 * `allowed` is resolved on the server and passed in, so a digit for a room you
 * cannot enter does nothing instead of bouncing you off the layout gate. That is
 * presentation parity with the locked cards and the footer's plain-text entries,
 * not the security boundary.
 *
 * NOTE it is mounted BELOW the daily-ritual gates in the layout, which return
 * early. A digit therefore cannot be used to walk out of a gate — the listener
 * does not exist while one is on screen.
 */
export function ModuleShortcuts({ allowed }: { allowed: WorkspaceId[] }) {
  const router = useRouter();

  React.useEffect(() => {
    const allow = new Set(allowed);

    function onKey(e: KeyboardEvent) {
      // Never steal a keystroke that is part of typing. `isContentEditable`
      // covers rich-text surfaces; the role check covers custom comboboxes that
      // are divs rather than <input>.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          el.isContentEditable ||
          el.closest('[contenteditable="true"],[role="textbox"],[role="combobox"],[role="searchbox"]')
        ) {
          return;
        }
      }

      // Never navigate out from under an open modal. On the hub there was
      // nothing to be inside of; app-wide there is — a dialog whose focus sits
      // on a button would otherwise let "3" throw away half-finished work
      // without so much as a confirm.
      if (document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[aria-modal="true"]')) {
        return;
      }

      const id = moduleForShortcut(e.key);
      if (!id || !allow.has(id)) return;
      e.preventDefault();
      router.push(MODULE_THEME[id].href as Route);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, allowed]);

  return null;
}
