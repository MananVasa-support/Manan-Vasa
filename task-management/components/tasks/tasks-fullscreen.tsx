"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Full-screen mode for the Tasks list.
 *
 * The app chrome (left rail, mobile top bar) is rendered by the `(app)` layout,
 * far above this page, so it can't be unmounted from here. Instead the provider
 * flags `document.body` and a pair of rules in globals.css hides the chrome
 * while the flag is set — which also means the chrome comes back automatically
 * if this component ever unmounts mid-session.
 *
 * The page's own <main> is swapped to `fixed inset-0` rather than re-parented
 * into a portal, so the whole subtree — filters, KPI chips, search, the table
 * with its sticky Manage column, every dropdown and checkbox — keeps its React
 * identity and DOM position. Nothing remounts, so no state is lost and no
 * interactive behaviour needs re-wiring for the fullscreen case.
 */

interface FullscreenCtx {
  on: boolean;
  toggle: () => void;
}

const Ctx = React.createContext<FullscreenCtx | null>(null);

/** Body flag the CSS keys off. Exported so the stylesheet and this file agree. */
export const FULLSCREEN_ATTR = "data-tasks-fullscreen";

export function TasksFullscreen({
  className,
  children,
}: {
  /** Classes for the normal (non-fullscreen) <main>. */
  className: string;
  children: React.ReactNode;
}) {
  const [on, setOn] = React.useState(false);
  const toggle = React.useCallback(() => setOn((v) => !v), []);
  const value = React.useMemo(() => ({ on, toggle }), [on, toggle]);

  React.useEffect(() => {
    if (!on) return;
    document.body.setAttribute(FULLSCREEN_ATTR, "1");

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc belongs to whatever is on top. Radix (dropdowns, dialogs, popovers)
      // calls preventDefault when it consumes the key, and an open overlay is
      // still in the DOM at this point — so only fall through to exiting
      // fullscreen when nothing else claimed it.
      if (e.defaultPrevented) return;
      if (
        document.querySelector(
          '[role="dialog"],[role="menu"],[role="listbox"],[data-state="open"][aria-expanded="true"]',
        )
      ) {
        return;
      }
      setOn(false);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.removeAttribute(FULLSCREEN_ATTR);
      window.removeEventListener("keydown", onKey);
    };
  }, [on]);

  return (
    <Ctx.Provider value={value}>
      <main
        className={
          on
            ? // 100% of the viewport, above the chrome, own scroll context.
              // `wms-compact` is kept so the table's density tokens are
              // identical in both modes.
              "wms-compact fixed inset-0 z-50 h-screen w-screen overflow-auto bg-white px-7 pt-4 pb-10 max-md:px-4 max-md:pt-3"
            : className
        }
      >
        {children}
      </main>
    </Ctx.Provider>
  );
}

/**
 * The toolbar button. Renders nothing outside the provider, so it's safe to
 * drop into a header that is also used on pages without fullscreen.
 */
export function FullscreenToggleButton() {
  const ctx = React.useContext(Ctx);
  if (!ctx) return null;
  const { on, toggle } = ctx;
  const Icon = on ? Minimize2 : Maximize2;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Exit full screen" : "Enter full screen"}
      title={on ? "Exit full screen (Esc)" : "Full screen"}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors hover:bg-surface-soft shrink-0"
      style={{
        color: on ? "#ffffff" : "var(--color-altus-red-deep)",
        background: on ? "var(--color-altus-red-deep)" : undefined,
        boxShadow: on ? undefined : "inset 0 0 0 1px var(--color-hairline-strong)",
      }}
    >
      <Icon size={14} strokeWidth={2.4} />
      {on ? "Exit" : "Full screen"}
    </button>
  );
}
