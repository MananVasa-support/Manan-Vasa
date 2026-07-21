"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Download, CalendarPlus, Trash2, Loader2, Check } from "lucide-react";
import type { LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { saveVasaCell, addVasaSnapshot, deleteVasaSnapshot } from "@/app/(app)/accounts/vasa-family-interpersonal/actions";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const key = (asOn: string, row: string, col: string) => `${asOn}|${row}|${col}`;
function fmt(n: number): string {
  if (n === 0) return "0";
  const s = inr.format(Math.abs(n));
  return n < 0 ? `-${s}` : s;
}

/**
 * Vasa Family Interpersonal — the who-owes-whom matrix, one snapshot (as-on
 * date) at a time. Parties are both the rows and the columns; a cell is the
 * balance between them and its mirror auto-negates. Faithful to the source
 * sheet, fully editable, with add/remove party, add/remove snapshot, and export.
 */
export function VasaBalances({
  cells, snapshots, partyOptions,
}: {
  cells: VasaCell[]; snapshots: string[]; partyOptions: LookupOption[];
}) {
  const router = useRouter();
  const [asOn, setAsOn] = React.useState(snapshots[0] ?? "");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newParty, setNewParty] = React.useState("");
  const [, startTransition] = React.useTransition();

  React.useEffect(() => { if (!asOn && snapshots[0]) setAsOn(snapshots[0]); }, [snapshots, asOn]);

  // Cell values keyed by asOn|row|col, seeded from props + local optimistic edits.
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setEdits({}); }, [cells]);
  const baseMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) if (c.asOn) m.set(key(c.asOn, c.party, c.counterparty), Number(c.amount));
    return m;
  }, [cells]);

  const parties = React.useMemo(() => partyOptions.map((o) => o.name), [partyOptions]);
  const partyOptByName = React.useMemo(() => new Map(partyOptions.map((o) => [o.name, o])), [partyOptions]);

  function cellValue(row: string, col: string): string {
    const k = key(asOn, row, col);
    if (k in edits) return edits[k]!;
    const v = baseMap.get(k);
    return v === undefined ? "" : String(v);
  }

  function saveCell(row: string, col: string, rawInput: string) {
    const trimmed = rawInput.replace(/[,\s₹]/g, "").trim();
    const num = trimmed === "" || trimmed === "-" ? 0 : Number(trimmed);
    if (!Number.isFinite(num)) { fireToast({ message: "Enter a number.", type: "error" }); return; }
    setEdits((p) => ({ ...p, [key(asOn, row, col)]: num === 0 ? "" : String(num), [key(asOn, col, row)]: num === 0 ? "" : String(-num) }));
    setBusy(true);
    startTransition(async () => {
      const res = await saveVasaCell({ asOn, rowParty: row, colParty: col, amount: num });
      setBusy(false);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      router.refresh();
    });
  }

  function addParty() {
    const name = newParty.trim();
    if (!name) { setAdding(false); return; }
    setBusy(true);
    startTransition(async () => {
      const res = await addAccountsLookup("vasa_party", name);
      setBusy(false); setNewParty(""); setAdding(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Added ${name}.`, type: "success" });
      router.refresh();
    });
  }

  function removeParty(opt: LookupOption) {
    if (!window.confirm(`Remove ${opt.name} from the party roster?`)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await softDeleteAccountsLookup(opt.id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Removed ${opt.name}.`, type: "info" });
      router.refresh();
    });
  }

  function newSnapshot() {
    const proposed = new Date().toLocaleDateString("en-GB");
    const dt = window.prompt("New snapshot date (dd/mm/yyyy) — clones the current snapshot's balances:", proposed);
    if (!dt) return;
    setBusy(true);
    startTransition(async () => {
      const res = await addVasaSnapshot({ newAsOn: dt.trim(), fromAsOn: asOn || null });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Snapshot ${dt} created.`, type: "success" });
      setAsOn(dt.trim());
      router.refresh();
    });
  }

  function removeSnapshot() {
    if (!asOn) return;
    if (!window.confirm(`Delete the entire "${asOn}" snapshot and all its balances?`)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await deleteVasaSnapshot({ asOn });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Snapshot ${asOn} deleted.`, type: "info" });
      setAsOn(snapshots.find((s) => s !== asOn) ?? "");
      router.refresh();
    });
  }

  function rowTotal(row: string): number {
    let t = 0;
    for (const col of parties) { if (col === row) continue; const v = cellValue(row, col); if (v) t += Number(v); }
    return t;
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] font-bold text-ink-soft">
          As on
          <select value={asOn} onChange={(e) => setAsOn(e.target.value)} className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]">
            {snapshots.length === 0 && <option value="">No snapshots</option>}
            {snapshots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" onClick={newSnapshot} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50">
          <CalendarPlus size={15} strokeWidth={2.4} /> New snapshot
        </button>
        {asOn && (
          <button type="button" onClick={removeSnapshot} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white py-2 px-3 text-[13.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50" title="Delete this snapshot">
            <Trash2 size={15} strokeWidth={2.4} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {busy && <Loader2 size={16} className="animate-spin text-ink-subtle" />}
          <a href="/accounts/vasa-family-interpersonal/export" className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red" title="Download every snapshot as Excel">
            <Download size={15} strokeWidth={2.4} /> Export
          </a>
        </div>
      </div>

      <p className="text-[12.5px] font-semibold text-ink-subtle">
        A cell is what the <span className="font-bold text-ink-soft">row party</span> is owed by the column party (negative = the row party owes). Editing a cell auto-updates its mirror. {parties.length} parties · {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}.
      </p>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="border-collapse text-right text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle" style={{ background: "var(--color-surface-soft)", minWidth: 140 }}>Party</th>
              {parties.map((col) => (
                <th key={col} className="group px-2.5 py-2.5 text-right text-[11.5px] font-bold text-ink-soft whitespace-nowrap" style={{ background: "var(--color-surface-soft)", minWidth: 92 }}>
                  <span className="inline-flex items-center gap-1">
                    {col}
                    {partyOptByName.get(col) && (
                      <button type="button" onClick={() => removeParty(partyOptByName.get(col)!)} disabled={busy} title={`Remove ${col}`} className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-altus-red transition-opacity"><X size={12} strokeWidth={2.6} /></button>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle" style={{ background: "var(--color-surface-soft)", minWidth: 104 }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {parties.length === 0 && (
              <tr><td colSpan={2} className="px-5 py-12 text-center text-[14px] font-semibold text-ink-muted">No parties yet — add one to start the matrix.</td></tr>
            )}
            {parties.map((row) => {
              const net = rowTotal(row);
              return (
                <tr key={row} className="hover:bg-surface-soft" style={{ borderTop: "1px solid var(--color-hairline)" }}>
                  <th className="sticky left-0 z-10 px-3 py-1.5 text-left font-bold text-ink-strong whitespace-nowrap" style={{ background: "var(--color-surface-card)", minWidth: 140 }}>{row}</th>
                  {parties.map((col) => {
                    if (row === col) return <td key={col} className="px-1 py-1 text-center text-ink-subtle" style={{ background: "color-mix(in srgb, var(--color-ink-subtle) 6%, transparent)" }}>—</td>;
                    return <td key={col} className="px-1 py-1"><MatrixCell value={cellValue(row, col)} disabled={busy} onCommit={(v) => saveCell(row, col, v)} /></td>;
                  })}
                  <td className="px-3 py-1.5 font-bold tabular-nums whitespace-nowrap" style={{ color: net > 0 ? "var(--color-green-deep)" : net < 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>{net === 0 ? "—" : fmt(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add party */}
      <div className="flex items-center gap-2">
        {adding ? (
          <>
            <input autoFocus value={newParty} onChange={(e) => setNewParty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addParty(); if (e.key === "Escape") { setAdding(false); setNewParty(""); } }} placeholder="New party name…" className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
            <button type="button" onClick={addParty} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}><Check size={15} strokeWidth={2.6} /> Add</button>
            <button type="button" onClick={() => { setAdding(false); setNewParty(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-muted"><X size={15} /> Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <Plus size={15} strokeWidth={2.6} /> Add party
          </button>
        )}
      </div>
    </section>
  );
}

/** One editable matrix cell — Indian-formatted when idle, raw number on focus. */
function MatrixCell({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
  const num = value === "" ? 0 : Number(value);
  const display = focused ? draft : value === "" ? "" : fmt(num);
  return (
    <input
      value={display}
      disabled={disabled}
      inputMode="numeric"
      onFocus={() => { setFocused(true); setDraft(value); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full rounded-md border bg-white px-1.5 py-1 text-right text-[12.5px] font-semibold tabular-nums outline-none transition-colors focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{
        minWidth: 84,
        borderColor: value ? "transparent" : "var(--color-hairline)",
        color: num < 0 ? "var(--color-altus-red)" : num > 0 ? "var(--color-green-deep)" : "var(--color-ink-subtle)",
        background: value ? (num < 0 ? "color-mix(in srgb, var(--color-altus-red) 7%, #fff)" : "color-mix(in srgb, var(--color-green) 9%, #fff)") : "#fff",
      }}
    />
  );
}
