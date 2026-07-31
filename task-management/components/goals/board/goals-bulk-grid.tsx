"use client";

import * as React from "react";
import { Plus, Trash2, ArrowRight, Sparkles } from "lucide-react";

/**
 * Goals Bulk-entry GRID — an in-app spreadsheet. The user fills typed boxes +
 * dropdowns (no download/upload), pastes straight from Excel if they like, then
 * "Proceed" hands clean rows to the duplicate/anomaly review step. Keyboard-first:
 * Tab across cells; the dropdowns are native <select> for true Excel feel.
 */

export interface BulkGridRow {
  area: string | null;
  title: string;
  uom: string | null;
  actual: string | null;
  target: string | null;
  category: string | null;
  weight: number;
}

interface Draft {
  id: number;
  area: string;
  title: string;
  uom: string;
  actual: string;
  target: string;
  category: string;
  weight: string;
}

let _seq = 1;
const blank = (): Draft => ({ id: _seq++, area: "", title: "", uom: "", actual: "", target: "", category: "", weight: "" });

/** Columns in order (matches the xlsx template: Area·Goal·Measure·Actual·Target·Type·Weight). */
const COLS: { key: keyof Omit<Draft, "id">; label: string; kind: "select-area" | "select-measure" | "select-type" | "text" | "num" }[] = [
  { key: "area", label: "Area", kind: "select-area" },
  { key: "title", label: "Goal Title", kind: "text" },
  { key: "uom", label: "Measure", kind: "select-measure" },
  { key: "actual", label: "Actual", kind: "num" },
  { key: "target", label: "Target", kind: "num" },
  { key: "category", label: "Type", kind: "select-type" },
  { key: "weight", label: "Weight", kind: "num" },
];

const CELL =
  "w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-strong outline-none focus:bg-[color-mix(in_oklab,var(--color-altus-red)_5%,transparent)]";

export function GoalsBulkGrid(props: {
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  levelName: string;
  onProceed: (rows: BulkGridRow[]) => void;
}) {
  const [rows, setRows] = React.useState<Draft[]>(() => Array.from({ length: 6 }, blank));

  const optionsFor = (kind: string): string[] =>
    kind === "select-area" ? props.areaOptions : kind === "select-measure" ? props.measureOptions : props.typeOptions;

  function setCell(id: number, key: keyof Omit<Draft, "id">, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, blank()]);
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? blank() : r))));
  }

  /** Paste-from-Excel: TSV/CSV in the clipboard becomes rows (7 columns, in
   *  order). Fills blank leading rows first, then appends the rest. */
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return; // let normal single-cell paste through
    e.preventDefault();
    const order: (keyof Omit<Draft, "id">)[] = ["area", "title", "uom", "actual", "target", "category", "weight"];
    const parsed: Draft[] = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const cells = line.split("\t");
        const d = blank();
        order.forEach((k, i) => {
          (d[k] as string) = (cells[i] ?? "").trim();
        });
        return d;
      });
    if (parsed.length === 0) return;
    setRows((prev) => {
      const emptyLead = prev.filter((r) => !r.title.trim() && !r.area.trim());
      const filled = prev.filter((r) => r.title.trim() || r.area.trim());
      // Reuse leading blank rows, then append extras.
      const merged = [...filled];
      for (const p of parsed) merged.push(p);
      return merged.length ? merged : emptyLead;
    });
  }

  function proceed() {
    const out: BulkGridRow[] = rows
      .filter((r) => r.title.trim().length > 0)
      .map((r) => {
        const w = Number(String(r.weight).replace(/[^0-9.\-]/g, ""));
        return {
          area: r.area.trim() || null,
          title: r.title.trim(),
          uom: r.uom.trim() || null,
          actual: r.actual.trim() || null,
          target: r.target.trim() || null,
          category: r.category.trim() || null,
          weight: Number.isFinite(w) && r.weight.trim() ? w : 100,
        };
      });
    props.onProceed(out);
  }

  const filledCount = rows.filter((r) => r.title.trim()).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[13px] font-bold text-ink-strong">Fill your {props.levelName.toLowerCase()} goals below</span>
        <span className="text-[12px] font-semibold text-ink-subtle">— type, pick from the dropdowns, or paste rows from Excel</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-hairline-strong)" }} onPaste={onPaste}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              <th className="w-8 border-b px-1 py-2" style={{ borderColor: "var(--color-hairline)" }} />
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={`border-b border-l px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft ${c.key === "title" ? "text-left" : "text-center"}`}
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="group">
                <td className="border-b px-1 text-center align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove row ${i + 1}`}
                    className="grid size-6 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                    {c.kind === "text" ? (
                      <input
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        placeholder="What does done look like?"
                        className={`${CELL} font-semibold`}
                      />
                    ) : c.kind === "num" ? (
                      <input
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        inputMode="decimal"
                        placeholder={c.key === "weight" ? "100" : "0"}
                        className={`${CELL} text-center`}
                      />
                    ) : (
                      <select
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, c.key, e.target.value)}
                        className={`${CELL} cursor-pointer text-center ${r[c.key] ? "text-ink-strong" : "text-ink-subtle"}`}
                      >
                        <option value="">—</option>
                        {optionsFor(c.kind).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                ))}
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
          <Plus size={14} strokeWidth={2.6} /> Add row
        </button>
        <button
          type="button"
          onClick={proceed}
          disabled={filledCount === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Proceed to review {filledCount > 0 ? `(${filledCount})` : ""} <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
