"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Check,
  X,
  Trash2,
  Timer,
  CalendarDays,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  logOvertime,
  approveOvertime,
  rejectOvertime,
  deleteOvertime,
} from "@/app/(app)/overtime/actions";
import type { OvertimeRow, OvertimeStatus } from "@/lib/queries/overtime";

const FIELD =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-[color:var(--color-altus-red)] focus-visible:border-[color:var(--color-altus-red)]";
const LABEL =
  "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft";

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: OvertimeStatus }) {
  const map: Record<OvertimeStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: "#FEF3C7", fg: "#92400E", label: "Pending" },
    approved: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
    rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export interface OvertimeClientProps {
  rows: OvertimeRow[];
  meId: string;
  /** People the viewer may log overtime FOR (self + downline, or everyone). */
  loggableFor: { id: string; name: string }[];
  /** Whether the viewer can approve/reject (admin or a manager with reports). */
  canReview: boolean;
  todayISO: string;
}

export function OvertimeClient({
  rows,
  meId,
  loggableFor,
  canReview,
  todayISO,
}: OvertimeClientProps) {
  const router = useRouter();

  const canPickPerson = loggableFor.length > 1;
  const [employeeId, setEmployeeId] = React.useState<string>(meId);
  const [workDate, setWorkDate] = React.useState<string>(todayISO);
  const [hours, setHours] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError("Enter hours between 0 and 24.");
      document.getElementById("ot-hours")?.focus();
      return;
    }
    setSubmitting(true);
    const res = await logOvertime({
      employeeId: employeeId !== meId ? employeeId : undefined,
      workDate,
      hours: h,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Overtime logged.", type: "success" });
    setHours("");
    setReason("");
    setWorkDate(todayISO);
    setEmployeeId(meId);
    router.refresh();
  }

  async function act(
    id: string,
    fn: (i: { id: string }) => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setBusyId(id);
    const res = await fn({ id });
    setBusyId(null);
    if (!res.ok) {
      fireToast({ message: res.error ?? "Action failed.", type: "error" });
      return;
    }
    fireToast({ message: okMsg, type: "success" });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-6 max-lg:grid-cols-1">
      {/* ── Log form ─────────────────────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5 h-fit lg:sticky lg:top-6"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            <Timer size={18} strokeWidth={2.4} />
          </span>
          <h2
            className="font-bold text-ink-strong"
            style={{ fontSize: 18, letterSpacing: "-0.01em" }}
          >
            Log overtime
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          {canPickPerson && (
            <div>
              <label htmlFor="ot-employee" className={LABEL}>
                Employee
              </label>
              <select
                id="ot-employee"
                className={FIELD}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {loggableFor.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === meId ? `${p.name} (me)` : p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="ot-date" className={LABEL}>
              Work date <span style={{ color: "var(--color-altus-red)" }}>*</span>
            </label>
            <input
              id="ot-date"
              type="date"
              required
              max={todayISO}
              className={FIELD}
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ot-hours" className={LABEL}>
              Hours <span style={{ color: "var(--color-altus-red)" }}>*</span>
            </label>
            <input
              id="ot-hours"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0.25"
              max="24"
              required
              placeholder="e.g. 2.5"
              autoFocus
              className={FIELD}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ot-reason" className={LABEL}>
              Reason
            </label>
            <textarea
              id="ot-reason"
              rows={3}
              placeholder="What was the extra work for?"
              className={FIELD + " resize-none"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[13px] font-semibold"
              style={{ background: "#FEE2E2", color: "#991B1B" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
            }}
          >
            {submitting ? (
              <Loader2 size={17} strokeWidth={2.6} className="animate-spin" />
            ) : (
              <Plus size={17} strokeWidth={2.6} />
            )}
            Log overtime
          </button>
        </div>
      </form>

      {/* ── List ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-section border border-hairline bg-surface-card overflow-hidden"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
      >
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDays
              size={28}
              strokeWidth={1.8}
              className="mx-auto mb-3 text-ink-subtle"
            />
            <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>
              No overtime logged yet.
            </p>
            <p className="mt-1 font-medium text-ink-subtle" style={{ fontSize: 14 }}>
              Use the form to log your first entry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em]">
                    Date
                  </th>
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em]">
                    Employee
                  </th>
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em] text-right">
                    Hours
                  </th>
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em]">
                    Reason
                  </th>
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em]">
                    Status
                  </th>
                  <th className="px-4 py-3 font-bold text-ink-soft text-[12px] uppercase tracking-[0.06em] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const canDelete =
                    canReview || (r.employeeId === meId && r.status === "pending");
                  const busy = busyId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-hairline last:border-0 align-top"
                    >
                      <td className="px-4 py-3 font-semibold text-ink-strong whitespace-nowrap">
                        {fmtDate(r.workDate)}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-strong whitespace-nowrap">
                        {r.employeeName}
                      </td>
                      <td className="px-4 py-3 font-bold text-ink-strong text-right tabular-nums whitespace-nowrap">
                        {r.hours.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-ink-muted max-w-[280px]">
                        {r.reason || (
                          <span className="text-ink-subtle">—</span>
                        )}
                        {r.note && (
                          <span className="mt-1 block text-[12px] font-medium text-ink-subtle">
                            Note: {r.note}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                        {r.approvedByName && (
                          <span className="mt-1 block text-[12px] text-ink-subtle">
                            by {r.approvedByName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canReview && r.status !== "approved" && (
                            <button
                              type="button"
                              title="Approve"
                              disabled={busy}
                              onClick={() =>
                                act(r.id, approveOvertime, "Overtime approved.")
                              }
                              className="grid h-8 w-8 place-items-center rounded-lg border border-hairline-strong bg-white text-[#166534] transition-colors hover:bg-[#DCFCE7] disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Check size={16} strokeWidth={2.6} />
                              )}
                            </button>
                          )}
                          {canReview && r.status !== "rejected" && (
                            <button
                              type="button"
                              title="Reject"
                              disabled={busy}
                              onClick={() =>
                                act(r.id, rejectOvertime, "Overtime rejected.")
                              }
                              className="grid h-8 w-8 place-items-center rounded-lg border border-hairline-strong bg-white text-[#991B1B] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
                            >
                              <X size={16} strokeWidth={2.6} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              title="Delete"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !confirm("Delete this overtime entry?")
                                )
                                  return;
                                act(r.id, deleteOvertime, "Overtime deleted.");
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-hairline-strong bg-white text-ink-subtle transition-colors hover:bg-surface-soft hover:text-[color:var(--color-altus-red)] disabled:opacity-50"
                            >
                              <Trash2 size={15} strokeWidth={2.2} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
