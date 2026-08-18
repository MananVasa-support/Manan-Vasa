"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, X, Users, Trash } from "lucide-react";
import { upsertAllocation, deleteAllocation } from "@/app/(app)/billing/actions";
import {
  ALLOCATION_PRODUCTS,
  ALLOCATION_PRODUCT_CODES,
  allocationProductLabel,
  BILL_RAISE_OPTIONS,
  BILL_RAISE_LABELS,
} from "@/db/enums";
import { formatDMonY } from "@/lib/format";
import type { AllocationRow } from "@/lib/queries/billing-allocation";
import { DateField } from "@/components/ui/date-field";

/**
 * PEOPLE ALLOCATION — who is staffed on a client, and the scope lines that work
 * is billed against.
 *
 * Client comes from the Client Address Book (passed in as options) — never a
 * free-text field, so an allocation can only ever point at a real client.
 * Team members are employee pickers over the existing roster.
 *
 * Members render as numbered slots ("Member 1, 2, 3") with a + to add more; the
 * list is ordered, and position IS the number. The lead is a separate field
 * because it is a distinct role, not member zero.
 */

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";
const TEAL = "#0F766E";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";
const noSpinner =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const inr = (v: string | null) =>
  v === null || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type ScopeDraft = {
  /** Product code. */
  scope: string;
  dueDate: string;
  actualDate: string;
  billRaise: string;
};

type Draft = {
  id?: string;
  clientId: string;
  appLeadId: string;
  appMemberIds: string[];
  handholdingLeadId: string;
  handholdingMemberIds: string[];
  notes: string;
  scopes: ScopeDraft[];
};

const blankScope = (): ScopeDraft => ({
  scope: "ps",
  dueDate: "",
  actualDate: "",
  billRaise: "",
});

// Three member slots up front, matching the reference design; + adds more.
const blank = (): Draft => ({
  clientId: "",
  appLeadId: "",
  appMemberIds: ["", "", ""],
  handholdingLeadId: "",
  handholdingMemberIds: ["", "", ""],
  notes: "",
  scopes: [blankScope()],
});

