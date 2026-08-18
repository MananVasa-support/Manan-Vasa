"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Download, CalendarPlus, Trash2, Loader2, Check, ChevronLeft, ChevronRight, Save, CloudCheck } from "lucide-react";
import type { LookupOption } from "@/components/ui/lookup-select";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { saveVasaCell, addVasaSnapshot, deleteVasaSnapshot, emailVasaSnapshot } from "@/app/(app)/accounts/vasa-family-interpersonal/actions";
import { VasaSnapshotList } from "./vasa-snapshot-list";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const key = (asOn: string, row: string, col: string) => `${asOn}|${row}|${col}`;
function fmt(n: number): string {
  if (n === 0) return "0";
  const s = inr.format(Math.abs(n));
  return n < 0 ? `-${s}` : s;
}

/* ── Snapshot dates ──────────────────────────────────────────────────────────
 * STORED as the sheet always stored them, `dd/mm/yyyy`, because every existing
 * row and the server's own date sort (listVasaSnapshots) already parse that
 * shape — restamping the column would orphan the history.
 * DISPLAYED as `18-Aug-2026`, which cannot be misread the way 08/09/2026 can.
 * Only the label changes; nothing is written in the new format.             */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `dd/mm/yyyy` → `18-Aug-2026`. Anything unparseable is shown verbatim, so a
 *  hand-entered legacy label is never silently blanked. */
function snapshotLabel(stored: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return stored;
  const [, d, mo, y] = m;
  const mi = Number(mo) - 1;
  if (mi < 0 || mi > 11) return stored;
  const year = y!.length === 2 ? `20${y}` : y!;
  return `${String(d).padStart(2, "0")}-${MONTHS[mi]}-${year}`;
}

