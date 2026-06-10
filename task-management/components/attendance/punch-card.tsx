"use client";

import { useState, useTransition } from "react";
import { LogIn, LogOut } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { punchAttendance } from "@/app/(app)/attendance/actions";

/**
 * Today's check-in / check-out card. Times come pre-formatted from the
 * server (employee's own timezone) so there's no hydration drift.
 */
export function PunchCard({
  todayLabel,
  inLabel,
  outLabel,
}: {
  todayLabel: string;
  inLabel: string | null;
  outLabel: string | null;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function punch(kind: "in" | "out") {
    startTransition(async () => {
      const res = await punchAttendance({ kind, note: note.trim() || undefined });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: kind === "in" ? "Checked in — have a great day!" : "Checked out. See you tomorrow!",
      });
      setNote("");
    });
  }

  return (
    <section
      className="rounded-section bg-surface-card p-6 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-display-2xs text-ink-strong">Today</h2>
          <p className="text-[14px] text-ink-subtle mt-1">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-6">
          <Stat label="Checked in" value={inLabel} />
          <Stat label="Checked out" value={outLabel} />
        </div>
      </div>

      <div className="mt-5 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="punch-note"
            className="block text-[13px] font-semibold text-ink-soft mb-1.5"
          >
            Note / reason <span className="font-normal text-ink-subtle">(optional)</span>
          </label>
          <input
            id="punch-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="e.g. client visit in the morning"
            className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white"
          />
        </div>
        <button
          type="button"
          disabled={pending || inLabel !== null}
          onClick={() => punch("in")}
          className="inline-flex items-center gap-2 rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}
        >
          <LogIn size={16} strokeWidth={2.4} />
          {inLabel ? "Checked in" : "Check in"}
        </button>
        <button
          type="button"
          disabled={pending || outLabel !== null}
          onClick={() => punch("out")}
          className="inline-flex items-center gap-2 rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          <LogOut size={16} strokeWidth={2.4} />
          {outLabel ? "Checked out" : "Check out"}
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-right">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
      <div
        className="text-display-3xs mt-1 tabular-nums"
        style={{ color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
