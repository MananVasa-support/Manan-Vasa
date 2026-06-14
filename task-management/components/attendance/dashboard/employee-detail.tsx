"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { fetchEmployeeMonthDetail } from "@/app/(app)/attendance/dashboard/actions";
import {
  adminEditDayTimes,
  adminUpsertPunch,
  adminDeletePunch,
} from "@/app/(app)/attendance/actions";
import { fireToast } from "@/lib/toast";
import {
  ATTENDANCE_CODE_LABELS,
  PUNCH_REASONS,
  type AttendanceCode,
  type PunchReason,
} from "@/db/enums";
import type {
  DayRow,
  EmployeeMonthStatus,
} from "@/lib/queries/attendance-status";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const REASON_LABELS: Record<PunchReason, string> = {
  client_visit: "Client visit",
  wfh: "Work from home",
  forgot: "Forgot to punch",
  correction: "Correction",
};

/** "YYYY-MM-DD" → "06 · Sat" using the row's own weekday (no tz drift). */
function dayLabel(row: DayRow): string {
  const dd = row.logDate.slice(8, 10);
  return `${dd} · ${WEEKDAY_SHORT[row.weekday] ?? ""}`;
}

/** Minutes → "h:mm". */
function hmm(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const CODE_STYLE: Record<string, { bg: string; fg: string }> = {
  P: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)" },
  "H/D": { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)" },
  A: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)" },
  "W/O": { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
  incomplete: { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
};

function codeLabel(code: DayRow["code"]): string {
  if (code === "–") return "Not joined";
  return ATTENDANCE_CODE_LABELS[code as AttendanceCode] ?? code;
}

function CodePill({ code }: { code: DayRow["code"] }) {
  if (code === "–") {
    return <span className="text-ink-subtle">—</span>;
  }
  const s = CODE_STYLE[code] ?? CODE_STYLE["W/O"]!;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 font-bold whitespace-nowrap"
      style={{ fontSize: 12, background: s.bg, color: s.fg }}
    >
      {codeLabel(code)}
    </span>
  );
}

function FlagPill({ label, tone }: { label: string; tone: "red" | "amber" | "blue" }) {
  const map = {
    red: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)" },
    amber: { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)" },
    blue: { bg: "var(--color-blue-bg)", fg: "var(--color-blue-deep)" },
  } as const;
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-bold"
      style={{ fontSize: 11, background: s.bg, color: s.fg }}
    >
      {label}
    </span>
  );
}

const TIME_RE = /^\d{2}:\d{2}$/;

