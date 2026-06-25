"use client";

import * as React from "react";
import { Plus, Search, X, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { CcCardRow, CcMonthRow } from "@/lib/queries/accounts-cc";
import { CC_YESNO, CC_TALLY, CC_BALANCE, ccMonthKey, ccTone, MONTH_LABELS } from "@/lib/accounts/cc";
import { createCcCard, updateCcCard, deleteCcCard, saveCcMonth } from "@/app/(app)/accounts/cc-tracker/actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";
const CELL_INPUT =
  "w-full rounded-lg border border-hairline bg-white px-2 py-1.5 text-[12.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)]";

type MonthRec = {
  hardCopy: string; googleDrive: string; tallyEntry: string; balanceTally: string;
  ccPaidDate: string; ccPaidAmt: string; intFinChgs: string; chgReversed: string; notes: string;
};
function emptyRec(): MonthRec {
  return { hardCopy: "", googleDrive: "", tallyEntry: "", balanceTally: "", ccPaidDate: "", ccPaidAmt: "", intFinChgs: "", chgReversed: "", notes: "" };
}
function recFrom(m: CcMonthRow): MonthRec {
  return {
    hardCopy: m.hardCopy ?? "", googleDrive: m.googleDrive ?? "", tallyEntry: m.tallyEntry ?? "",
    balanceTally: m.balanceTally ?? "", ccPaidDate: m.ccPaidDate ?? "", ccPaidAmt: m.ccPaidAmt ?? "",
    intFinChgs: m.intFinChgs ?? "", chgReversed: m.chgReversed ?? "", notes: m.notes ?? "",
  };
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

function lookupAdd(kind: string) {
  return async (name: string) => {
    const res = await addAccountsLookup(kind, name);
    return res.ok ? ({ ok: true as const, option: { id: res.option.id, name: res.option.name } }) : ({ ok: false as const, error: res.error });
  };
}
function lookupDelete() {
  return async (id: string) => {
    const res = await softDeleteAccountsLookup(id);
    return res.ok ? ({ ok: true as const }) : ({ ok: false as const, error: res.error });
  };
}
function ValueSelect({ label, kind, options, value, onChange, placeholder }: {
  label: string; kind: string; options: LookupOption[]; value: string | null; onChange: (name: string | null) => void; placeholder?: string;
}) {
  const [opts, setOpts] = React.useState(options);
  React.useEffect(() => { setOpts((prev) => { const extra = prev.filter((p) => !options.some((o) => o.id === p.id)); return [...options, ...extra]; }); }, [options]);
  const selectedId = opts.find((o) => o.name.toLowerCase() === (value ?? "").toLowerCase())?.id ?? null;
  return (
    <LookupSelect label={label} value={selectedId} options={opts} placeholder={placeholder} className={INPUT}
      onChange={(id) => onChange(id ? (opts.find((o) => o.id === id)?.name ?? null) : null)}
      onAdd={async (name) => { const res = await lookupAdd(kind)(name); if (res.ok) setOpts((p) => (p.some((o) => o.id === res.option.id) ? p : [...p, res.option])); return res; }}
      onDelete={lookupDelete()} />
  );
}

/** Small select used inside the monthly cells. */
function CellSelect({ value, options, onChange, busy }: { value: string; options: readonly string[]; onChange: (v: string) => void; busy: boolean }) {
  const t = ccTone(value);
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Status"
      className="w-full cursor-pointer appearance-none rounded-lg px-2 py-1.5 text-center text-[12px] font-bold outline-none transition-colors focus:ring-2 focus:ring-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{ background: t?.bg ?? "transparent", color: t?.fg ?? "var(--color-ink-subtle)", border: `1px solid ${value ? "transparent" : "var(--color-hairline)"}`, minWidth: 70 }}
    >
      <option value="">—</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}

type CardDraft = {
  code: string; entityName: string | null; cardName: string; ecs: string | null; ecsFrom: string | null;
  stmtPeriod: string; stmtStartDay: string; dueDay: string; softCopyAutoEmail: string | null;
};
function emptyCard(): CardDraft {
  return { code: "", entityName: null, cardName: "", ecs: null, ecsFrom: null, stmtPeriod: "", stmtStartDay: "", dueDay: "", softCopyAutoEmail: null };
}
function toCardDraft(r: CcCardRow): CardDraft {
  return {
    code: r.code ?? "", entityName: r.entityName, cardName: r.cardName, ecs: r.ecs, ecsFrom: r.ecsFrom,
    stmtPeriod: r.stmtPeriod ?? "", stmtStartDay: r.stmtStartDay ?? "", dueDay: r.dueDay ?? "", softCopyAutoEmail: r.softCopyAutoEmail,
  };
}

export function CcMaster({
  fyStartYear, month, cards, months, entityOptions,
}: {
  fyStartYear: number; month: number; cards: CcCardRow[]; months: CcMonthRow[]; entityOptions: LookupOption[];
}) {
  // Month records for the *selected* month, keyed by cardId.
  const [recs, setRecs] = React.useState<Record<string, MonthRec>>({});
  React.useEffect(() => {
    const m: Record<string, MonthRec> = {};
    for (const row of months) if (row.month === month) m[row.cardId] = recFrom(row);
    setRecs(m);
  }, [months, month]);

  const [q, setQ] = React.useState("");
  const [fEntity, setFEntity] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<CardDraft>(emptyCard);
  const [busy, setBusy] = React.useState(false);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const entities = React.useMemo(
    () => Array.from(new Set([...entityOptions.map((o) => o.name), ...cards.map((c) => c.entityName ?? "")].filter(Boolean))),
    [entityOptions, cards],
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (fEntity && (c.entityName ?? "") !== fEntity) return false;
      if (needle) {
        const hay = [c.code, c.entityName, c.cardName, c.ecsFrom, c.stmtPeriod].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [cards, q, fEntity]);

  const hasFilters = q || fEntity;
  function clearFilters() { setQ(""); setFEntity(""); }
  function startAdd() { setEditingId(null); setDraft(emptyCard()); setAdding(true); }
  function startEdit(c: CcCardRow) { setAdding(false); setDraft(toCardDraft(c)); setEditingId(c.id); }
  function cancel() { setAdding(false); setEditingId(null); }

  function saveCard() {
    const cardName = draft.cardName.trim();
    if (!cardName) { fireToast({ message: "A card name is required.", type: "error" }); return; }
    setBusy(true);
    const base = { ...draft, cardName };
    startTransition(async () => {
      const res = adding
        ? await createCcCard({ ...base, fyStartYear })
        : await updateCcCard({ ...base, id: editingId });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: adding ? "Card added." : "Card saved.", type: "success" });
      cancel();
    });
  }

  function removeCard(id: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await deleteCcCard(id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Card removed.", type: "info" });
    });
  }

  function commit(cardId: string, next: MonthRec) {
    setRowBusy(cardId);
    startTransition(async () => {
      const res = await saveCcMonth({ cardId, month, ...next });
      setRowBusy(null);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }
  /** Update one field locally and persist the whole record. */
  function setField(cardId: string, field: keyof MonthRec, value: string, persist: boolean) {
    setRecs((prev) => {
      const cur = prev[cardId] ?? emptyRec();
      const next = { ...cur, [field]: value };
      const out = { ...prev, [cardId]: next };
      if (persist) commit(cardId, next);
      return out;
    });
  }

  const totalCols = 11;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards, entity…" className="w-full bg-transparent py-2.5 text-[15px] font-medium text-ink-strong outline-none placeholder:font-normal placeholder:text-ink-subtle" />
        </div>
        <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" value={fEntity} onChange={(e) => setFEntity(e.target.value)} aria-label="Filter by entity">
          <option value="">All entities</option>
          {entities.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
        <span className="text-[13px] font-bold text-ink-soft">Editing: <span className="text-altus-red">{MONTH_LABELS[month - 1]}</span></span>
        <button type="button" onClick={startAdd} className="ml-auto inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 10px 26px -12px rgba(225,6,0,0.6)" }}>
          <Plus size={16} strokeWidth={2.6} /> Add card
        </button>
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "card" : "cards"}{hasFilters ? ` · filtered from ${cards.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1320 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th>Card</Th><Th>Hard copy</Th><Th>G-Drive</Th><Th>Tally</Th><Th>Balance</Th>
              <Th>Paid date</Th><Th>Paid amt</Th><Th>Int+Fin</Th><Th>Chg rev?</Th><Th>Notes</Th><Th className="text-right">{""}</Th>
            </tr>
          </thead>
          <tbody>
            {(adding || (editingId && filtered.every((r) => r.id !== editingId))) && (
              <CardEditorRow colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={saveCard} onCancel={cancel} busy={busy} adding={adding} />
            )}
            {filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={totalCols} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">{hasFilters ? "No cards match these filters." : "No cards for this financial year yet."}</p>
                  {!hasFilters && (
                    <button type="button" onClick={startAdd} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the first card
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                if (editingId === c.id) {
                  return <CardEditorRow key={c.id} colSpan={totalCols} draft={draft} setDraft={setDraft} entityOptions={entityOptions} onSave={saveCard} onCancel={cancel} busy={busy} adding={false} />;
                }
                const rec = recs[c.id] ?? emptyRec();
                const rb = rowBusy === c.id;
                return (
                  <tr key={c.id} className="group transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                    <Td>
                      <div className="min-w-[200px] max-w-[280px]">
                        <div className="flex items-center gap-2">
                          {c.code && <span className="text-[11px] font-bold text-ink-subtle">#{c.code}</span>}
                          <span className="font-bold text-ink-strong">{c.cardName}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
                          {[c.entityName, c.ecs && `ECS: ${c.ecs}`, c.stmtPeriod, c.dueDay && `Due ${c.dueDay}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </Td>
                    <CellTd><CellSelect value={rec.hardCopy} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "hardCopy", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.googleDrive} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "googleDrive", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.tallyEntry} options={CC_TALLY} busy={rb} onChange={(v) => setField(c.id, "tallyEntry", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.balanceTally} options={CC_BALANCE} busy={rb} onChange={(v) => setField(c.id, "balanceTally", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidDate} busy={rb} placeholder="date" onChange={(v) => setField(c.id, "ccPaidDate", v, false)} onCommit={(v) => setField(c.id, "ccPaidDate", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.ccPaidAmt} busy={rb} placeholder="₹" onChange={(v) => setField(c.id, "ccPaidAmt", v, false)} onCommit={(v) => setField(c.id, "ccPaidAmt", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.intFinChgs} busy={rb} placeholder="0" onChange={(v) => setField(c.id, "intFinChgs", v, false)} onCommit={(v) => setField(c.id, "intFinChgs", v, true)} /></CellTd>
                    <CellTd><CellSelect value={rec.chgReversed} options={CC_YESNO} busy={rb} onChange={(v) => setField(c.id, "chgReversed", v, true)} /></CellTd>
                    <CellTd><CellText value={rec.notes} busy={rb} placeholder="notes" wide onChange={(v) => setField(c.id, "notes", v, false)} onCommit={(v) => setField(c.id, "notes", v, true)} /></CellTd>
                    <Td className="text-right"><RowActions onEdit={() => startEdit(c)} onDelete={() => removeCard(c.id)} busy={busy} /></Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellText({ value, onChange, onCommit, busy, placeholder, wide }: {
  value: string; onChange: (v: string) => void; onCommit: (v: string) => void; busy: boolean; placeholder?: string; wide?: boolean;
}) {
  return (
    <input
      value={value}
      disabled={busy}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      className={CELL_INPUT + " disabled:opacity-60"}
      style={{ minWidth: wide ? 130 : 78 }}
      aria-label={placeholder}
    />
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle whitespace-nowrap " + (className ?? "")} style={{ background: "var(--color-surface-soft)" }}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-3 align-middle text-[14px] text-ink-soft " + (className ?? "")}>{children}</td>;
}
function CellTd({ children }: { children: React.ReactNode }) {
  return <td className="px-1.5 py-2 align-middle">{children}</td>;
}

function RowActions({ onEdit, onDelete, busy }: { onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => { if (!confirming) return; const t = setTimeout(() => setConfirming(false), 3500); return () => clearTimeout(t); }, [confirming]);
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={onEdit} disabled={busy} aria-label="Edit card" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong disabled:opacity-50">
        <Pencil size={15} strokeWidth={2.2} />
      </button>
      {confirming ? (
        <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.4} />} Confirm
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} aria-label="Delete card" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] hover:text-altus-red disabled:opacity-50">
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

function CardEditorRow({ colSpan, draft, setDraft, entityOptions, onSave, onCancel, busy, adding }: {
  colSpan: number; draft: CardDraft; setDraft: React.Dispatch<React.SetStateAction<CardDraft>>;
  entityOptions: LookupOption[]; onSave: () => void; onCancel: () => void; busy: boolean; adding: boolean;
}) {
  const set = (patch: Partial<CardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const YES_NO = ["Yes", "No", "Don't Know"];
  return (
    <tr style={{ borderBottom: "1px solid var(--color-hairline)", background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))" }}>
      <td colSpan={colSpan} className="px-5 py-5">
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-6 max-md:grid-cols-2">
          <Field label="S. No" className="col-span-2 max-md:col-span-1">
            <input value={draft.code} onChange={(e) => set({ code: e.target.value })} className={INPUT} placeholder="1" aria-label="S. No" autoFocus />
          </Field>
          <Field label="Entity" className="col-span-4 max-lg:col-span-2 max-md:col-span-1">
            <ValueSelect label="entity" kind="cc_entity" options={entityOptions} value={draft.entityName} onChange={(v) => set({ entityName: v })} placeholder="Entity…" />
          </Field>
          <Field label="Card name" className="col-span-6 max-lg:col-span-6 max-md:col-span-2">
            <input value={draft.cardName} onChange={(e) => set({ cardName: e.target.value })} className={INPUT} placeholder="e.g. Amex 33001" aria-label="Card name" />
          </Field>
          <Field label="ECS" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <select value={draft.ecs ?? ""} onChange={(e) => set({ ecs: e.target.value || null })} className={INPUT} aria-label="ECS">
              <option value="">—</option>
              {YES_NO.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </Field>
          <Field label="ECS from" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <input value={draft.ecsFrom ?? ""} onChange={(e) => set({ ecsFrom: e.target.value })} className={INPUT} placeholder="Entity" aria-label="ECS from" />
          </Field>
          <Field label="Statement period" className="col-span-3 max-lg:col-span-2 max-md:col-span-1">
            <input value={draft.stmtPeriod} onChange={(e) => set({ stmtPeriod: e.target.value })} className={INPUT} placeholder="15th - 14th" aria-label="Statement period" />
          </Field>
          <Field label="St Dt" className="col-span-1 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.stmtStartDay} onChange={(e) => set({ stmtStartDay: e.target.value })} className={INPUT} placeholder="14" aria-label="St Dt" />
          </Field>
          <Field label="Due Dt" className="col-span-1 max-lg:col-span-3 max-md:col-span-1">
            <input value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value })} className={INPUT} placeholder="1" aria-label="Due Dt" />
          </Field>
          <Field label="Soft copy auto-email" className="col-span-4 max-lg:col-span-6 max-md:col-span-2">
            <select value={draft.softCopyAutoEmail ?? ""} onChange={(e) => set({ softCopyAutoEmail: e.target.value || null })} className={INPUT} aria-label="Soft copy auto-email">
              <option value="">—</option>
              {["Yes", "No", "NA"].map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[14px] font-bold text-ink-muted hover:bg-surface-soft disabled:opacity-50">
            <X size={16} strokeWidth={2.4} /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />} {adding ? "Add card" : "Save changes"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={"flex flex-col gap-1.5 " + (className ?? "")}>
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
