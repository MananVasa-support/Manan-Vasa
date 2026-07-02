"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarPlus, Send } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LEAVE_KINDS, LEAVE_KIND_LABELS, type LeaveKind } from "@/db/enums";
import { requestLeave } from "@/app/(app)/attendance/leave/actions";

/** Inclusive calendar-day count between two YYYY-MM-DD strings (UTC-safe). */
function inclusiveDays(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = Date.UTC(sy!, sm! - 1, sd!);
  const e = Date.UTC(ey!, em! - 1, ed!);
  if (e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}

const INPUT_CLASS =
  "w-full rounded-xl px-3.5 py-2.5 text-[15px] text-ink-strong bg-surface-card outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_rgba(225,6,0,0.45)]";
const INPUT_RING = { boxShadow: "inset 0 0 0 1px var(--color-hairline-strong, #CBD5E1)" };

export function RequestLeaveForm({ today }: { today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<LeaveKind>("paid");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const days = inclusiveDays(startDate, endDate);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    startTransition(async () => {
      const res = await requestLeave({
        kind,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Leave request submitted.", type: "success" });
      setReason("");
      router.refresh();
    });
  }

  return (
    <section
      className="rounded-[22px] bg-surface-card p-6 max-md:p-5"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
      aria-labelledby="request-leave-heading"
    >
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{
            background: "color-mix(in srgb, #E10600 9%, transparent)",
            color: "#A80400",
          }}
        >
          <CalendarPlus size={18} strokeWidth={2.3} />
        </span>
        <h2
          id="request-leave-heading"
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 21,
            letterSpacing: "-0.02em",
          }}
        >
          Request leave
        </h2>
      </div>
      <p className="mb-5 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.55 }}>
        Calendar days are counted inclusively. Weekly-offs and holidays inside
        the range aren&apos;t auto-excluded — an admin can adjust if needed.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Type">
          <div
            className="grid grid-cols-2 gap-1 rounded-xl p-1"
            style={{
              background: "var(--color-surface-soft)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline)",
            }}
            role="group"
            aria-label="Leave type"
          >
            {LEAVE_KINDS.map((k) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(k)}
                  className="wg-btn rounded-lg px-4 py-2.5 text-[14px] font-bold transition-colors"
                  style={
                    active
                      ? {
                          background:
                            "linear-gradient(135deg, #E10600, #A80400)",
                          color: "#fff",
                          boxShadow: "0 2px 8px -3px rgba(225,6,0,0.5)",
                        }
                      : { background: "transparent", color: "var(--color-ink-soft)" }
                  }
                >
                  {LEAVE_KIND_LABELS[k]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Start date" htmlFor="leave-start">
            <input
              id="leave-start"
              required
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={`${INPUT_CLASS} tabular-nums`}
              style={INPUT_RING}
            />
          </Field>
          <Field label="End date" htmlFor="leave-end">
            <input
              id="leave-end"
              required
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${INPUT_CLASS} tabular-nums`}
              style={INPUT_RING}
            />
          </Field>
        </div>

        <Field label="Reason" hint="Optional" htmlFor="leave-reason">
          <textarea
            id="leave-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Family function"
            className={`${INPUT_CLASS} resize-y`}
            style={INPUT_RING}
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-medium"
            style={{
              background: "rgba(225,6,0,0.06)",
              color: "#A80400",
              boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.25)",
            }}
          >
            <AlertCircle size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
          <span
            className="rounded-pill px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink-soft"
            style={{
              background: "var(--color-surface-soft)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline)",
            }}
            aria-live="polite"
          >
            {days == null ? "—" : `${days} calendar day${days === 1 ? "" : "s"}`}
          </span>
          <button
            type="submit"
            disabled={pending}
            className="wg-btn inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #E10600, #A80400)",
              boxShadow: "0 4px 14px -6px rgba(225,6,0,0.55)",
            }}
          >
            <Send size={15} strokeWidth={2.4} />
            {pending ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft"
      >
        {label}
        {hint && (
          <span className="ml-2 text-[11px] font-semibold normal-case tracking-normal text-ink-subtle">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
