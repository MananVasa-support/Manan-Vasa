"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Users, Plus, Pencil, Trash2, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import type { EmployeeOption } from "@/lib/queries/employees";
import type {
  IncentiveParticipantRow,
  IncentiveSplitView,
} from "@/lib/queries/incentive-participants";
import {
  getIncentiveSplit,
  addIncentiveParticipant,
  updateIncentiveParticipant,
  removeIncentiveParticipant,
} from "@/app/(app)/incentive/participant-actions";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

type Basis = "booked" | "accrued" | "paid";
const BASES: { key: Basis; label: string }[] = [
  { key: "booked", label: "Booked" },
  { key: "accrued", label: "Accrued" },
  { key: "paid", label: "Paid" },
];

/**
 * WS-4 Phase B3 — N-participant incentive split editor. A trigger button (a small
 * "Split" pill) opens a dialog that lazily loads the parent's owed caps + current
 * participant rows via `getIncentiveSplit`, then lets an admin add / edit / remove
 * rows. Every basis (booked/accrued/paid) shows a live remaining-cap meter so the
 * admin can never over-allocate; the server re-enforces Σ ≤ owed on write.
 */
export function IncentiveSplitEditor({
  parentKind,
  parentId,
  employees,
  count = 0,
}: {
  parentKind: "entry" | "project";
  parentId: string;
  employees: EmployeeOption[];
  /** Known participant count (for the trigger badge); refined on open. */
  count?: number;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Edit team split"
        onClick={() => setOpen(true)}
        className="wg-btn inline-flex items-center gap-1.5 rounded-full px-2.5 h-8 font-bold transition-colors"
        style={{
          fontSize: 12,
          color: count > 0 ? "#fff" : "var(--color-ink-soft)",
          background: count > 0 ? `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` : "transparent",
          boxShadow:
            count > 0
              ? `0 6px 16px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent)`
              : "inset 0 0 0 1px var(--color-hairline-strong)",
        }}
      >
        <Users size={13} strokeWidth={2.6} />
        {count > 0 ? `${count}-way` : "Split"}
      </button>
      {open && (
        <SplitDialog
          parentKind={parentKind}
          parentId={parentId}
          employees={employees}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SplitDialog({
  parentKind,
  parentId,
  employees,
  onClose,
}: {
  parentKind: "entry" | "project";
  parentId: string;
  employees: EmployeeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<IncentiveSplitView | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);
  const [editRow, setEditRow] = React.useState<IncentiveParticipantRow | null>(null);
  const [adding, setAdding] = React.useState(false);

  const reload = React.useCallback(async () => {
    const res = await getIncentiveSplit({ parentKind, parentId });
    if (!res.ok) {
      setLoadErr(res.error);
      return;
    }
    setView(res.view);
    setDisabled(res.killed);
    setLoadErr(null);
  }, [parentKind, parentId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  function afterMutate() {
    void reload();
    router.refresh();
    setEditRow(null);
    setAdding(false);
  }

  const remaining = React.useMemo(() => {
    if (!view) return null;
    return {
      booked: view.parent.owed.booked - view.totals.booked,
      accrued: view.parent.owed.accrued - view.totals.accrued,
      paid: view.parent.owed.paid - view.totals.paid,
    };
  }, [view]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-section bg-surface-card border border-hairline p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong mb-1 flex items-center gap-2"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21 }}
              >
                <Users size={19} strokeWidth={2.4} style={{ color: GREEN_DEEP }} />
                Team split
              </Dialog.Title>
              <Dialog.Description className="text-ink-subtle font-semibold" style={{ fontSize: 13 }}>
                {view ? view.parent.label : "Loading…"}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-ink-subtle hover:bg-surface-soft transition-colors"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          {disabled && (
            <div
              className="mt-4 flex items-center gap-2 rounded-chip px-3.5 py-2.5 font-semibold"
              style={{
                fontSize: 12.5,
                color: "var(--color-red-deep)",
                background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
              }}
            >
              <AlertTriangle size={14} strokeWidth={2.4} />
              Editing is disabled by INCENTIVE_SPLIT_OFF. This view is read-only.
            </div>
          )}

          {loadErr ? (
            <p className="mt-6 font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
              {loadErr}
            </p>
          ) : !view ? (
            <div className="mt-8 flex justify-center">
              <Loader2 size={22} className="animate-spin text-ink-subtle" />
            </div>
          ) : (
            <>
              {/* ── owed / allocated / remaining meters, per basis ── */}
              <section className="mt-5 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                {BASES.map((b) => {
                  const owed = view.parent.owed[b.key];
                  const used = view.totals[b.key];
                  const rem = remaining ? remaining[b.key] : 0;
                  const pct = owed > 0 ? Math.min(used / owed, 1) : 0;
                  const over = rem < -0.005;
                  return (
                    <div
                      key={b.key}
                      className="rounded-2xl bg-surface-card px-3.5 py-3"
                      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                          {b.label}
                        </span>
                        <span
                          className="tabular-nums font-bold"
                          style={{ fontSize: 11.5, color: over ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}
                        >
                          {over ? "over" : `${formatInr(Math.max(0, rem))} left`}
                        </span>
                      </div>
                      <div className="mt-1.5 tabular-nums font-bold text-ink-strong" style={{ fontSize: 15 }}>
                        {formatInr(used)}
                        <span className="text-ink-subtle font-semibold" style={{ fontSize: 12 }}>
                          {" "}
                          / {formatInr(owed)}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--color-hairline)" }}
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, pct * 100)}%`,
                            background: over
                              ? "var(--color-altus-red)"
                              : `linear-gradient(90deg, color-mix(in srgb, ${GREEN} 75%, #fff), ${GREEN})`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* ── participant rows ── */}
              <section
                className="mt-5 rounded-[18px] bg-surface-card overflow-hidden"
                style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                {view.participants.length === 0 ? (
                  <p className="font-semibold text-ink-subtle p-5" style={{ fontSize: 13.5 }}>
                    No participants yet. Add people to split this incentive.
                  </p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: "var(--color-surface-soft)" }}>
                        <Th>Participant</Th>
                        <Th align="right">Booked</Th>
                        <Th align="right">Accrued</Th>
                        <Th align="right">Paid</Th>
                        <Th align="right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.participants.map((p) => (
                        <tr
                          key={p.id}
                          className="border-t"
                          style={{ borderColor: "var(--color-hairline)" }}
                        >
                          <td className="px-3.5 py-2.5 whitespace-nowrap" style={{ fontSize: 13 }}>
                            <span className="flex items-center gap-2.5">
                              <EmployeeAvatar name={p.empName} size="sm" />
                              <span className="font-bold text-ink-strong">{p.empName}</span>
                            </span>
                          </td>
                          <Td align="right">{formatInr(p.bookedAmt)}</Td>
                          <Td align="right">{formatInr(p.accruedAmt)}</Td>
                          <Td align="right" tone={p.paidAmt > 0 ? "green" : undefined}>
                            {formatInr(p.paidAmt)}
                          </Td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label="Edit participant"
                                disabled={disabled}
                                onClick={() => {
                                  setAdding(false);
                                  setEditRow(p);
                                }}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong transition-colors disabled:opacity-40"
                              >
                                <Pencil size={14} strokeWidth={2.3} />
                              </button>
                              <RemoveButton id={p.id} disabled={disabled} onDone={afterMutate} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* ── add / edit form ── */}
              {!disabled &&
                (adding || editRow ? (
                  <ParticipantForm
                    key={editRow?.id ?? "new"}
                    parentKind={parentKind}
                    parentId={parentId}
                    employees={employees}
                    editing={editRow}
                    onCancel={() => {
                      setAdding(false);
                      setEditRow(null);
                    }}
                    onDone={afterMutate}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditRow(null);
                      setAdding(true);
                    }}
                    className="wg-btn mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full px-4 h-10 font-bold text-white"
                    style={{
                      fontSize: 13.5,
                      background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                      boxShadow: "0 8px 20px -10px rgba(21,128,61,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
                    }}
                  >
                    <Plus size={16} strokeWidth={2.6} />
                    Add participant
                  </button>
                ))}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RemoveButton({
  id,
  disabled,
  onDone,
}: {
  id: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      aria-label="Remove participant"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await removeIncentiveParticipant({ id });
          if (!res.ok) {
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({ message: "Participant removed." });
          onDone();
        })
      }
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-ink-subtle hover:bg-surface-soft transition-colors disabled:opacity-40"
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Trash2 size={14} strokeWidth={2.3} style={{ color: "var(--color-red-deep)" }} />
      )}
    </button>
  );
}

function ParticipantForm({
  parentKind,
  parentId,
  employees,
  editing,
  onCancel,
  onDone,
}: {
  parentKind: "entry" | "project";
  parentId: string;
  employees: EmployeeOption[];
  editing: IncentiveParticipantRow | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [empId, setEmpId] = React.useState(editing?.employeeId ?? "");
  const [empName, setEmpName] = React.useState(editing?.empName ?? "");
  const [booked, setBooked] = React.useState(editing ? String(editing.bookedAmt) : "");
  const [accrued, setAccrued] = React.useState(editing ? String(editing.accruedAmt) : "");
  const [paid, setPaid] = React.useState(editing ? String(editing.paidAmt) : "");
  const [note, setNote] = React.useState(editing?.note ?? "");

  function pickEmployee(id: string) {
    setEmpId(id);
    const e = employees.find((x) => x.id === id);
    if (e) setEmpName(e.name);
  }
  function num(s: string): number {
    const n = Number(s.replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim()) {
      fireToast({ message: "Participant name is required.", type: "error" });
      return;
    }
    const shape = {
      empName: empName.trim(),
      employeeId: empId || null,
      bookedAmt: num(booked),
      accruedAmt: num(accrued),
      paidAmt: num(paid),
      note: note.trim() || null,
    };
    start(async () => {
      const res = editing
        ? await updateIncentiveParticipant({ id: editing.id, ...shape })
        : await addIncentiveParticipant({ parentKind, parentId, ...shape });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: editing ? "Participant updated." : "Participant added." });
      onDone();
    });
  }

  const empOptions = employees.map((e) => ({ value: e.id, label: e.name }));

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-[18px] p-4 space-y-3.5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
    >
      <p className="font-bold text-ink-strong" style={{ fontSize: 13.5 }}>
        {editing ? "Edit participant" : "Add participant"}
      </p>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="From roster">
          <Select
            options={empOptions}
            value={empId}
            onValueChange={pickEmployee}
            placeholder="— Select employee —"
            ariaLabel="Participant employee"
            searchable
          />
        </Field>
        <Field label="Name" required>
          <Input value={empName} onChange={setEmpName} placeholder="Name (free text)" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Field label="Booked (₹)">
          <Input value={booked} onChange={setBooked} placeholder="0" numeric />
        </Field>
        <Field label="Accrued (₹)">
          <Input value={accrued} onChange={setAccrued} placeholder="0" numeric />
        </Field>
        <Field label="Paid (₹)">
          <Input value={paid} onChange={setPaid} placeholder="0" numeric />
        </Field>
      </div>
      <Field label="Note">
        <Input value={note} onChange={setNote} placeholder="Optional" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 font-semibold text-ink-subtle"
          style={{ fontSize: 13.5 }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="wg-btn inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 font-bold text-white disabled:opacity-50"
          style={{
            fontSize: 13.5,
            background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
            boxShadow: "0 10px 24px -12px rgba(21,128,61,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
          {pending ? "Saving…" : editing ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

/* ── small shared primitives (mirrors incentive-entries.tsx conventions) ── */

const inputClass =
  "w-full rounded-chip border border-hairline bg-surface-card px-3.5 py-2.5 text-ink-strong outline-none focus:border-altus-red focus:ring-2 focus:ring-altus-red/25 transition-all";

function Input({
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode={numeric ? "numeric" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${numeric ? "tabular-nums" : ""}`}
      style={{ fontSize: 14 }}
    />
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-semibold text-ink-strong mb-1.5" style={{ fontSize: 12.5 }}>
        {label}
        {required && <span className="text-altus-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="px-3.5 py-2 uppercase font-bold tracking-[0.05em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 10, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  tone,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  tone?: "green";
}) {
  const color = tone === "green" ? "var(--color-green-deep)" : "var(--color-ink-soft)";
  return (
    <td
      className="px-3.5 py-2.5 tabular-nums whitespace-nowrap font-semibold"
      style={{ fontSize: 13, textAlign: align, color }}
    >
      {children}
    </td>
  );
}
