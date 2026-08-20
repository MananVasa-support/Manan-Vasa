"use client";

/**
 * Notes & Attachments — the simplified table's two separate columns (they
 * used to be one combined "Notes & Files" cell; split so each column reads
 * as exactly what it says). Both trigger the SAME expand toggle (the full
 * Notes + Attachments editor lives in the row's expanded detail panel) —
 * clicking either column opens it.
 *
 * Uses the lightweight `listGoalAttachments` action (not the full
 * goalDetailBundle) since the Attachments cell only ever needs the file
 * gallery, not the whole detail bundle.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Eye, FileText, Paperclip } from "lucide-react";
import { listGoalAttachments, type DetailAttachment } from "@/app/(app)/goals/cascade/detail-actions";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

export interface NotesFilesCellProps {
  goalId: string;
  hasNotes: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/** Notes column — just the expand toggle, with a dot when notes exist. */
export function NotesCell({ goalId, hasNotes, expanded, onToggle }: NotesFilesCellProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-notes-toggle={goalId}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-black uppercase tracking-[0.04em] transition-colors hover:bg-altus-red hover:text-white",
        FOCUS_RING,
      )}
      style={{
        borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)",
        background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
        color: "var(--color-altus-red-deep)",
      }}
    >
      <ChevronDown size={12} strokeWidth={2.6} className={cn("transition-transform", expanded && "rotate-180")} />
      Notes
      {hasNotes && (
        <span aria-label="has notes" className="ml-0.5 inline-block size-1.5 rounded-full" style={{ background: "var(--color-altus-red)" }} />
      )}
    </button>
  );
}

/** Attachments column — the file gallery preview, visible without expanding.
 *  Capped to the first file + a "+N" overflow chip so a goal with several
 *  attachments never stretches the row's height. Hovering the chip pops up
 *  a small card listing every attached file with a one-click "View" (opens
 *  in a new tab) — no need to expand the row just to open a file. Clicking
 *  the chip itself still opens the expanded row (upload / remove live there).
 */
export function AttachmentsCell({ goalId, expanded, onToggle }: { goalId: string; expanded: boolean; onToggle: () => void }) {
  const [atts, setAtts] = React.useState<DetailAttachment[] | null>(null); // null = loading
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let live = true;
    listGoalAttachments({ id: goalId, kind: "cascade" }).then((res) => {
      if (live) setAtts(res.ok ? res.attachments : []);
    });
    return () => {
      live = false;
    };
  }, [goalId]);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = () => {
    if (!atts || atts.length === 0) return; // nothing to preview
    cancelHide();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    setPos({ left: Math.min(Math.max(12, r.left), vw - 300), top: r.bottom + 6 });
  };
  // Small delay so moving the cursor from the chip into the popover itself
  // (to click "View") doesn't slam it shut mid-move.
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPos(null), 150);
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 text-left", FOCUS_RING)}
      >
        {atts && atts.length > 0 ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
            <span
              className="inline-flex min-w-0 max-w-[160px] items-center gap-1.5 rounded-md border bg-white px-1.5 py-1"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <FileText size={12} className="shrink-0 text-ink-subtle" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink-strong" title={atts[0]!.title}>
                {atts[0]!.title}
              </span>
            </span>
            {atts.length > 1 && (
              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-altus-red-deep"
                style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" }}
              >
                +{atts.length - 1}
              </span>
            )}
          </div>
        ) : atts && atts.length === 0 ? (
          <span className="flex items-center gap-1 text-[10.5px] text-ink-subtle">
            <Paperclip size={11} /> No files
          </span>
        ) : (
          <span className="text-[10.5px] text-ink-subtle">…</span>
        )}
      </button>

      {pos &&
        atts &&
        atts.length > 0 &&
        createPortal(
          <div
            role="dialog"
            aria-label="Attached files"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              zIndex: 10000,
              width: 280,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 12,
              boxShadow: "0 14px 34px -10px rgba(15,23,42,0.35)",
              padding: 6,
            }}
          >
            <ul className="flex flex-col gap-1">
              {atts.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${a.title}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-soft",
                      !a.url && "pointer-events-none opacity-50",
                      FOCUS_RING,
                    )}
                  >
                    <FileText size={13} className="shrink-0 text-ink-subtle" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong" title={a.title}>
                      {a.title}
                    </span>
                    <Eye size={13} className="shrink-0 text-altus-red-deep" />
                  </a>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
