"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, ArrowRight, Sparkles, Search, X, UserPlus } from "lucide-react";
import { TASK_PRIORITIES, PRIORITY_LABELS, type TaskPriority } from "@/db/enums";

/**
 * Tasks Bulk-entry GRID — an in-app spreadsheet (ports the Goals bulk grid to
 * Tasks). The user fills typed boxes + dropdowns (no download/upload), assigns
 * Doer(s) + an Initiator per row via a type-to-search picker, can paste straight
 * from Excel, then "Proceed" hands clean rows to the duplicate/anomaly review.
 * Keyboard-first: Tab across cells; native <select>/<input type=date> for feel.
 */

export interface Person {
  id: string;
  name: string;
}

/** One clean row emitted to the review step. */
export interface TaskGridRow {
  title: string; // Client Name (required)
  subject: string | null;
  description: string | null;
  priority: TaskPriority;
  dueDate: string; // yyyy-mm-dd, "" when unset
  doers: Person[];
  initiator: Person | null;
}

interface Draft {
  id: number;
  title: string;
  subject: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  doers: Person[];
  initiator: Person | null;
}

const DEFAULT_PRIORITY: TaskPriority = "not_imp_not_urgent";

const CELL =
  "w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-strong outline-none focus:bg-[color-mix(in_oklab,var(--color-altus-red)_5%,transparent)]";

type TextKey = "title" | "subject" | "description";
/** The free-text + date columns (Doer/Initiator are pickers, Priority a select). */
const TEXT_COLS: { key: TextKey; label: string; minW: number; list?: string; placeholder: string }[] = [
  { key: "title", label: "Client Name", minW: 190, list: "tbg-clients", placeholder: "Client / task title" },
  { key: "subject", label: "Subject", minW: 150, list: "tbg-subjects", placeholder: "Subject" },
  { key: "description", label: "Description", minW: 240, placeholder: "What needs doing?" },
];