export function PeopleAllocation({
  rows,
  clients,
  employees,
}: {
  rows: AllocationRow[];
  clients: { id: string; name: string; company: string | null }[];
  employees: { id: string; name: string }[];
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function openCreate() {
    setError(null);
    setDraft(blank());
  }

  function openEdit(r: AllocationRow) {
    setError(null);
    setDraft({
      id: r.id,
      clientId: r.clientId,
      appLeadId: r.appLeadId ?? "",
      // Keep at least three slots so an existing allocation still shows the
      // reference layout rather than collapsing to whatever was filled.
      appMemberIds: [...r.appMemberIds, "", "", ""].slice(0, Math.max(3, r.appMemberIds.length)),
      handholdingLeadId: r.handholdingLeadId ?? "",
      handholdingMemberIds: [
        ...r.handholdingMemberIds,
        "",
        "",
        "",
      ].slice(0, Math.max(3, r.handholdingMemberIds.length)),
      notes: r.notes ?? "",
      scopes:
        r.scopes.length > 0
          ? r.scopes.map((s) => ({
              scope: s.scope,
              dueDate: s.dueDate ?? "",
              actualDate: s.actualDate ?? "",
              billRaise: s.billRaise ?? "",
            }))
          : [blankScope()],
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertAllocation({
        ...(draft.id ? { id: draft.id } : {}),
        clientId: draft.clientId,
        appLeadId: draft.appLeadId || null,
        // Empty slots are dropped — the form renders blanks, the record should not.
        appMemberIds: draft.appMemberIds.filter(Boolean),
        handholdingLeadId: draft.handholdingLeadId || null,
        handholdingMemberIds: draft.handholdingMemberIds.filter(Boolean),
        notes: draft.notes || null,
        scopes: draft.scopes.map((s) => ({
          scope: s.scope,
          dueDate: s.dueDate || null,
          actualDate: s.actualDate || null,
          billRaise: s.billRaise || null,
        })),
      });
      if (res.ok) setDraft(null);
      else setError(res.error);
    });
  }

  function remove(r: AllocationRow) {
    if (!confirm(`Delete the allocation for ${r.clientName}?`)) return;
    startTransition(async () => {
      const res = await deleteAllocation(r.id);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          disabled={clients.length === 0}
          title={clients.length === 0 ? "Add a client in the Address Book first" : undefined}
          className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
        >
          <Plus size={16} strokeWidth={2.6} /> New Allocation
        </button>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-[22px] bg-surface-card p-14 text-center"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <Users size={26} className="mx-auto text-ink-subtle" />
          <p className="mt-3 text-[15px] font-bold text-ink-strong">No allocations yet</p>
          <p className="mt-1 text-[13.5px] text-ink-subtle">
            Allocate an app team and a handholding team to a client, with their scope lines.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <section
              key={r.id}
              className="rounded-[22px] bg-surface-card p-6 max-md:p-4"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              aria-label={`Allocation for ${r.clientName}`}
            >
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Client Name</div>
                  <h2 className="text-[20px] font-extrabold tracking-tight text-ink-strong">{r.clientName}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    aria-label={`Edit allocation for ${r.clientName}`}
                    className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    aria-label={`Delete allocation for ${r.clientName}`}
                    className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>

              <div className="grid gap-5 md:grid-cols-2">
                <TeamPanel
                  title="App Team"
                  tone={PURPLE}
                  leadName={r.appLeadName}
                  memberNames={r.appMemberNames}
                />
                <TeamPanel
                  title="Handholding Team"
                  tone={TEAL}
                  leadName={r.handholdingLeadName}
                  memberNames={r.handholdingMemberNames}
                />
              </div>

              {r.scopes.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                  <table className="w-full min-w-[820px] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                        <th className="px-3 py-3">Product</th>
                        <th className="px-3 py-3">Start Date</th>
                        <th className="px-3 py-3">End Date</th>
                        <th className="px-3 py-3">Bill Raise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.scopes.map((s) => (
                        <tr key={s.id} className="border-t border-hairline">
                          <td className="px-3 py-3">
                            <span
                              className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
                              style={{ background: `color-mix(in srgb, ${PURPLE} 12%, transparent)`, color: PURPLE }}
                            >
                              {allocationProductLabel(s.scope)}
                            </span>
                          </td>
                          <td className="px-3 py-3 tabular-nums">{s.dueDate ? formatDMonY(s.dueDate) : "—"}</td>
                          <td className="px-3 py-3 tabular-nums">{s.actualDate ? formatDMonY(s.actualDate) : "—"}</td>
                          <td className="px-3 py-3">
                            {s.billRaise ? (
                              <span
                                className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
                                style={{ background: `color-mix(in srgb, ${TEAL} 12%, transparent)`, color: TEAL }}
                              >
                                {BILL_RAISE_LABELS[s.billRaise] ?? s.billRaise}
                              </span>
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {draft && (
        <AllocationDialog
          draft={draft}
          setDraft={setDraft}
          clients={clients}
          employees={employees}
          onSubmit={save}
          onClose={() => setDraft(null)}
          pending={pending}
          error={error}
        />
      )}
    </>
  );
}

function TeamPanel({
  title,
  tone,
  leadName,
  memberNames,
}: {
  title: string;
  tone: string;
  leadName: string | null;
  memberNames: string[];
}) {
  const total = (leadName ? 1 : 0) + memberNames.length;

  return (
    <div className="rounded-2xl p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-extrabold" style={{ color: tone }}>
          {title}
        </h3>
        <span
          className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
          style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
        >
          <Users size={11} strokeWidth={2.8} /> {total} {total === 1 ? "person" : "people"}
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Lead</dt>
          <dd className="text-[14px] font-semibold text-ink-strong">{leadName ?? <span className="font-normal text-ink-subtle">—</span>}</dd>
        </div>
        {memberNames.length === 0 ? (
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Members</dt>
            <dd className="text-[14px] text-ink-subtle">—</dd>
          </div>
        ) : (
          memberNames.map((n, i) => (
            <div key={`${n}-${i}`}>
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Member {i + 1}</dt>
              <dd className="text-[14px] font-semibold text-ink-strong">{n}</dd>
            </div>
          ))
        )}
      </dl>
    </div>
  );
}

function AllocationDialog({
  draft,
  setDraft,
  clients,
  employees,
  onSubmit,
  onClose,
  pending,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  clients: { id: string; name: string; company: string | null }[];
  employees: { id: string; name: string }[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const setMember = (team: "appMemberIds" | "handholdingMemberIds", i: number, v: string) => {
    const next = [...draft[team]];
    next[i] = v;
    setDraft({ ...draft, [team]: next });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm max-md:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="People allocation"
        className="my-8 w-full max-w-[900px] rounded-[22px] bg-surface-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink-strong">
              {draft.id ? "Edit allocation" : "New allocation"}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-subtle">Client, teams and scope lines.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="px-6 py-5">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                color: "var(--color-altus-red)",
              }}
            >
              {error}
            </p>
          )}

          {/* 1. Client — straight from the Address Book. */}
          <Field label="Client Name" required>
            <select
              className={inputCls}
              value={draft.clientId}
              onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
              required
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ""}
                </option>
              ))}
            </select>
          </Field>

          {/* 2 & 3. The two teams. */}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <TeamFields
              title="App Team"
              tone={PURPLE}
              leadLabel="App Team Lead"
              memberLabel="App Team Member"
              employees={employees}
              leadId={draft.appLeadId}
              memberIds={draft.appMemberIds}
              onLead={(v) => setDraft({ ...draft, appLeadId: v })}
              onMember={(i, v) => setMember("appMemberIds", i, v)}
              onAdd={() => setDraft({ ...draft, appMemberIds: [...draft.appMemberIds, ""] })}
              onRemove={(i) =>
                setDraft({ ...draft, appMemberIds: draft.appMemberIds.filter((_, j) => j !== i) })
              }
            />
            <TeamFields
              title="Handholding Team"
              tone={TEAL}
              leadLabel="Handholding Lead"
              memberLabel="Handholding Team Member"
              employees={employees}
              leadId={draft.handholdingLeadId}
              memberIds={draft.handholdingMemberIds}
              onLead={(v) => setDraft({ ...draft, handholdingLeadId: v })}
              onMember={(i, v) => setMember("handholdingMemberIds", i, v)}
              onAdd={() =>
                setDraft({ ...draft, handholdingMemberIds: [...draft.handholdingMemberIds, ""] })
              }
              onRemove={(i) =>
                setDraft({
                  ...draft,
                  handholdingMemberIds: draft.handholdingMemberIds.filter((_, j) => j !== i),
                })
              }
            />
          </div>

          {/* 4. Product rows — Product → Start Date → End Date → Bill Raise. */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Product</span>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, scopes: [...draft.scopes, blankScope()] })}
                className="inline-flex items-center gap-1 text-[13px] font-bold"
                style={{ color: PURPLE }}
              >
                <Plus size={13} strokeWidth={3} /> Add Product
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {draft.scopes.map((sc, i) => (
                <div
                  key={i}
                  className="grid items-end gap-2 rounded-xl p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
                  style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <MiniField label="Product">
                    <select
                      className={inputCls}
                      value={sc.scope}
                      onChange={(e) => {
                        const next = [...draft.scopes];
                        next[i] = { ...next[i]!, scope: e.target.value };
                        setDraft({ ...draft, scopes: next });
                      }}
                    >
                      {ALLOCATION_PRODUCTS.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                      {/* A line saved under the old list keeps its value rather
                          than being silently switched to another product. */}
                      {sc.scope && !ALLOCATION_PRODUCT_CODES.includes(sc.scope) && (
                        <option value={sc.scope}>{allocationProductLabel(sc.scope)} (existing)</option>
                      )}
                    </select>
                  </MiniField>
                  <MiniField label="Start Date">
                    <DateField
                      className={inputCls}
                      value={sc.dueDate}
                      onChange={(e) => {
                        const next = [...draft.scopes];
                        next[i] = { ...next[i]!, dueDate: e.target.value };
                        setDraft({ ...draft, scopes: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="End Date">
                    <DateField
                      className={inputCls}
                      value={sc.actualDate}
                      onChange={(e) => {
                        const next = [...draft.scopes];
                        next[i] = { ...next[i]!, actualDate: e.target.value };
                        setDraft({ ...draft, scopes: next });
                      }}
                    />
                  </MiniField>
                  <MiniField label="Bill Raise">
                    <select
                      className={inputCls}
                      value={sc.billRaise}
                      onChange={(e) => {
                        const next = [...draft.scopes];
                        next[i] = { ...next[i]!, billRaise: e.target.value };
                        setDraft({ ...draft, scopes: next });
                      }}
                    >
                      <option value="">—</option>
                      {BILL_RAISE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {BILL_RAISE_LABELS[o]}
                        </option>
                      ))}
                    </select>
                  </MiniField>
                  <button
                    type="button"
                    aria-label={`Remove product row ${i + 1}`}
                    disabled={draft.scopes.length === 1}
                    onClick={() => setDraft({ ...draft, scopes: draft.scopes.filter((_, j) => j !== i) })}
                    className="mb-1 rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong disabled:opacity-30"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="wg-btn rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
              style={{
                background: "var(--color-surface-card)",
                color: "var(--color-ink-soft)",
                boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !draft.clientId}
              className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
            >
              {pending ? "Saving…" : draft.id ? "Save changes" : "Create allocation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamFields({
  title,
  tone,
  leadLabel,
  memberLabel,
  employees,
  leadId,
  memberIds,
  onLead,
  onMember,
  onAdd,
  onRemove,
}: {
  title: string;
  tone: string;
  leadLabel: string;
  memberLabel: string;
  employees: { id: string; name: string }[];
  leadId: string;
  memberIds: string[];
  onLead: (v: string) => void;
  onMember: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  // Total = the lead plus every filled member slot. Shown above the lead so the
  // team's size is visible while it is being staffed, not only after saving.
  const total = (leadId ? 1 : 0) + memberIds.filter(Boolean).length;

  return (
    <div className="rounded-2xl p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-extrabold" style={{ color: tone }}>
          {title}
        </h3>
        <span
          className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
          style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
        >
          <Users size={11} strokeWidth={2.8} /> {total} {total === 1 ? "person" : "people"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <MiniField label={leadLabel}>
          <EmployeeSelect employees={employees} value={leadId} onChange={onLead} />
        </MiniField>
        {memberIds.map((id, i) => (
          <div key={i} className="flex items-end gap-1.5">
            <div className="min-w-0 flex-1">
              <MiniField label={`${memberLabel} ${i + 1}`}>
                <EmployeeSelect employees={employees} value={id} onChange={(v) => onMember(i, v)} />
              </MiniField>
            </div>
            <button
              type="button"
              aria-label={`Remove ${memberLabel} ${i + 1}`}
              onClick={() => onRemove(i)}
              className="mb-0.5 rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 self-start text-[13px] font-bold"
          style={{ color: tone }}
        >
          <Plus size={13} strokeWidth={3} /> Add member
        </button>
      </div>
    </div>
  );
}

function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— none —</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label} {required && <span style={{ color: "var(--color-altus-red)" }}>*</span>}
      </span>
      {children}
    </label>
  );
}
