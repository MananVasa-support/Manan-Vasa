"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { VasaRow } from "@/lib/queries/accounts-vasa";
import { parseAmount, formatINR, sumAmounts } from "@/lib/accounts/amounts";
import { createVasaBalance, updateVasaBalance, deleteVasaBalance } from "@/app/(app)/accounts/vasa-family-interpersonal/actions";

const INPUT = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";
const DIRECTIONS = ["Owes", "Receives"];

function Dim() { return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>; }

function ValueSelect({ label, kind, options, value, onChange, placeholder }: { label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (n: string | null) => void; placeholder?: string }) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await addAccountsLookup(kind, name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, { id: res.option.id, name: res.option.name }])); return res.ok ? { ok: true as const, option: { id: res.option.id, name: res.option.name } } : { ok: false as const, error: res.error }; }}
      onDelete={async (id) => { const res = await softDeleteAccountsLookup(id); return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error }); }} />
  );
}

type Draft = { party: string | null; direction: string | null; counterparty: string | null; amount: string; asOn: string; notes: string };
function emptyDraft(): Draft { return { party: null, direction: null, counterparty: null, amount: "", asOn: "", notes: "" }; }
function toDraft(r: VasaRow): Draft { return { party: r.party, direction: r.direction, counterparty: r.counterparty, amount: r.amount ?? "", asOn: r.asOn ?? "", notes: r.notes ?? "" }; }

function DirChip({ value }: { value: string | null }) {
  if (!value) return <Dim />;
  const receives = value.toLowerCase() === "receives";
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap" style={{ background: receives ? "color-mix(in srgb, var(--color-green) 16%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 13%, transparent)", color: receives ? "var(--color-green-deep)" : "var(--color-altus-red-deep)" }}>{value}</span>;
}