export function EmployeeDetailDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [data, setData] = useState<EmployeeMonthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Which day row is in edit/add mode (its logDate), or null.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    const res = await fetchEmployeeMonthDetail(employeeId, year, month);
    if (res.ok && res.data) setData(res.data);
    else setError(res.error ?? "Could not load detail.");
    setLoading(false);
  }, [employeeId, year, month]);

  useEffect(() => {
    if (!open || !employeeId) {
      setData(null);
      setError(null);
      setEditingDate(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEmployeeMonthDetail(employeeId, year, month)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) setData(res.data);
        else setError(res.error ?? "Could not load detail.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, year, month]);

  /** After any admin mutation: re-fetch the dialog detail (live code/flags)
   *  and refresh the dashboard table behind it. */
  const afterMutation = useCallback(async () => {
    setEditingDate(null);
    await load();
    router.refresh();
  }, [load, router]);

  const monthLabel = `${MONTH_LABELS[month - 1] ?? ""} ${year}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <Dialog.Title className="font-serif text-xl text-[#0F172A]">
                {employeeName}
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-[#64748B] mt-0.5">
                Daily attendance · {monthLabel} · admin can edit / backfill any day
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="size-9 inline-flex items-center justify-center rounded-full hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </Dialog.Close>
          </div>

          {loading ? (
            <p className="py-10 text-center text-[14px] text-ink-subtle font-semibold">
              Loading daily log…
            </p>
          ) : error ? (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-[14px] text-[#A80400]">
              {error}
            </div>
          ) : data ? (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--color-hairline-strong)" }}
                  >
                    <Th>Date</Th>
                    <Th>In</Th>
                    <Th>Out</Th>
                    <Th align="right">Worked</Th>
                    <Th>Code</Th>
                    <Th>Flags</Th>
                    <Th align="right">Manage</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const notJoined = d.code === "–";
                    const isEditing = editingDate === d.logDate;
                    if (isEditing && employeeId) {
                      return (
                        <EditRow
                          key={d.logDate}
                          employeeId={employeeId}
                          day={d}
                          busy={busy}
                          setBusy={setBusy}
                          onCancel={() => setEditingDate(null)}
                          onDone={afterMutation}
                        />
                      );
                    }
                    return (
                      <tr
                        key={d.logDate}
                        className="border-t"
                        style={{
                          borderColor: "var(--color-hairline)",
                          background: d.isWeeklyOff
                            ? "rgba(15,23,42,0.012)"
                            : undefined,
                          opacity: notJoined ? 0.55 : 1,
                        }}
                      >
                        <td
                          className="px-3 py-2.5 font-semibold text-ink-strong whitespace-nowrap tabular-nums"
                          style={{ fontSize: 14 }}
                        >
                          {dayLabel(d)}
                        </td>
                        <Td>{d.inAt ?? "—"}</Td>
                        <Td>{d.outAt ?? "—"}</Td>
                        <Td align="right">{hmm(d.workedMinutes)}</Td>
                        <td className="px-3 py-2.5">
                          <CodePill code={d.code} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {d.late && !d.lateWaived && (
                              <FlagPill label="Late" tone="red" />
                            )}
                            {d.lateWaived && (
                              <FlagPill label="Late · waived" tone="amber" />
                            )}
                            {d.leftEarly && (
                              <FlagPill label="Left early" tone="blue" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {!notJoined && (
                            <button
                              type="button"
                              onClick={() => setEditingDate(d.logDate)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-1.5 px-2.5 text-[12px] font-semibold text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors"
                            >
                              {d.inAt || d.outAt ? (
                                <>
                                  <Pencil size={13} strokeWidth={2.2} /> Edit
                                </>
                              ) : (
                                <>
                                  <Plus size={13} strokeWidth={2.2} /> Add
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Inline editor for one day. Handles three operations against the audited admin
 * actions: edit existing in/out times, add a missing punch with a reason, and
 * delete a punch. On success it calls onDone() which re-fetches + refreshes.
 */
function EditRow({
  employeeId,
  day,
  busy,
  setBusy,
  onCancel,
  onDone,
}: {
  employeeId: string;
  day: DayRow;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [inVal, setInVal] = useState(day.inAt ?? "");
  const [outVal, setOutVal] = useState(day.outAt ?? "");
  const [reason, setReason] = useState<PunchReason>("correction");

  const hadIn = day.inAt != null;
  const hadOut = day.outAt != null;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        fireToast({ message: okMsg });
        await onDone();
      } else {
        fireToast({ message: res.error ?? "Could not save.", type: "error" });
      }
    } catch (e) {
      fireToast({ message: (e as Error).message ?? "Could not save.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  /** Save the times. Existing punches are edited; newly-supplied punches that
   *  didn't exist before are created via upsert (carrying the reason). */
  async function save() {
    const wantIn = inVal.trim();
    const wantOut = outVal.trim();
    if (wantIn && !TIME_RE.test(wantIn)) {
      fireToast({ message: "Check-in must be HH:mm.", type: "error" });
      return;
    }
    if (wantOut && !TIME_RE.test(wantOut)) {
      fireToast({ message: "Check-out must be HH:mm.", type: "error" });
      return;
    }
    if (!wantIn && !wantOut) {
      fireToast({ message: "Enter a check-in or check-out time.", type: "error" });
      return;
    }

    // Edit side(s) that already existed.
    const editIn = hadIn && wantIn ? wantIn : undefined;
    const editOut = hadOut && wantOut ? wantOut : undefined;
    // Create side(s) that are newly supplied (no prior punch).
    const addIn = !hadIn && wantIn ? wantIn : undefined;
    const addOut = !hadOut && wantOut ? wantOut : undefined;

    await run(async () => {
      if (editIn || editOut) {
        const res = await adminEditDayTimes({
          employeeId,
          logDate: day.logDate,
          ...(editIn ? { inHHmm: editIn } : {}),
          ...(editOut ? { outHHmm: editOut } : {}),
        });
        if (!res.ok) return res;
      }
      if (addIn) {
        const res = await adminUpsertPunch({
          employeeId,
          logDate: day.logDate,
          kind: "in",
          timeHHmm: addIn,
          reason,
        });
        if (!res.ok) return res;
      }
      if (addOut) {
        const res = await adminUpsertPunch({
          employeeId,
          logDate: day.logDate,
          kind: "out",
          timeHHmm: addOut,
          reason,
        });
        if (!res.ok) return res;
      }
      return { ok: true };
    }, "Attendance updated.");
  }

  async function del(kind: "in" | "out") {
    await run(
      () => adminDeletePunch({ employeeId, logDate: day.logDate, kind }),
      kind === "in" ? "Check-in removed." : "Check-out removed.",
    );
  }

  // Reason only matters when we're adding a brand-new punch.
  const addingNew = (!hadIn && inVal.trim()) || (!hadOut && outVal.trim());

  return (
    <tr
      className="border-t"
      style={{ borderColor: "var(--color-hairline)", background: "rgba(225,6,0,0.03)" }}
    >
      <td
        className="px-3 py-3 font-semibold text-ink-strong whitespace-nowrap tabular-nums align-top"
        style={{ fontSize: 14 }}
      >
        {dayLabel(day)}
      </td>
      <td className="px-3 py-3 align-top">
        <TimeInput value={inVal} onChange={setInVal} disabled={busy} label="Check-in" />
        {hadIn && (
          <DeleteLink disabled={busy} onClick={() => del("in")} />
        )}
      </td>
      <td className="px-3 py-3 align-top">
        <TimeInput value={outVal} onChange={setOutVal} disabled={busy} label="Check-out" />
        {hadOut && (
          <DeleteLink disabled={busy} onClick={() => del("out")} />
        )}
      </td>
      <td className="px-3 py-3 align-top" colSpan={2}>
        {addingNew && (
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wide font-bold text-ink-subtle mb-1">
              Reason (new punch)
            </span>
            <select
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value as PunchReason)}
              className="rounded-md border border-hairline bg-surface-card px-2 py-1.5 text-[13px] font-semibold text-ink-strong"
            >
              {PUNCH_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
      </td>
      <td className="px-3 py-3 align-top" colSpan={2}>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-altus-red py-1.5 px-3 text-[12px] font-bold text-white disabled:opacity-60 transition-opacity"
          >
            <Check size={13} strokeWidth={2.6} /> Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-1.5 px-3 text-[12px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function TimeInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="w-[110px] rounded-md border border-hairline bg-surface-card px-2 py-1.5 text-[13px] font-semibold text-ink-strong tabular-nums disabled:opacity-60"
    />
  );
}

function DeleteLink({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-deep hover:underline disabled:opacity-60"
      style={{ color: "var(--color-red-deep)" }}
    >
      <Trash2 size={12} strokeWidth={2.2} /> Delete
    </button>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-3 pb-2.5 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-3 py-2.5 font-semibold text-ink-soft tabular-nums whitespace-nowrap"
      style={{ fontSize: 14, textAlign: align }}
    >
      {children}
    </td>
  );
}
