"use client";

import * as React from "react";
import { ArrowRightLeft, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import { cloneWeeklyForward } from "@/app/(app)/goals/weekly/actions";

/** Shift a yyyy-mm-dd Monday by `n` whole weeks (UTC-safe string math). */
function addWeeks(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function shortLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Carry-forward (clone) control for a single weekly goal (design §4). Verified
 * best-practice = CLONE, not move: the origin stays put; a fresh row is created
 * in the chosen target week (`carried_from_id` = origin), progress reset to 0%
 * unless "keep progress" is ticked. Offers the transcript's targets — next week,
 * +2, +4, and the previous week (W3→W1) — relative to the goal's own week.
 */
export function CarryForwardControl({
  goalId,
  weekStart,
}: {
  goalId: string;
  weekStart: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [retain, setRetain] = React.useState(false);

  const targets = [
    { label: "Next week", weeks: 1 },
    { label: "In 2 weeks", weeks: 2 },
    { label: "In 4 weeks", weeks: 4 },
    { label: "Previous week", weeks: -1 },
  ];

  function carry(weeks: number) {
    const toWeekStart = addWeeks(weekStart, weeks);
    startTransition(async () => {
      const res = await cloneWeeklyForward({ id: goalId, toWeekStart, retainProgress: retain });
      if (res.ok) {
        fireToast({ message: `Carried forward to week of ${shortLabel(toWeekStart)}.`, type: "success" });
        setOpen(false);
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="wg-btn inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted hover:border-hairline-strong hover:text-ink-strong disabled:opacity-50"
        >
          <ArrowRightLeft size={12.5} strokeWidth={2.4} />
          Carry forward
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="end">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Clone into
        </p>
        {targets.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={pending}
            onClick={() => carry(t.weeks)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            <span>{t.label}</span>
            <span className="text-[11px] text-ink-soft">{shortLabel(addWeeks(weekStart, t.weeks))}</span>
          </button>
        ))}
        <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-hairline px-2 pt-2 text-[12px] text-ink-muted">
          <button
            type="button"
            role="checkbox"
            aria-checked={retain}
            onClick={() => setRetain((v) => !v)}
            className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
              retain
                ? "border-transparent bg-[var(--goals-accent,#E10600)] text-white"
                : "border-hairline-strong bg-surface-card"
            }`}
          >
            {retain && <Check size={11} strokeWidth={3} />}
          </button>
          Keep current progress
        </label>
      </PopoverContent>
    </Popover>
  );
}
