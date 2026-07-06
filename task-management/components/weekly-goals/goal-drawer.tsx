"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A focused right-side drawer for the Weekly Goals board — editing and reviewing
 * a goal each open one instead of expanding the card inline (which used to bury
 * the list under tall forms). Slides in from the right on desktop; becomes a
 * bottom sheet on phones. Keyboard-first: focus is trapped, Esc closes, the first
 * focusable field is auto-focused, and the backdrop click closes.
 */
export function WeeklyGoalDrawer({
  open,
  onClose,
  title,
  eyebrow,
  accent = "var(--color-altus-red)",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  /** Left keyline + eyebrow tint — lets Review read differently from Edit. */
  accent?: string;
  /** Sticky footer (Save / Cancel, Approve, …). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Lock body scroll + auto-focus the first field + Esc-to-close while open.
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
      );
      el?.focus();
    }, 60);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 max-md:items-end max-md:p-0"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.44)] backdrop-blur-[2px] wg-fade-in"
      />

      {/* Centered modal panel (bottom sheet on phones) */}
      <div
        ref={panelRef}
        className="relative flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl wg-modal-in max-md:max-h-[92vh] max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-2xl"
        style={{
          background: "var(--color-surface-card)",
          boxShadow: "0 32px 90px -24px rgba(15,23,42,0.55)",
          border: "1px solid var(--color-hairline)",
        }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />

        {/* Header */}
        <div
          className="flex shrink-0 items-center gap-3 px-6 py-4 max-md:px-5"
          style={{ borderBottom: "1px solid var(--color-hairline)" }}
        >
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>
                {eyebrow}
              </p>
            )}
            <h2 className="truncate text-[18px] font-black tracking-[-0.01em]" style={{ color: "var(--color-ink-strong)" }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--color-surface-soft)] hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-5">{children}</div>

        {/* Sticky footer */}
        {footer && (
          <div
            className="shrink-0 px-6 py-4 max-md:px-5"
            style={{ borderTop: "1px solid var(--color-hairline)", background: "var(--color-surface-soft)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
