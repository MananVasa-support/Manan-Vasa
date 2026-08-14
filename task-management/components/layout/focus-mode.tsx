"use client";

import * as React from "react";
import { Minimize2 } from "lucide-react";

/**
 * FOCUS MODE — Ctrl+Q collapses the app chrome so the surface you are working on
 * fills the screen; Esc (or Ctrl+Shift+Q) restores it.
 *
 * ⚠️ WHY NOT Ctrl+W TO EXIT (Sir asked for it): Ctrl+W is the browser's
 * CLOSE-TAB shortcut and is NOT interceptable — Chrome and Edge handle it before
 * the page sees it and ignore preventDefault(), because a page that could swallow
 * Ctrl+W could trap you in a tab. Binding it would do nothing at best and close
 * the user's tab (losing unsaved work) at worst. Esc is the conventional exit
 * from any full-screen/immersive state and needs no modifier; Ctrl+Shift+Q is
 * kept as the symmetric twin of the enter key for muscle memory.
 *
 * Implementation: a `data-focus-mode` attribute on <html>, so the hiding is pure
 * CSS (globals.css) and no layout component needs to know this exists. It also
 * asks for real browser fullscreen — best-effort, since that requires a user
 * gesture and can be blocked; the chrome-collapse works either way.
 */

const ATTR = "data-focus-mode";

function setFocus(on: boolean): void {
  const el = document.documentElement;
  if (on) el.setAttribute(ATTR, "on");
  else el.removeAttribute(ATTR);
  // Real fullscreen is a bonus, never a requirement — a rejected promise here
  // must not break the chrome-collapse the user actually asked for.
  try {
    if (on && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  } catch {
    /* fullscreen unavailable — the CSS collapse still applies */
  }
}

/**
 * Mounted once, next to the other global key handling. Owns the Ctrl+Q / Esc
 * bindings and renders the small "Exit focus" affordance so the mode is never a
 * trap for someone who arrived by accident.
 */
export function FocusMode() {
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl/⌘ + Q — enter. Not browser-reserved on Windows Chrome/Edge; on
      // macOS ⌘Q quits the browser, so we accept Ctrl+Q there rather than ⌘Q.
      if (e.key.toLowerCase() === "q" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Shift+Q exits (the symmetric twin, since Ctrl+W cannot be used).
        if (e.shiftKey) {
          e.preventDefault();
          setOn(false);
          return;
        }
        e.preventDefault();
        setOn((v) => !v);
        return;
      }
      if (e.key === "Escape") setOn(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    setFocus(on);
    return () => setFocus(false);
  }, [on]);

  // Keep our state honest if the user leaves fullscreen with the browser's own
  // F11 / Esc rather than ours.
  React.useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setOn(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!on) return null;
  return (
    <button
      type="button"
      onClick={() => setOn(false)}
      className="fixed bottom-4 right-4 z-[100] inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-3 py-2 text-[12px] font-bold text-ink-soft shadow-lg transition-colors hover:text-ink-strong print:hidden"
      title="Exit focus mode (Esc)"
    >
      <Minimize2 size={14} /> Exit focus · Esc
    </button>
  );
}
