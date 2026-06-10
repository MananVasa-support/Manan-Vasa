"use client";

import { useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  addOutstandingFollowup,
  createOutstandingEntry,
  deleteOutstandingEntry,
  setOutstandingWriteOff,
} from "@/app/(app)/outstanding/actions";
import {
  OUTSTANDING_STATUS_LABELS,
  type OutstandingStatus,
} from "@/db/enums";
import type { OutstandingEntryRow } from "@/lib/queries/outstanding";
import { formatDate, formatInr } from "@/lib/format";

const STATUS_STYLE: Record<OutstandingStatus, { bg: string; fg: string }> = {
  open:        { bg: "rgba(37,99,235,0.10)",  fg: "#1D4ED8" },
  partial:     { bg: "rgba(245,158,11,0.12)", fg: "#B45309" },
  paid:        { bg: "rgba(22,163,74,0.12)",  fg: "#15803D" },
  written_off: { bg: "rgba(100,116,139,0.12)", fg: "#475569" },
};

const inputClass =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

/** "2026-06-10" → "10 Jun 2026" without timezone drift. */
function formatDateStr(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return formatDate(new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12)));
}

function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

export function OutstandingWorkspace({
  rows,
  employees,
  isAdmin,
}: {
  rows: OutstandingEntryRow[];
  employees: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const today = todayStr();
  const totals = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let collected = 0;
    for (const r of rows) {
      collected += r.amountReceived;
      if (r.status === "open" || r.status === "partial") {
        outstanding += r.balance;
        if (r.dueDate && r.dueDate < today) overdue += r.balance;
      }
    }
    return { outstanding, overdue, collected };
  }, [rows, today]);

  return (
    <div>
      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-3 mb-6">
        <SummaryCard label="Outstanding" value={formatInr(totals.outstanding)} tone="#1D4ED8" />
        <SummaryCard label="Overdue" value={formatInr(totals.overdue)} tone="#A80400" />
        <SummaryCard label="Collected" value={formatInr(totals.collected)} tone="#15803D" />
      </div>

      {rows.length === 0 ? (
        <p className="text-[15px] text-ink-subtle">
          No receivables on the tracker yet
          {isAdmin ? " — add the first one with “New entry”." : "."}
        </p>
      ) : (
        <section
          className="rounded-section bg-surface-card overflow-x-auto"
          style={{
            border: "1px solid var(--color-hairline)",
            boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
          }}
        >
          <table className="w-full text-[14px] min-w-[760px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-subtle">
                <th className="py-3 pl-5 pr-3 font-semibold">Client</th>
                <th className="py-3 pr-3 font-semibold text-right">Amount</th>
                <th className="py-3 pr-3 font-semibold text-right">Balance</th>
                <th className="py-3 pr-3 font-semibold">Due</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-3 font-semibold">Owner</th>
                <th className="py-3 pr-5 font-semibold text-right">Follow-ups</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <EntryRow
                  key={r.id}
                  row={r}
                  isAdmin={isAdmin}
                  overdue={
                    Boolean(r.dueDate && r.dueDate < today) &&
                    (r.status === "open" || r.status === "partial")
                  }
                />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="rounded-section bg-surface-card p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
      <div className="text-display-xs mt-1.5 tabular-nums" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function EntryRow({
  row,
  isAdmin,
  overdue,
}: {
  row: OutstandingEntryRow;
  isAdmin: boolean;
  overdue: boolean;
}) {
  const style = STATUS_STYLE[row.status];
  return (
    <EntryDetailDialog row={row} isAdmin={isAdmin}>
      <tr
        className="border-t cursor-pointer hover:bg-surface-soft"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        <td className="py-3 pl-5 pr-3">
          <div className="font-semibold text-ink-strong">{row.client}</div>
          {row.particulars && (
            <div className="text-[13px] text-ink-subtle mt-0.5 max-w-[260px] truncate">
              {row.particulars}
            </div>
          )}
        </td>
        <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
          {formatInr(row.amount)}
        </td>
        <td className="py-3 pr-3 text-right tabular-nums font-semibold text-ink-strong">
          {formatInr(row.balance)}
        </td>
        <td className="py-3 pr-3 whitespace-nowrap">
          {row.dueDate ? (
            <span style={{ color: overdue ? "#A80400" : "var(--color-ink-soft)" }}>
              {formatDateStr(row.dueDate)}
              {overdue && <span className="ml-1.5 font-bold text-[12px]">overdue</span>}
            </span>
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </td>
        <td className="py-3 pr-3">
          <span
            className="rounded-pill px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap"
            style={{ background: style.bg, color: style.fg }}
          >
            {OUTSTANDING_STATUS_LABELS[row.status]}
          </span>
        </td>
        <td className="py-3 pr-3 text-ink-soft whitespace-nowrap">
          {row.ownerName ?? "—"}
        </td>
        <td className="py-3 pr-5 text-right tabular-nums text-ink-soft">
          {row.followups.length}
        </td>
      </tr>
    </EntryDetailDialog>
  );
}

/** Detail dialog — follow-up log + add-follow-up form + admin verdicts. */
function EntryDetailDialog({
  row,
  isAdmin,
  children,
}: {
  row: OutstandingEntryRow;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitFollowup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = received.trim() === "" ? undefined : Number(received);
    if (amt !== undefined && (!Number.isFinite(amt) || amt <= 0)) {
      setError("Received amount must be a positive number.");
      return;
    }
    startTransition(async () => {
      const res = await addOutstandingFollowup({
        entryId: row.id,
        note: note.trim(),
        promisedDate: promisedDate || undefined,
        amountReceived: amt,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: amt ? `Payment of ${formatInr(amt)} recorded.` : "Follow-up logged." });
      setNote("");
      setPromisedDate("");
      setReceived("");
    });
  }

  function adminAction(kind: "write_off" | "reopen" | "delete") {
    startTransition(async () => {
      const res =
        kind === "delete"
          ? await deleteOutstandingEntry(row.id)
          : await setOutstandingWriteOff({ entryId: row.id, action: kind });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message:
          kind === "delete"
            ? "Entry deleted."
            : kind === "write_off"
              ? "Entry written off."
              : "Entry reopened.",
        type: "info",
      });
      if (kind === "delete") setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-xl rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A]">
            {row.client}
          </Dialog.Title>
          <Dialog.Description className="text-[14.5px] text-[#64748B] mt-1 mb-4">
            {formatInr(row.amount)} billed · {formatInr(row.amountReceived)} received ·{" "}
            <strong style={{ color: "#0F172A" }}>{formatInr(row.balance)} pending</strong>
            {row.dueDate && ` · due ${formatDateStr(row.dueDate)}`}
            {row.particulars && (
              <>
                <br />
                {row.particulars}
              </>
            )}
          </Dialog.Description>

          <form
            onSubmit={submitFollowup}
            className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3"
          >
            <div className="text-[13px] font-bold uppercase tracking-wide text-[#64748B]">
              Log a follow-up
            </div>
            <textarea
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Spoke to accounts — cheque promised next week…"
              className={inputClass}
            />
            <div className="flex gap-3 max-md:flex-col">
              <label className="flex-1 text-[13px] font-semibold text-[#334155]">
                Promised date
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className={`${inputClass} mt-1 font-normal`}
                />
              </label>
              <label className="flex-1 text-[13px] font-semibold text-[#334155]">
                Amount received (₹)
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="leave blank if none"
                  className={`${inputClass} mt-1 font-normal`}
                />
              </label>
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pending || !note.trim()}
                className="rounded-md py-2 px-4 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Add follow-up"}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <div className="text-[13px] font-bold uppercase tracking-wide text-[#64748B] mb-2">
              Follow-up history
            </div>
            {row.followups.length === 0 ? (
              <p className="text-[14px] text-[#94A3B8]">No follow-ups yet.</p>
            ) : (
              <ul className="space-y-3">
                {row.followups.map((f) => (
                  <li key={f.id} className="border-l-2 pl-3" style={{ borderColor: "#E2E8F0" }}>
                    <div className="text-[14.5px] text-[#0F172A]">{f.note}</div>
                    <div className="text-[12.5px] text-[#94A3B8] mt-0.5">
                      {f.actorName} · {formatDate(f.createdAt)}
                      {f.promisedDate && ` · promised ${formatDateStr(f.promisedDate)}`}
                      {f.amountReceived !== null && (
                        <span style={{ color: "#15803D", fontWeight: 600 }}>
                          {" "}
                          · received {formatInr(f.amountReceived)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isAdmin && (
            <div
              className="mt-5 pt-4 border-t flex items-center justify-between gap-2 flex-wrap"
              style={{ borderColor: "#E2E8F0" }}
            >
              <div className="flex gap-2">
                {row.status === "written_off" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => adminAction("reopen")}
                    className="rounded-md px-3.5 py-2 text-[13px] font-semibold border border-[#CBD5E1] text-[#334155] disabled:opacity-50"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => adminAction("write_off")}
                    className="rounded-md px-3.5 py-2 text-[13px] font-semibold border border-[#CBD5E1] text-[#334155] disabled:opacity-50"
                  >
                    Write off
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete the ${row.client} entry and its follow-ups?`)) {
                      adminAction("delete");
                    }
                  }}
                  className="rounded-md px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
                  style={{
                    background: "rgba(225,6,0,0.08)",
                    color: "#A80400",
                    border: "1px solid rgba(225,6,0,0.25)",
                  }}
                >
                  Delete
                </button>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="px-3 py-2 text-[13.5px] font-medium text-[#64748B]">
                  Close
                </button>
              </Dialog.Close>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Admin "+ New entry" dialog. */
export function NewEntryDialog({
  employees,
  clients,
}: {
  employees: { id: string; name: string }[];
  clients: string[];
}) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState("");
  const [particulars, setParticulars] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setClient("");
    setParticulars("");
    setAmount("");
    setDueDate("");
    setOwnerId("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    startTransition(async () => {
      const res = await createOutstandingEntry({
        client: client.trim(),
        particulars: particulars.trim() || undefined,
        amount: amt,
        dueDate: dueDate || undefined,
        ownerId: ownerId || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${client.trim()} added to the tracker.` });
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          + New entry
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New outstanding entry
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            A receivable to chase — the team logs follow-ups and payments
            against it.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Client" required>
              <input
                required
                autoFocus
                value={client}
                onChange={(e) => setClient(e.target.value)}
                maxLength={200}
                list="outstanding-clients"
                placeholder="Client name"
                className={inputClass}
              />
              <datalist id="outstanding-clients">
                {clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Particulars / invoice no">
              <input
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
                maxLength={500}
                placeholder="e.g. INV-2041 — May retainer"
                className={inputClass}
              />
            </Field>
            <div className="flex gap-3 max-md:flex-col">
              <Field label="Amount (₹)" required className="flex-1">
                <input
                  required
                  type="number"
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="125000"
                  className={inputClass}
                />
              </Field>
              <Field label="Due date" className="flex-1">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Owner (who chases this)">
              <Select
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                value={ownerId}
                onValueChange={setOwnerId}
                placeholder="— Unassigned —"
                ariaLabel="Owner"
              />
            </Field>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Adding…" : "Add entry"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
