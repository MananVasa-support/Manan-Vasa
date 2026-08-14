"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

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

      <aside
        className="relative flex h-full w-full max-w-[980px] flex-col overflow-hidden bg-surface-card shadow-2xl max-lg:max-w-full"
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface-card px-4 py-2.5">
          <span className="text-[13px] font-black text-ink-strong">Task detail</span>
          <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle max-md:hidden">
            Esc to close
          </span>
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
