"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Palmtree,
  X,
  XCircle,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  type LeaveStatus,
} from "@/db/enums";
import type { LeaveRow } from "@/lib/queries/leave";
import { decideLeave, cancelLeave } from "@/app/(app)/attendance/leave/actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

const STATUS_STYLE: Record<
  LeaveStatus,
  { bg: string; fg: string; stripe: string; icon: React.ReactNode }
> = {
  pending: {
    bg: "rgba(245,158,11,0.12)",
    fg: "#B45309",
    stripe: "linear-gradient(180deg, #F59E0B, #D97706)",
    icon: <Clock3 size={12.5} strokeWidth={2.8} />,
  },
  approved: {
    bg: "rgba(22,163,74,0.12)",
    fg: "#15803D",
    stripe: "linear-gradient(180deg, #16A34A, #15803D)",
    icon: <CheckCircle2 size={12.5} strokeWidth={2.8} />,
  },
  rejected: {
    bg: "rgba(225,6,0,0.10)",
    fg: "#A80400",
    stripe: "linear-gradient(180deg, #E10600, #A80400)",
    icon: <XCircle size={12.5} strokeWidth={2.8} />,
  },
  cancelled: {
    bg: "rgba(15,23,42,0.06)",
    fg: "#64748B",
    stripe: "linear-gradient(180deg, #94A3B8, #64748B)",
    icon: <Ban size={12.5} strokeWidth={2.8} />,
  },
};

/** "12 Aug 2026" from YYYY-MM-DD (no timezone drift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

export function LeaveList({
  rows,
  mode,
}: {
  rows: LeaveRow[];
  /** "mine" → show cancel on own pending; "pending" → admin approve/reject. */
  mode: "mine" | "pending";
}) {
  if (rows.length === 0) {
    return (
      <div
        className="grid place-items-center gap-2 rounded-[22px] px-6 py-10 text-center"
        style={{
          border: "1.5px dashed var(--color-hairline)",
          background: "color-mix(in srgb, var(--color-surface-soft) 55%, transparent)",
        }}
      >
        <span
          className="inline-grid size-11 place-items-center rounded-full"
          style={{
            background:
              mode === "pending"
                ? "rgba(22,163,74,0.10)"
                : "rgba(225,6,0,0.07)",
            color: mode === "pending" ? "#15803D" : "#A80400",
          }}
        >
          {mode === "pending" ? (
            <CheckCircle2 size={22} strokeWidth={2.2} />
          ) : (
            <Palmtree size={22} strokeWidth={2.2} />
          )}
        </span>
        <p className="text-[15px] font-medium text-ink-soft">
          {mode === "pending"
            ? "All clear — no leave requests awaiting approval."
            : "No leave requests yet — your next holiday starts with the form."}
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <LeaveCard key={r.id} row={r} mode={mode} />
      ))}
    </ul>
  );
}

function LeaveCard({ row, mode }: { row: LeaveRow; mode: "mine" | "pending" }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const style = STATUS_STYLE[row.status];

  function decide(verdict: "approved" | "rejected") {
    startTransition(async () => {
      const res = await decideLeave({ id: row.id, verdict, note: note.trim() || undefined });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: verdict === "approved" ? "Leave approved." : "Leave rejected.",
        type: verdict === "approved" ? "success" : "info",
      });
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelLeave({ id: row.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Request cancelled." });
      router.refresh();
    });
  }

  const canCancelMine = mode === "mine" && row.status === "pending";
  const showAdminActions = mode === "pending" && row.status === "pending";

  return (
    <li
      className="relative overflow-hidden rounded-[18px] bg-surface-card p-5 pl-6 max-md:p-4 max-md:pl-5"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 4px 18px -14px rgba(15,23,42,0.3)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: style.stripe }}
      />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {mode === "pending" && (
            <div className="mb-2 flex items-center gap-2">
              <EmployeeAvatar name={row.employeeName} size="sm" />
              <span className="text-[14.5px] font-bold text-ink-strong">
                {row.employeeName}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 16.5,
                letterSpacing: "-0.01em",
              }}
            >
              {LEAVE_KIND_LABELS[row.kind]}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em]"
              style={{ background: style.bg, color: style.fg }}
            >
              {style.icon}
              {LEAVE_STATUS_LABELS[row.status]}
            </span>
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium tabular-nums text-ink-soft">
            <CalendarRange size={15} strokeWidth={2.3} className="shrink-0 text-ink-subtle" />
            {prettyDate(row.startDate)}
            <span className="text-ink-subtle">→</span>
            {prettyDate(row.endDate)}
            <span
              className="ml-1 rounded-pill px-2 py-0.5 text-[12px] font-bold"
              style={{
                background: "var(--color-surface-soft)",
                boxShadow: "inset 0 0 0 1px var(--color-hairline)",
              }}
            >
              {row.days} day{row.days === 1 ? "" : "s"}
            </span>
          </p>

          {row.reason && (
            <p
              className="mt-1.5 text-[13.5px] text-ink-soft"
              style={{ lineHeight: 1.5 }}
            >
              {row.reason}
            </p>
          )}

          {(row.decisionNote || (row.decidedByName && row.status !== "pending")) && (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-subtle">
              <MessageSquareText size={13.5} strokeWidth={2.3} className="mt-0.5 shrink-0" />
              <span>
                {row.decidedByName && row.status !== "pending" && (
                  <span className="font-semibold text-ink-soft">
                    {LEAVE_STATUS_LABELS[row.status]} by {row.decidedByName}
                    {row.decisionNote ? " · " : ""}
                  </span>
                )}
                {row.decisionNote}
              </span>
            </p>
          )}
        </div>

        {(canCancelMine || showAdminActions) && (
          <div className="flex flex-col items-end gap-2 max-md:w-full max-md:items-stretch">
            {showAdminActions && (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Note (optional)"
                  aria-label="Decision note (optional)"
                  className="w-48 max-md:w-full rounded-lg bg-surface-card px-3 py-2 text-[13px] text-ink-strong outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_rgba(225,6,0,0.45)]"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong, #CBD5E1)" }}
                />
                <div className="flex items-center gap-2 max-md:grid max-md:grid-cols-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("approved")}
                    className="brand-btn wg-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #16A34A, #15803D)",
                      boxShadow: "0 3px 10px -5px rgba(22,163,74,0.6)",
                    }}
                  >
                    <Check size={14} strokeWidth={3} />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("rejected")}
                    className="brand-btn wg-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold disabled:opacity-50"
                    style={{
                      background: "rgba(225,6,0,0.07)",
                      color: "#A80400",
                      boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.28)",
                    }}
                  >
                    <X size={14} strokeWidth={3} />
                    Reject
                  </button>
                </div>
              </>
            )}
            {canCancelMine && (
              <button
                type="button"
                disabled={pending}
                onClick={cancel}
                className="brand-btn wg-btn rounded-lg px-3.5 py-2 text-[13px] font-bold text-ink-soft hover:text-ink-strong disabled:opacity-50"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                Cancel request
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
