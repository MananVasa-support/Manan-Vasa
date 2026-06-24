"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import {
  USER_TASK_STATUSES,
  ADMIN_TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { STATUS_TONES_FALLBACK } from "@/lib/format";

interface Props {
  taskId: string;
  status: TaskStatus;
  updatedAt: Date;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  /** Admin can move to any value, including the legacy verdict statuses.
   *  Non-admins are limited to USER_TASK_STATUSES. */
  isAdmin: boolean;
  /** When false, the cell renders a STATIC status badge (no dropdown) — the
   *  current user isn't allowed to change this task's status. */
  editable: boolean;
}

/**
 * Click-to-edit status chip for the tasks table. Server-side action
 * `setTaskStatus` validates the transition (canTransitionTo) and the
 * optimistic-lock, so the client just needs to ship the request and
 * react to ok / error.
 */
export function InlineStatusCell({
  taskId,
  status,
  updatedAt,
  labels,
  tones,
  isAdmin,
  editable,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  // Track the optimistic value so the chip flips immediately while the
  // server confirms; rolls back on error.
  const [shown, setShown] = React.useState<TaskStatus>(status);
  React.useEffect(() => setShown(status), [status]);

  // Non-admins get the curated lifecycle list; admins see everything so
  // they can recover legacy rows or force a state.
  const options: readonly TaskStatus[] = isAdmin
    ? ADMIN_TASK_STATUSES
    : USER_TASK_STATUSES;

  // Keyboard roving-focus for the hand-rolled listbox: Radix gives no roving
  // focus to arbitrary children, so we drive a single active option ourselves
  // and focus the <ul> on open (mouse behaviour is untouched).
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Seed the active option to the currently-shown status each time the menu
  // opens, then move focus into the list so arrow keys work immediately.
  React.useEffect(() => {
    if (!open) return;
    const sel = options.indexOf(shown);
    setActiveIndex(sel >= 0 ? sel : 0);
    // Focus after the portal mounts.
    requestAnimationFrame(() => listRef.current?.focus());
  }, [open, options, shown]);

  // Keep the active option in view as it moves.
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  function listKeyDown(e: React.KeyboardEvent) {
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const next = options[activeIndex];
      if (next) void pick(next);
    }
    // Esc is handled by Radix (closes + returns focus to the trigger).
  }

  // `||` (not `??`) so an empty/blank token also falls back to the
  // canonical per-status colour — guarantees every status renders coloured.
  const tone = tones[shown] || STATUS_TONES_FALLBACK[shown];

  async function pick(next: TaskStatus) {
    setOpen(false);
    if (next === shown) return;
    const prev = shown;
    setShown(next);
    setPending(true);
    try {
      const res = await setTaskStatus(
        taskId,
        next,
        updatedAt.toISOString(),
      );
      if (!res.ok) {
        setShown(prev);
        const msg =
          res.error === "forbidden"
            ? "Not allowed to make that transition."
            : res.error === "stale"
              ? "This row was changed elsewhere — refreshing."
              : res.message ?? "Could not update status.";
        fireToast({ message: msg });
        if (res.error === "stale") router.refresh();
      } else {
        fireToast({ message: `Status set to ${labels[next]}.` });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  // Not editable by this user (not admin / not their task, or terminal status)
  // → render a STATIC coloured badge. No dropdown, no chevron, not clickable.
  if (!editable) {
    return (
      <span
        aria-label={`Status: ${labels[shown] ?? shown}`}
        className="inline-flex items-center px-3 py-1.5 rounded-pill text-[13px] font-bold tabular-nums"
        style={{
          background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
          color: `var(--color-${tone}-deep)`,
          border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
        }}
      >
        {labels[shown] ?? shown}
      </span>
    );
  }

  // Popover is rendered via Radix Portal so the menu escapes the table
  // cell's `overflow-hidden` (used for text ellipsis on long titles). The
  // earlier absolute-positioned <ul> was clipped to a sliver inside the cell.
  return (
    <Popover.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Status: ${labels[shown] ?? shown}. Click to change.`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[13px] font-bold tabular-nums transition-colors"
          style={{
            background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
            color: `var(--color-${tone}-deep)`,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
          }}
        >
          {labels[shown] ?? shown}
          {pending ? (
            <Loader2
              size={12}
              strokeWidth={2.4}
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[60] min-w-[200px] max-md:min-w-[170px] max-h-[280px] overflow-y-auto rounded-chip border bg-surface-card"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Set task status"
            tabIndex={-1}
            aria-activedescendant={`${listId}-opt-${activeIndex}`}
            onKeyDown={listKeyDown}
            className="outline-none"
          >
            {options.map((s, i) => {
              const sel = s === shown;
              const t = tones[s] || STATUS_TONES_FALLBACK[s];
              return (
                <li
                  key={s}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => {
                    e.stopPropagation();
                    void pick(s);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] cursor-pointer transition-colors"
                  style={{
                    background: sel
                      ? "var(--vp-cyan-tint)"
                      : i === activeIndex
                        ? "var(--color-surface-soft)"
                        : "transparent",
                    fontWeight: sel ? 700 : 500,
                  }}
                  onMouseEnter={(e) => {
                    setActiveIndex(i);
                    if (!sel)
                      e.currentTarget.style.background =
                        "var(--color-surface-soft)";
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full shrink-0"
                    style={{
                      background: `var(--color-${t})`,
                      // Inset ring keeps light tones (yellow, light-grey)
                      // visible on the white menu instead of a glow that
                      // washes them out.
                      boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.18)",
                    }}
                  />
                  <span
                    className="flex-1"
                    style={{ color: "var(--color-ink-strong)" }}
                  >
                    {labels[s] ?? s}
                  </span>
                  {sel && (
                    <Check
                      size={14}
                      strokeWidth={2.6}
                      style={{ color: "rgb(var(--vp-cyan-deep))" }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
