"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X, Maximize2, Minimize2 } from "lucide-react";

/**
 * Right-side drawer holding the full task record.
 *
 * Mounts ONLY when a row is clicked — there is no persistent reading pane, so
 * the table keeps the full width of the page (and with it the toolbar, group-by,
 * search, pagination and every column header) until the user asks for a record.
 *
 * `children` is the SERVER-rendered detail subtree for `?task=`, passed down
 * from the page. Closing just drops the param, which unmounts it — the open
 * record therefore survives reload and works with the Back button.
 */
export function TaskDetailDrawer({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Fullscreen is STICKY across opens on purpose. It behaves like a maximized
  // window: someone who blew one task up to read it almost always wants the
  // next one the same way, and resetting to 60% on every open would make them
  // re-click it each time. The button is right there to go back.
  const [full, setFull] = React.useState(false);

  // Whatever had focus when the drawer opened — the table row, in practice.
  // Restored on close so Esc hands the keyboard back to the list instead of
  // dropping it on <body>, where the next Tab would restart from the top of
  // the page.
  const restoreFocusTo = React.useRef<HTMLElement | null>(null);

  const close = React.useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("task");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as never, {
      scroll: false,
    });
  }, [router, pathname, searchParams]);

  // Esc closes, and the page behind must not scroll while the drawer is up.
  React.useEffect(() => {
    if (!open) return;
    // Captured on OPEN, not on close: by the time the drawer is closing, focus
    // has long since moved inside it.
    restoreFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // `isConnected` guards the case where the row was removed while the
      // drawer was open (a filter change, a realtime refresh) — focusing a
      // detached node silently sends focus to <body> anyway, so skip it.
      const el = restoreFocusTo.current;
      if (el?.isConnected) el.focus();
      restoreFocusTo.current = null;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Task detail">
      {/* Scrim — click anywhere off the panel to dismiss. */}
      <button
        type="button"
        aria-label="Close task detail"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: "rgba(15, 23, 42, 0.32)" }}
      />

      {/* 60vw at rest, full width when maximized. Below lg it is always full
          width — 60% of a phone is a column too narrow to read a task in, and
          the scrim it would leave is not worth the space it costs. */}
      <aside
        className={`relative flex h-full flex-col overflow-hidden bg-surface-card shadow-2xl max-lg:w-full ${
          full ? "w-full" : "w-[60vw]"
        }`}
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface-card px-4 py-2.5">
          <span className="text-[13px] font-black text-ink-strong">Task detail</span>
          <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle max-md:hidden">
            Esc to close
          </span>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-label={full ? "Exit full screen" : "Full screen"}
            aria-pressed={full}
            title={full ? "Exit full screen" : "Full screen"}
            className="rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 max-lg:hidden"
          >
            {full ? <Minimize2 size={15} strokeWidth={2.4} /> : <Maximize2 size={15} strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