export function VasaBalances({ rows, partyOptions }: { rows: VasaRow[]; partyOptions: LookupOption[] }) {
  const [q, setQ] = React.useState("");
  const [fParty, setFParty] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const parties = React.useMemo(() => Array.from(new Set([...partyOptions.map((o) => o.name), ...rows.map((r) => r.party ?? ""), ...rows.map((r) => r.counterparty ?? "")].filter(Boolean))), [partyOptions, rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fParty && r.party !== fParty && r.counterparty !== fParty) return false;
      if (needle && ![r.party, r.counterparty, r.notes].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, fParty]);

  // Net position per party — DOUBLE-ENTRY: each "A Owes B ₹X" row moves A by −X
  // and B by +X (and vice-versa for "Receives"), so the net reflects both what a
  // party owes AND what others owe it. + = net receivable, − = net payable.
  const net = React.useMemo(() => {
    const m = new Map<string, number>();
    const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    for (const r of rows) {
      const a = parseAmount(r.amount) ?? 0;
      if (!a) continue;
      const owes = (r.direction ?? "").toLowerCase() !== "receives"; // default = Owes
      if (r.party) add(r.party, owes ? -a : a);
      if (r.counterparty) add(r.counterparty, owes ? a : -a);
    }
    return [...m.entries()].filter(([, v]) => Math.round(v) !== 0).sort((x, y) => y[1] - x[1]);
  }, [rows]);

  const hasFilters = q || fParty;
  function clearFilters() { setQ(""); setFParty(""); }
  function startAdd() { setEditingId(null); setDraft(emptyDraft()); setAdding(true); }
  function startEdit(r: VasaRow) { setAdding(false); setDraft(toDraft(r)); setEditingId(r.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function save() {
    setBusy(true);
    const payload = { ...draft };
    startTransition(async () => {
      const res = adding ? await createVasaBalance(payload) : await updateVasaBalance({ ...payload, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Entry added." : "Saved.", type: "success" });
      cancel();
    });
  }
  function remove(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteVasaBalance(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Removed.", type: "info" });
    });
  }

  const totalCols = 7;

  return (
    <section className="flex flex-col gap-4">
      {net.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {net.map(([party, v]) => (
            <span key={party} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2 text-[13px]" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
              <span className="font-bold text-ink-strong">{party}</span>
              <span className="font-bold" style={{ color: v < 0 ? "var(--color-altus-red-deep)" : "var(--color-green-deep)" }}>{v < 0 ? `owes ₹${formatINR(Math.abs(v))}` : `+₹${formatINR(v)}`}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parties, notes…" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className={CHIP} value={fParty} onChange={(e) => setFParty(e.target.value)} aria-label="Filter by party">
          <option value="">All parties</option>
          {parties.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} strokeWidth={2.4} /> Clear</button>}
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add entry
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}{hasFilters ? ` · filtered from ${rows.length}` : ""}</div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 920 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>Party</Th><Th>Direction</Th><Th>Counterparty</Th><Th className="text-right">Amount</Th><Th>As on</Th><Th>Notes</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && <EditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} partyOptions={partyOptions} onSave={save} onCancel={cancel} busy={busy} adding={adding} />}
            {filtered.length === 0 && !adding ? (
              <tr><td colSpan={totalCols} className="px-5 py-16 text-center"><p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No entries match." : "No interpersonal balances yet."}</p>{!hasFilters && <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red"><Plus size={15} strokeWidth={2.6} /> Add the first entry</button>}</td></tr>
            ) : (
              filtered.map((r) => editingId === r.id ? (
                <EditorRow key={r.id} colSpan={totalCols} draft={draft} setDraft={setDraft} partyOptions={partyOptions} onSave={save} onCancel={cancel} busy={busy} adding={false} />
              ) : (
                <tr key={r.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td className="font-bold text-ink-strong whitespace-nowrap">{r.party || <Dim />}</Td>
                  <Td><DirChip value={r.direction} /></Td>
                  <Td className="whitespace-nowrap font-semibold text-ink-soft">{r.counterparty || <Dim />}</Td>
                  <Td className="text-right font-bold text-ink-strong whitespace-nowrap">{parseAmount(r.amount) !== null ? `₹${formatINR(parseAmount(r.amount))}` : <Dim />}</Td>
                  <Td className="whitespace-nowrap text-[13px]">{r.asOn || <Dim />}</Td>
                  <Td>{r.notes ? <p className="max-w-[280px] whitespace-pre-wrap break-words text-[13px] text-ink-soft" title={r.notes}>{r.notes}</p> : <Dim />}</Td>
                  <Td className="text-right"><RowActions onEdit={() => startEdit(r)} onDelete={() => remove(r.id)} busy={busy} /></Td>
                </tr>
              ))
            )}
            {filtered.length > 0 && (
              <tr style={{ borderTop: "2px solid var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}>
                <Td className="font-bold uppercase text-[12px] tracking-[0.08em] text-ink-soft">Total</Td><Td>{""}</Td><Td>{""}</Td>
                <Td className="text-right font-extrabold text-ink-strong whitespace-nowrap">₹{formatINR(sumAmounts(filtered.map((r) => parseAmount(r.amount))))}</Td>
                <Td>{""}</Td><Td>{""}</Td><Td>{""}</Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-4 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}
function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [c, setC] = React.useState(false);
  React.useEffect(() => { if (!c) return; const t = setTimeout(() => setC(false), 3500); return () => clearTimeout(t); }, [c]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50"><Pencil size={15} strokeWidth={2.2} /></button>
      {c ? <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm</button>
        : <button type="button" onClick={() => setC(true)} disabled={busy} aria-label="Delete" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50"><Trash2 size={15} strokeWidth={2.2} /></button>}
    </div>
  );
}
function EditorRow({ colSpan, draft, setDraft, partyOptions, onSave, onCancel, busy, adding }: { colSpan: number; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; partyOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-md:grid-cols-2">
          <Field label="Party" className="col-span-3 max-md:col-span-1"><ValueSelect label="party" kind="vasa_party" options={partyOptions} value={draft.party} onChange={(v) => set({ party: v })} placeholder="Party…" /></Field>
          <Field label="Direction" className="col-span-2 max-md:col-span-1">
            <select value={draft.direction ?? ""} onChange={(e) => set({ direction: e.target.value || null })} className={INPUT} aria-label="Direction"><option value="">—</option>{DIRECTIONS.map((d) => (<option key={d} value={d}>{d}</option>))}</select>
          </Field>
          <Field label="Counterparty" className="col-span-3 max-md:col-span-1"><ValueSelect label="counterparty" kind="vasa_party" options={partyOptions} value={draft.counterparty} onChange={(v) => set({ counterparty: v })} placeholder="Counterparty…" /></Field>
          <Field label="Amount (₹)" className="col-span-2 max-md:col-span-1"><input value={draft.amount} onChange={(e) => set({ amount: e.target.value })} className={INPUT} inputMode="numeric" placeholder="100000" aria-label="Amount" autoFocus /></Field>
          <Field label="As on" className="col-span-2 max-md:col-span-1"><input value={draft.asOn} onChange={(e) => set({ asOn: e.target.value })} className={INPUT} placeholder="dd/mm/yy" aria-label="As on" /></Field>
          <Field label="Notes" className="col-span-12 max-md:col-span-2"><textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT + " min-h-[52px] resize-y"} placeholder="Notes" aria-label="Notes" /></Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50"><X size={16} strokeWidth={2.4} /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add entry" : "Save changes"}</button>
        </div>
      </td>
    </tr>
  );
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={"flex flex-col gap-1.5 " + (className ?? "")}><span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>{children}</label>;
}
