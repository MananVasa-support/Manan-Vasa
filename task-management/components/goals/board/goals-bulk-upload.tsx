"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  X,
  Download,
  Check,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { bulkCreateGoals } from "@/app/(app)/goals/cascade/actions";
import { fireToast } from "@/lib/toast";
import { periodKeyLabel } from "@/components/goals/cascade/util";
import type { GoalPeriod } from "@/lib/goals/types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/* ------------------------------------------------------------------ */
/* Template                                                            */
/* ------------------------------------------------------------------ */

const TEMPLATE_HEADERS = [
  "Area",
  "Goal",
  "Measure",
  "Weight",
  "Target",
  "Incentive (yes/no)",
  "Incentive amount",
  "Incentive type (one_time/repetitive/milestone)",
];
const TEMPLATE_EXAMPLE = [
  ["Sales", "Close 12 enterprise deals", "deals", "150", "12", "yes", "50000", "one_time"],
  ["Delivery", "Ship the v2 client portal", "", "120", "", "no", "", ""],
  ["Ops", "Cut invoice-cycle to 5 days", "days", "80", "5", "yes", "10000", "repetitive"],
];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsvTemplate(): void {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, "goals-bulk-template.csv");
}

function downloadXlsxTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]);
  ws["!cols"] = [
    { wch: 14 }, { wch: 34 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Goals");
  XLSX.writeFile(wb, "goals-bulk-template.xlsx");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Header auto-map (accept common variants)                            */
/* ------------------------------------------------------------------ */

type Field =
  | "area"
  | "title"
  | "uom"
  | "weight"
  | "target"
  | "incentiveEnabled"
  | "incentiveAmount"
  | "incentiveKind";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapHeader(raw: string): Field | null {
  const h = norm(raw);
  if (!h) return null;
  // Incentive sub-columns first (more specific than bare "incentive").
  if (h.includes("incentive") && (h.includes("amount") || h.includes("value") || h.includes("rs")))
    return "incentiveAmount";
  if (h.includes("incentive") && (h.includes("type") || h.includes("kind")))
    return "incentiveKind";
  if (h.includes("incentive")) return "incentiveEnabled";
  if (h.includes("weight")) return "weight";
  if (h.includes("measure") || h.includes("uom") || h === "unit" || h.includes("unitofmeasure"))
    return "uom";
  if (h.includes("target") || h.includes("quantity") || h === "qty") return "target";
  if (h.includes("area") || h.includes("function") || h.includes("department")) return "area";
  if (h.includes("goal") || h.includes("title") || h.includes("objective") || h.includes("kpi") || h.includes("what"))
    return "title";
  return null;
}

const INCENTIVE_KINDS = ["one_time", "repetitive", "milestone"] as const;
type IncentiveKind = (typeof INCENTIVE_KINDS)[number];

function parseYesNo(raw: unknown): boolean {
  const v = norm(raw);
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

function parseKind(raw: unknown): IncentiveKind | null | "invalid" {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const n = norm(v);
  if (n === "onetime" || n === "one") return "one_time";
  if (n === "repetitive" || n === "repeat" || n === "recurring") return "repetitive";
  if (n === "milestone") return "milestone";
  return "invalid";
}

/** A parsed + validated preview row. */
interface Row {
  key: number;
  sheetRow: number;
  area: string | null;
  title: string;
  uom: string | null;
  weight: number;
  target: string | null;
  incentiveEnabled: boolean;
  incentiveAmount: string | null;
  incentiveKind: IncentiveKind | null;
  errors: string[];
  include: boolean;
}

function numericString(raw: unknown): { ok: boolean; value: string | null } {
  const s = String(raw ?? "").trim().replace(/[,₹\s]/g, "");
  if (!s) return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, value: null };
  return { ok: true, value: String(n) };
}

function parseRows(matrix: unknown[][]): { rows: Row[]; mappedCols: number } {
  const headerRow = matrix[0] ?? [];
  const colMap = headerRow.map((c) => mapHeader(String(c)));
  const mappedCols = colMap.filter(Boolean).length;
  const rows: Row[] = [];
  let key = 0;

  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    const cell = (f: Field): unknown => {
      const idx = colMap.indexOf(f);
      return idx === -1 ? "" : raw[idx];
    };

    const area = str(cell("area"), 160);
    const title = str(cell("title"), 400);
    const uom = str(cell("uom"), 80);
    const incentiveEnabled = parseYesNo(cell("incentiveEnabled"));
    // Fully-blank row → skip silently.
    if (!area && !title && !uom && !incentiveEnabled && !str(cell("target"), 40) && !str(cell("weight"), 40))
      continue;

    const errors: string[] = [];
    if (!title) errors.push("Goal is required");

    // Weight → 0–1000, default 100 when blank.
    let weight = 100;
    const wRaw = String(cell("weight") ?? "").trim();
    if (wRaw) {
      const w = Math.round(Number(wRaw.replace(/[^0-9.\-]/g, "")));
      if (!Number.isFinite(w) || w < 0 || w > 1000) errors.push("Weight must be 0–1000");
      else weight = w;
    }

    // Target (numeric) → targetQty.
    const t = numericString(cell("target"));
    if (!t.ok) errors.push("Target must be a number");

    // Incentive consistency.
    let incentiveAmount: string | null = null;
    let incentiveKind: IncentiveKind | null = null;
    if (incentiveEnabled) {
      const amt = numericString(cell("incentiveAmount"));
      if (!amt.ok) errors.push("Incentive amount must be a number");
      else incentiveAmount = amt.value;
      const k = parseKind(cell("incentiveKind"));
      if (k === "invalid") errors.push("Incentive type must be one_time, repetitive or milestone");
      else incentiveKind = k;
    }

    rows.push({
      key: key++,
      sheetRow: r + 1,
      area,
      title: title ?? "",
      uom,
      weight,
      target: t.value,
      incentiveEnabled,
      incentiveAmount,
      incentiveKind,
      errors,
      include: errors.length === 0,
    });
  }
  return { rows, mappedCols };
}

function str(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  employeeId: string;
  level: GoalPeriod;
  periodKey: string;
}

export function GoalsBulkUpload(props: Props) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [fileName, setFileName] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const bucketLabel = periodKeyLabel(props.periodKey);

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = rows ? rows.length - validCount : 0;
  const selectedCount = rows?.filter((r) => r.include && r.errors.length === 0).length ?? 0;

  const reset = React.useCallback(() => {
    setRows(null);
    setFileName("");
    setError(null);
  }, []);

  const close = React.useCallback(() => {
    if (pending) return;
    setOpen(false);
    reset();
  }, [pending, reset]);

  // Esc closes.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setRows(null);
    setFileName(file.name);
    void (async () => {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          setError("The file has no sheets.");
          return;
        }
        const ws = wb.Sheets[sheetName]!;
        const matrix = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          blankrows: false,
          defval: "",
        }) as unknown[][];
        if (matrix.length < 2) {
          setError("The file needs a header row and at least one goal row.");
          return;
        }
        const { rows: parsed, mappedCols } = parseRows(matrix);
        if (mappedCols === 0) {
          setError(
            "Couldn't recognise any columns. Use the template headers (Area, Goal, Measure, Weight, Target, Incentive…).",
          );
          return;
        }
        if (parsed.length === 0) {
          setError("No goal rows found in the file.");
          return;
        }
        setRows(parsed);
      } catch (err) {
        setError(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }

  function toggleRow(key: number) {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.key === key && r.errors.length === 0 ? { ...r, include: !r.include } : r))
        : prev,
    );
  }

  function doImport() {
    if (!rows) return;
    const payload = rows
      .filter((r) => r.include && r.errors.length === 0)
      .map((r) => ({
        area: r.area,
        title: r.title,
        uom: r.uom,
        weight: r.weight,
        targetQty: r.target,
        incentiveEnabled: r.incentiveEnabled,
        incentiveAmount: r.incentiveEnabled ? r.incentiveAmount : null,
        incentiveKind: r.incentiveEnabled ? r.incentiveKind : null,
      }));
    if (payload.length === 0) {
      setError("Select at least one valid row to import.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await bulkCreateGoals({
        employeeId: props.employeeId,
        level: props.level,
        periodKey: props.periodKey,
        rows: payload,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: `Imported ${res.created} goal${res.created === 1 ? "" : "s"} into ${bucketLabel}.`,
        type: "success",
      });
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          reset();
        }}
        className={`wg-btn inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors cursor-pointer ${FOCUS_RING}`}
        style={{
          background: "var(--color-surface-card)",
          borderColor: "var(--color-hairline-strong)",
          color: "var(--color-ink-soft)",
        }}
      >
        <Upload size={15} strokeWidth={2.4} />
        Bulk upload
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Bulk upload goals"
              className="wg-rise flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[22px]"
              style={{
                background: "var(--color-surface-card)",
                border: "1px solid var(--color-hairline-strong)",
                boxShadow: "0 30px 70px -18px rgba(15,23,42,0.45)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex items-start justify-between gap-4 px-6 py-5"
                style={{
                  borderBottom: "1px solid var(--color-hairline)",
                  background:
                    "linear-gradient(152deg, color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card)), var(--color-surface-card) 60%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                      color: "var(--color-altus-red)",
                    }}
                  >
                    <FileSpreadsheet size={20} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <h2
                      className="font-bold text-ink-strong"
                      style={{ fontSize: 19, letterSpacing: "-0.01em" }}
                    >
                      Bulk upload goals
                    </h2>
                    <p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                      Into <strong className="text-ink-strong">{bucketLabel}</strong> · rows are
                      appended (existing goals are kept)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className={`rounded-lg p-1.5 text-ink-subtle hover:text-ink-strong hover:bg-surface-soft cursor-pointer ${FOCUS_RING}`}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body (scrolls) */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {/* Template + upload actions */}
                <div
                  className="flex flex-wrap items-center gap-2.5 rounded-xl p-3.5"
                  style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
                >
                  <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--color-ink-subtle)" }}>
                    Template
                  </span>
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className={`wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95 cursor-pointer ${FOCUS_RING}`}
                  >
                    <Download size={14} strokeWidth={2.4} /> CSV
                  </button>
                  <button
                    type="button"
                    onClick={downloadXlsxTemplate}
                    className={`wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95 cursor-pointer ${FOCUS_RING}`}
                  >
                    <Download size={14} strokeWidth={2.4} /> Excel
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    {fileName && (
                      <span className="max-w-[180px] truncate text-[12.5px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                        {fileName}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold text-white cursor-pointer ${FOCUS_RING}`}
                      style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                    >
                      <Upload size={14} strokeWidth={2.6} /> {rows ? "Choose another" : "Choose file"}
                    </button>
                  </div>
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onPick}
                />

                {error && (
                  <p
                    className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red"
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}
                  >
                    <AlertTriangle size={15} /> {error}
                  </p>
                )}

                {!rows && !error && (
                  <p className="mt-4 text-[13.5px] font-medium" style={{ color: "var(--color-ink-muted)", lineHeight: 1.5 }}>
                    Download the template, fill one goal per row, then upload the CSV or Excel file.
                    Columns: <strong className="text-ink-soft">Area · Goal · Measure · Weight · Target ·
                    Incentive (yes/no) · Incentive amount · Incentive type</strong>. Only <strong className="text-ink-soft">Goal</strong> is required.
                  </p>
                )}

                {/* Preview */}
                {rows && (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold"
                        style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}
                      >
                        <CheckCircle2 size={14} /> {validCount} valid
                      </span>
                      {invalidCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold"
                          style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red-deep)" }}
                        >
                          <AlertTriangle size={14} /> {invalidCount} need fixing
                        </span>
                      )}
                      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
                        {selectedCount} selected to import
                      </span>
                    </div>

                    <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-hairline)" }}>
                      <table className="w-full border-collapse text-[13px]">
                        <thead>
                          <tr style={{ background: "var(--color-surface-soft)" }}>
                            {["", "Goal", "Area", "Measure", "Wt", "Target", "Incentive"].map((h, i) => (
                              <th
                                key={i}
                                className="whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em]"
                                style={{ color: "var(--color-ink-subtle)", borderBottom: "1px solid var(--color-hairline)" }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const bad = r.errors.length > 0;
                            return (
                              <tr
                                key={r.key}
                                style={{
                                  borderBottom: "1px solid var(--color-hairline)",
                                  background: bad
                                    ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                                    : r.include
                                      ? "transparent"
                                      : "var(--color-surface-soft)",
                                }}
                              >
                                <td className="px-2.5 py-2 align-top">
                                  <input
                                    type="checkbox"
                                    checked={r.include && !bad}
                                    disabled={bad}
                                    onChange={() => toggleRow(r.key)}
                                    aria-label={`Include row ${r.sheetRow}`}
                                    className="size-4 cursor-pointer accent-[var(--color-altus-red)] disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-2.5 py-2 align-top">
                                  <div className="max-w-[240px] font-semibold text-ink-strong">
                                    {r.title || <span style={{ color: "var(--color-altus-red)" }}>—</span>}
                                  </div>
                                  {bad && (
                                    <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
                                      {r.errors.join(" · ")}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">{r.area ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">{r.uom ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.weight}</td>
                                <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.target ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">
                                  {r.incentiveEnabled
                                    ? `Yes${r.incentiveAmount ? ` · ₹${r.incentiveAmount}` : ""}${r.incentiveKind ? ` · ${r.incentiveKind}` : ""}`
                                    : "No"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between gap-3 px-6 py-4"
                style={{ borderTop: "1px solid var(--color-hairline)" }}
              >
                <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                  Append-only · valid rows land in {bucketLabel}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className={`cursor-pointer rounded-full border border-hairline-strong px-4 py-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink-strong hover:bg-surface-soft disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={doImport}
                    disabled={pending || selectedCount === 0}
                    className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13.5px] font-bold text-white transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer ${FOCUS_RING}`}
                    style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                  >
                    {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                    {pending ? "Importing…" : `Import ${selectedCount || ""}`.trim()}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