/** `<input type="date">` gives `yyyy-mm-dd`; the column wants `dd/mm/yyyy`. */
function ymdToStored(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** Today as `yyyy-mm-dd` in local time — the default for a new snapshot. */
function todayYmd(): string {
  const n = new Date();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${mo}-${d}`;
}

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `<Month> Interpersonal Balance` — derived from the date, so no name column
 *  and no migration are needed to give each sheet a readable title. */
function snapshotName(stored: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return "Interpersonal Balance";
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return "Interpersonal Balance";
  return `${MONTH_FULL[mi]} Interpersonal Balance`;
}

/**
 * CALENDAR quarter — Jan-Mar = Q1 … Oct-Dec = Q4.
 *
 * Deliberately NOT the Apr-Mar financial year the salary module uses: the brief
 * places 18-Aug-2026 in "Q3 2026", which is only true on the calendar. Mirrors
 * `quarterOf` in lib/accounts/vasa-report so the label a user sees on screen is
 * the one written into the emailed report.
 */
function quarterOfStored(stored: string): { q: number; year: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const y = m[3]!.length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
  return { q: Math.floor((mo - 1) / 3) + 1, year: y };
}

const qKey = (q: number, year: number) => `Q${q} ${year}`;

/** The quarter containing today — where the scroller starts. */
function currentQuarter(): { q: number; year: number } {
  const n = new Date();
  return { q: Math.floor(n.getMonth() / 3) + 1, year: n.getFullYear() };
}

function stepQuarter(cur: { q: number; year: number }, by: 1 | -1): { q: number; year: number } {
  const idx = cur.year * 4 + (cur.q - 1) + by;
  return { q: (idx % 4) + 1, year: Math.floor(idx / 4) };
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
  // New-snapshot date entry. Replaces a window.prompt, which could not validate,
  // could not offer a calendar, and asked for `dd/mm/yyyy` by typing.
  const [picking, setPicking] = React.useState(false);
  const [newDate, setNewDate] = React.useState(todayYmd());
  const [, startTransition] = React.useTransition();

  // Sheet is the working view and opens by default; List is the archive.
  const [tab, setTab] = React.useState<"sheet" | "list">("sheet");
  // Quarter scroller — one quarter at a time, starting at today's.
  const [quarter, setQuarter] = React.useState(currentQuarter);
  // Auto-save status. Cells have always written through on blur; what was
  // missing was any sign that they had. `null` = nothing saved yet this session.
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [mailing, setMailing] = React.useState(false);

  /** Snapshots that fall inside the selected quarter, newest first. */
  const quarterSnapshots = React.useMemo(
    () =>
      snapshots.filter((s) => {
        const q = quarterOfStored(s);
        return q && q.q === quarter.q && q.year === quarter.year;
      }),
    [snapshots, quarter],
  );

  // Keep the open snapshot inside the visible quarter. Scrolling to a quarter
  // and still seeing another quarter's grid is the bug this prevents.
  React.useEffect(() => {
    if (quarterSnapshots.length === 0) {
      if (asOn) setAsOn("");
      return;
    }
    if (!quarterSnapshots.includes(asOn)) setAsOn(quarterSnapshots[0]!);
  }, [quarterSnapshots, asOn]);

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
    setSaveState("saving");
    startTransition(async () => {
      // Scoped to `asOn` — the snapshot open at the moment of the edit. A write
      // can never reach a different snapshot, which is what makes auto-save safe
      // to leave running while the user scrolls quarters or switches dates.
      const res = await saveVasaCell({ asOn, rowParty: row, colParty: col, amount: num });
      setBusy(false);
      if (!res.ok) {
        setSaveState("idle");
        fireToast({ message: res.error, type: "error" });
      } else {
        setSaveState("saved");
        setSavedAt(new Date());
      }
      router.refresh();
    });
  }

  /**
   * MANUAL SAVE — capture this snapshot as .xlsx and email it.
   *
   * Cells already persist as they are edited, so there is nothing to flush;
   * "save" here means "send THIS report". The server re-reads the snapshot
   * rather than trusting the browser, so the attachment is what is stored.
   */
  function manualSave() {
    if (!asOn) { fireToast({ message: "Open a snapshot first.", type: "error" }); return; }
    setMailing(true);
    startTransition(async () => {
      const res = await emailVasaSnapshot({ asOn });
      setMailing(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setSaveState("saved");
      setSavedAt(new Date());
      fireToast({ message: `${snapshotLabel(asOn)} saved and emailed to ${res.sentTo}.`, type: "success" });
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

  /**
   * Create a BLANK snapshot on `newDate` and open it.
   *
   * Nothing is copied from the snapshot currently on screen — a new snapshot
   * starts empty by design, and the previous one is never written to, so
   * history cannot be edited by accident.
   */
  function createSnapshot() {
    const stored = ymdToStored(newDate);
    if (!stored) { fireToast({ message: "Pick a date.", type: "error" }); return; }
    setBusy(true);
    startTransition(async () => {
      const res = await addVasaSnapshot({ newAsOn: stored });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      // Open it immediately. `asOn` is set before the refresh so the blank grid
      // is on screen the moment the server data arrives.
      setAsOn(stored);
      setPicking(false);
      fireToast({ message: `Snapshot ${snapshotLabel(stored)} created — empty and ready.`, type: "success" });
      router.refresh();
    });
  }

  function removeSnapshot() {
    if (!asOn) return;
    if (!window.confirm(`Delete the entire "${snapshotLabel(asOn)}" snapshot and all its balances?`)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await deleteVasaSnapshot({ asOn });
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Snapshot ${snapshotLabel(asOn)} deleted.`, type: "info" });
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
      {/* ── Quarter scroller + view tabs ────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-strong bg-white p-1">
          <button
            type="button"
            onClick={() => setQuarter((q) => stepQuarter(q, -1))}
            aria-label="Previous quarter"
            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-altus-red"
          >
            <ChevronLeft size={17} strokeWidth={2.6} />
          </button>
          {/* One quarter at a time — the whole point of a scroller over a list
              of every period the sheet has ever had. */}
          <span className="min-w-[104px] text-center text-[14px] font-bold tabular-nums text-ink-strong">
            {qKey(quarter.q, quarter.year)}
          </span>
          <button
            type="button"
            onClick={() => setQuarter((q) => stepQuarter(q, 1))}
            aria-label="Next quarter"
            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-altus-red"
          >
            <ChevronRight size={17} strokeWidth={2.6} />
          </button>
        </div>

        <div className="inline-flex items-center rounded-xl border border-hairline-strong bg-white p-1">
          {(["sheet", "list"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className="rounded-lg px-4 py-1.5 text-[13px] font-bold capitalize transition-colors"
              style={
                tab === t
                  ? { background: "var(--color-altus-red)", color: "#fff" }
                  : { color: "var(--color-ink-soft)" }
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "sheet" ? (
       <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Snapshot picker — every saved date, newest first. Selecting one loads
            that snapshot exactly as it was saved; nothing is written on select. */}
        <label className="flex items-center gap-2 text-[13px] font-bold text-ink-soft">
          Snapshot
          <select
            value={asOn}
            onChange={(e) => setAsOn(e.target.value)}
            aria-label="Choose a snapshot date"
            className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
          >
            {quarterSnapshots.length === 0 && <option value="">No snapshots this quarter</option>}
            {quarterSnapshots.map((s) => (
              <option key={s} value={s}>{snapshotLabel(s)}</option>
            ))}
          </select>
        </label>

        {picking ? (
          <span className="inline-flex items-center gap-2">
            <input
              autoFocus
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createSnapshot();
                if (e.key === "Escape") setPicking(false);
              }}
              aria-label="New snapshot date"
              className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
            />
            <button
              type="button"
              onClick={createSnapshot}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--color-altus-red)" }}
            >
              <Check size={15} strokeWidth={2.6} /> Create
            </button>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-muted"
            >
              <X size={15} /> Cancel
            </button>
          </span>
        ) : (
          /* PRIMARY action — filled, not another outlined button in a row of
             outlined buttons, so the one thing this screen is for is obvious. */
          <button
            type="button"
            onClick={() => { setNewDate(todayYmd()); setPicking(true); }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            <CalendarPlus size={15} strokeWidth={2.6} /> New Snapshot
          </button>
        )}
        {asOn && (
          <button type="button" onClick={removeSnapshot} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong bg-white py-2 px-3 text-[13.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50" title="Delete this snapshot">
            <Trash2 size={15} strokeWidth={2.4} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* AUTO-SAVE STATUS — quiet by design. Cells write through on blur, so
              the user never presses save; this is the only thing that tells them
              so. It reports the last successful write and nothing else. */}
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-ink-subtle"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden /> Saving…
              </>
            ) : saveState === "saved" ? (
              <>
                <CloudCheck size={13} strokeWidth={2.4} aria-hidden style={{ color: "var(--color-green-deep)" }} />
                {savedAt
                  ? `Last saved ${savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
                  : "Saved"}
              </>
            ) : (
              "Auto-saves as you type"
            )}
          </span>

          {/* MANUAL SAVE — captures THIS snapshot as .xlsx and emails it. */}
          <button
            type="button"
            onClick={manualSave}
            disabled={mailing || !asOn}
            title="Save this report and email the .xlsx"
            className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
          >
            {mailing ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.4} />}
            Manual Save
          </button>

          <a href={asOn ? `/accounts/vasa-family-interpersonal/export?asOn=${encodeURIComponent(asOn)}&format=xlsx` : "/accounts/vasa-family-interpersonal/export"} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red" title={asOn ? `Download ${snapshotLabel(asOn)} as Excel` : "Download every snapshot as Excel"}>
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
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl border border-solid border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <Plus size={15} strokeWidth={2.6} /> Add Party
          </button>
        )}
      </div>
       </>
      ) : (
        /* LIST VIEW — the archive for this quarter. Read-only by construction;
           each row downloads or shares ITS OWN snapshot, never the one the
           Sheet tab happens to have open. */
        <VasaSnapshotList
          snapshots={quarterSnapshots}
          cells={cells}
          parties={parties}
          labelOf={snapshotLabel}
          nameOf={snapshotName}
          quarterOf={(x) => {
            const q = quarterOfStored(x);
            return q ? qKey(q.q, q.year) : "—";
          }}
        />
      )}
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