/** Best-effort name → roster member (exact, else startsWith, else includes). */
function findMember(roster: Person[], raw: string): Person | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  return (
    roster.find((m) => m.name.toLowerCase() === q) ??
    roster.find((m) => m.name.toLowerCase().startsWith(q)) ??
    roster.find((m) => m.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Map a pasted priority label/value → a valid enum value (fallback = Normal). */
function coercePriority(raw: string): TaskPriority {
  const s = raw.trim().toLowerCase();
  if (!s) return DEFAULT_PRIORITY;
  const byValue = TASK_PRIORITIES.find((p) => p === s);
  if (byValue) return byValue;
  const byLabel = TASK_PRIORITIES.find((p) => PRIORITY_LABELS[p].toLowerCase() === s);
  return byLabel ?? DEFAULT_PRIORITY;
}

/** dd/mm/yyyy · dd-mm-yyyy · yyyy-mm-dd · yyyy/mm/dd → yyyy-mm-dd ("" if unparseable). */
function toISODate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[/.\-]/).map((p) => p.trim());
  if (parts.length === 3) {
    let d: string, m: string, y: string;
    if (parts[0]!.length === 4) [y, m, d] = parts as [string, string, string];
    else [d, m, y] = parts as [string, string, string];
    if (y.length === 2) y = `20${y}`;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (/^\d{4}$/.test(y) && +mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${y}-${mm}-${dd}`;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Member picker — type-to-search the roster; single or multi.         */
/* ------------------------------------------------------------------ */

function MemberPicker({
  roster,
  value,
  onChange,
  multi,
  placeholder,
}: {
  roster: Person[];
  value: Person[];
  onChange: (v: Person[]) => void;
  multi: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [box, setBox] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const picked = new Set(value.map((v) => v.id));
  const filtered = roster
    .filter((r) => !picked.has(r.id) && r.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  function openPop() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setBox({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240), width: Math.max(r.width, 220) });
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  }
  function add(m: Person) {
    onChange(multi ? [...value, m] : [m]);
    setQ("");
    if (multi) searchRef.current?.focus();
    else setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1.5 py-1">
      {value.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-strong" style={{ borderColor: "var(--color-hairline-strong)" }}>
          {v.name.split(" ")[0]}
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.name}`} className="text-ink-subtle hover:text-altus-red">
            <X size={11} />
          </button>
        </span>
      ))}
      {(multi || value.length === 0) && (
        <button
          ref={btnRef}
          type="button"
          onClick={openPop}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openPop(); } }}
          className="inline-flex items-center gap-1 rounded-md border border-solid px-1.5 py-0.5 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <UserPlus size={12} strokeWidth={2.4} /> {value.length ? "" : placeholder}
        </button>
      )}

      {open && box && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[290]" onClick={() => setOpen(false)} />
            <div
              className="wg-fade-in fixed z-[300] overflow-hidden rounded-xl border bg-surface-card shadow-xl"
              style={{ top: box.top, left: box.left, width: box.width, borderColor: "var(--color-hairline-strong)" }}
            >
              <div className="flex items-center gap-1.5 border-b px-2.5 py-2" style={{ borderColor: "var(--color-hairline)" }}>
                <Search size={13} className="text-ink-subtle" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0]) { e.preventDefault(); add(filtered[0]); }
                    else if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="Type a name…"
                  className="w-full bg-transparent text-[13px] text-ink-strong outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-[12.5px] font-semibold text-ink-subtle">No matches</p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => add(m)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      {m.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

export function TasksBulkGrid(props: {
  roster: Person[];
  clients: string[];
  subjects: string[];
  /** Default initiator (current user) pre-filled on every new row; null when unknown. */
  me: Person | null;
  onProceed: (rows: TaskGridRow[]) => void;
}) {
  const seq = React.useRef(1);
  const blank = React.useCallback(
    (): Draft => ({
      id: seq.current++,
      title: "",
      subject: "",
      description: "",
      priority: DEFAULT_PRIORITY,
      dueDate: "",
      doers: [],
      initiator: props.me,
    }),
    [props.me],
  );

  const [rows, setRows] = React.useState<Draft[]>(() => Array.from({ length: 6 }, blank));

  function setCell(id: number, patch: Partial<Draft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, blank()]);
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? blank() : r))));
  }

  /** Paste-from-Excel: TSV rows → Client · Subject · Description · Priority · Due · Doer(s) · Initiator. */
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;
    e.preventDefault();
    const parsed: Draft[] = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const c = line.split("\t");
        const d = blank();
        d.title = (c[0] ?? "").trim();
        d.subject = (c[1] ?? "").trim();
        d.description = (c[2] ?? "").trim();
        d.priority = coercePriority(c[3] ?? "");
        d.dueDate = toISODate(c[4] ?? "");
        // Doer(s): comma/semicolon separated names → resolve against the roster.
        const doerCell = (c[5] ?? "").trim();
        if (doerCell) {
          d.doers = doerCell
            .split(/[;,]/)
            .map((n) => findMember(props.roster, n))
            .filter((m): m is Person => m !== null);
        }
        // Initiator: single name → roster member, else keep the default (me).
        const initCell = (c[6] ?? "").trim();
        if (initCell) d.initiator = findMember(props.roster, initCell) ?? props.me;
        return d;
      });
    if (parsed.length === 0) return;
    setRows((prev) => {
      const filled = prev.filter((r) => r.title.trim() || r.doers.length > 0);
      return [...filled, ...parsed];
    });
  }

  function proceed() {
    const out: TaskGridRow[] = rows
      .filter((r) => r.title.trim().length > 0 || r.doers.length > 0)
      .map((r) => ({
        title: r.title.trim(),
        subject: r.subject.trim() || null,
        description: r.description.trim() || null,
        priority: r.priority,
        dueDate: r.dueDate,
        doers: r.doers,
        initiator: r.initiator,
      }));
    props.onProceed(out);
  }

  const filledCount = rows.filter((r) => r.title.trim() || r.doers.length > 0).length;

  return (
    <div>
      <datalist id="tbg-clients">{props.clients.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="tbg-subjects">{props.subjects.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[13px] font-bold text-ink-strong">Fill your tasks below</span>
        <span className="text-[12px] font-semibold text-ink-subtle">— type, pick a Doer + Initiator, or paste rows from Excel</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-hairline-strong)" }} onPaste={onPaste}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              <th className="w-10 border-b px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>#</th>
              {TEXT_COLS.map((c) => (
                <th key={c.key} className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}>
                  {c.label}
                </th>
              ))}
              <th className="border-b border-l px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 120 }}>Priority</th>
              <th className="border-b border-l px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 150 }}>Due Date</th>
              <th className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>Doer(s)</th>
              <th className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 160 }}>Initiator</th>
              <th className="w-8 border-b border-l px-1 py-2" style={{ borderColor: "var(--color-hairline)" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="group">
                <td className="border-b px-1 text-center align-middle text-[12px] font-bold tabular-nums text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>{i + 1}</td>
                {TEXT_COLS.map((c) => (
                  <td key={c.key} className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}>
                    <input
                      value={r[c.key]}
                      list={c.list}
                      onChange={(e) => setCell(r.id, { [c.key]: e.target.value } as Partial<Draft>)}
                      placeholder={c.placeholder}
                      className={`${CELL} ${c.key === "title" ? "font-semibold" : ""}`}
                    />
                  </td>
                ))}
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 120 }}>
                  <select
                    value={r.priority}
                    onChange={(e) => setCell(r.id, { priority: e.target.value as TaskPriority })}
                    className={`${CELL} cursor-pointer text-center`}
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 150 }}>
                  <input
                    type="date"
                    value={r.dueDate}
                    onChange={(e) => setCell(r.id, { dueDate: e.target.value })}
                    className={`${CELL} text-center ${r.dueDate ? "text-ink-strong" : "text-ink-subtle"}`}
                  />
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>
                  <MemberPicker roster={props.roster} value={r.doers} onChange={(v) => setCell(r.id, { doers: v })} multi placeholder="Doer" />
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 160 }}>
                  <MemberPicker roster={props.roster} value={r.initiator ? [r.initiator] : []} onChange={(v) => setCell(r.id, { initiator: v[0] ?? null })} multi={false} placeholder="Initiator" />
                </td>
                <td className="border-b border-l px-1 text-center align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove row ${i + 1}`}
                    className="grid size-6 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-solid px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <Plus size={14} strokeWidth={2.6} /> Add Row
        </button>
        <button
          type="button"
          onClick={proceed}
          disabled={filledCount === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Proceed to Review {filledCount > 0 ? `(${filledCount})` : ""} <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
