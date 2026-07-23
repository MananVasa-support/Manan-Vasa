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
  Copy,
  Trash2,
} from "lucide-react";
import { bulkCreateGoals } from "@/app/(app)/goals/cascade/actions";
import { fireToast } from "@/lib/toast";
import { periodKeyLabel } from "@/components/goals/cascade/util";
import type { GoalPeriod } from "@/lib/goals/types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Human level name — drives the template title, sheet name + filename. */
const LEVEL_LABEL: Record<GoalPeriod, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

/* ------------------------------------------------------------------ */
/* Template — LEVEL-AWARE (title, sheet name + filename all differ)    */
/* ------------------------------------------------------------------ */

// Current goal columns (incentive retired). Only "Goal" is required.
const TEMPLATE_HEADERS = ["Area", "Goal", "Measure", "Actual", "Target", "Type", "Weight"];

const TEMPLATE_EXAMPLE = [
  ["Revenue", "Close 12 enterprise deals", "Nos.", "0", "12", "Operational", "150"],
  ["Health", "Exercise 3x every week", "Yes/No", "", "", "Goal", "100"],
  ["Strategy", "Launch the v2 client portal", "Nos.", "0", "1", "Milestone", "120"],
];

/** A slug that's safe in a filename (letters/digits/dashes). */
function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "goals";
}

function downloadXlsxTemplate(level: GoalPeriod, periodKey: string, bucketLabel: string): void {
  const levelName = LEVEL_LABEL[level];
  // Row 1 is a human title banner; row 2 is a hint; row 3 is the HEADER row the
  // importer reads; then the examples. The importer auto-detects the header row
  // by matching known column names, so the banner rows are ignored on re-upload.
  const banner = [`Altus · ${levelName} Goals template — ${bucketLabel}`];
  const hint = ["Fill ONE goal per row below the header. Only ‘Goal’ is required. Delete these first 3 rows or leave them — they're ignored on upload."];
  const aoa = [banner, hint, TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 16 }, { wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${levelName} Goals`);
  XLSX.writeFile(wb, `altus-${slug(levelName)}-goals-${slug(periodKey)}-template.xlsx`);
}

/* ------------------------------------------------------------------ */
/* Header auto-map (accept common variants) — finds the header ROW too */
/* ------------------------------------------------------------------ */

type Field = "area" | "title" | "uom" | "weight" | "target" | "actual" | "category";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapHeader(raw: string): Field | null {
  const h = norm(raw);
  if (!h) return null;
  if (h.includes("weight") || h === "wt") return "weight";
  if (h.includes("measure") || h.includes("uom") || h === "unit" || h.includes("unitofmeasure")) return "uom";
  if (h.includes("actual") || h.includes("achieved") || h.includes("done")) return "actual";
  if (h.includes("target") || h.includes("quantity") || h === "qty") return "target";
  if (h.includes("type") || h.includes("category") || h === "kind") return "category";
  if (h.includes("area") || h.includes("function") || h.includes("department")) return "area";
  if (h.includes("goal") || h.includes("title") || h.includes("objective") || h.includes("kpi") || h.includes("what"))
    return "title";
  return null;
}

/** Find the row index whose cells map to ≥2 known fields (the header row). */
function findHeaderRow(matrix: unknown[][]): number {
  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const mapped = (matrix[r] ?? []).map((c) => mapHeader(String(c))).filter(Boolean).length;
    if (mapped >= 2) return r;
  }
  return 0;
}

type Dup = "existing" | "file" | null;

/** A parsed + validated preview row. */
interface Row {
  key: number;
  sheetRow: number;
  area: string | null;
  title: string;
  uom: string | null;
  weight: number;
  target: string | null;
  actual: string | null;
  category: string | null;
  errors: string[];
  dup: Dup;
  include: boolean;
}

function numericString(raw: unknown): { ok: boolean; value: string | null } {
  const s = String(raw ?? "").trim().replace(/[,₹\s]/g, "");
  if (!s) return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, value: null };
  return { ok: true, value: String(n) };
}

function str(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/** Recompute per-row validation errors + duplicate flags for the whole set
 *  (called after parse AND after any inline title edit). `include` defaults to
 *  ON only for clean, non-duplicate rows so unwanted dupes aren't imported. */
function evaluate(rows: Row[], existing: Set<string>): Row[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const errors: string[] = [];
    if (!r.title.trim()) errors.push("Goal is required");
    if (r.weight < 0 || r.weight > 1000) errors.push("Weight must be 0–1000");

    const key = norm(r.title);
    let dup: Dup = null;
    if (key) {
      if (existing.has(key)) dup = "existing";
      else if (seen.has(key)) dup = "file";
      seen.add(key);
    }
    return { ...r, errors, dup, include: errors.length === 0 && dup === null };
  });
}

function parseRows(matrix: unknown[][], existing: Set<string>): { rows: Row[]; mappedCols: number } {
  const headerIdx = findHeaderRow(matrix);
  const headerRow = matrix[headerIdx] ?? [];
  const colMap = headerRow.map((c) => mapHeader(String(c)));
  const mappedCols = colMap.filter(Boolean).length;
  const rows: Row[] = [];
  let key = 0;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    const cell = (f: Field): unknown => {
      const idx = colMap.indexOf(f);
      return idx === -1 ? "" : raw[idx];
    };

    const area = str(cell("area"), 160);
    const title = str(cell("title"), 400) ?? "";
    const uom = str(cell("uom"), 80);
    const category = str(cell("category"), 60);
    const targetRaw = str(cell("target"), 40);
    const actualRaw = str(cell("actual"), 40);
    const wRawStr = str(cell("weight"), 40);
    // Fully-blank row → skip silently.
    if (!area && !title && !uom && !category && !targetRaw && !actualRaw && !wRawStr) continue;

    // Weight → 0–1000, default 100 when blank.
    let weight = 100;
    if (wRawStr) {
      const w = Math.round(Number(wRawStr.replace(/[^0-9.\-]/g, "")));
      weight = Number.isFinite(w) ? w : -1; // -1 → flagged by evaluate()
    }

    const t = numericString(cell("target"));
    const a = numericString(cell("actual"));

    rows.push({
      key: key++,
      sheetRow: r + 1,
      area,
      title,
      uom,
      weight,
      target: t.ok ? t.value : null,
      actual: a.ok ? a.value : null,
      category,
      errors: [],
      dup: null,
      include: true,
    });
  }
  return { rows: evaluate(rows, existing), mappedCols };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  employeeId: string;
  level: GoalPeriod;
  periodKey: string;
  /** Titles already in THIS bucket — used to flag duplicate uploads. */
  existingTitles: string[];
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
  const levelName = LEVEL_LABEL[props.level];
  const existingSet = React.useMemo(
    () => new Set(props.existingTitles.map((t) => norm(t))),
    [props.existingTitles],
  );

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = rows ? rows.length - validCount : 0;
  const dupCount = rows?.filter((r) => r.dup !== null).length ?? 0;
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
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
        if (matrix.length < 2) {
          setError("The file needs a header row and at least one goal row.");
          return;
        }
        const { rows: parsed, mappedCols } = parseRows(matrix, existingSet);
        if (mappedCols === 0) {
          setError("Couldn't recognise any columns. Use the template headers (Area, Goal, Measure, Actual, Target, Type, Weight).");
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
      prev ? prev.map((r) => (r.key === key && r.errors.length === 0 ? { ...r, include: !r.include } : r)) : prev,
    );
  }

  /** Inline-edit a row's Goal title → re-evaluate errors + duplicates live. */
  function editTitle(key: number, title: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.map((r) => (r.key === key ? { ...r, title } : r));
      return evaluate(next, existingSet);
    });
  }

  /** Drop a row from the preview entirely (remove an unwanted duplicate). */
  function dropRow(key: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.key !== key);
      return next.length ? evaluate(next, existingSet) : null;
    });
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
        actualQty: r.actual,
        category: r.category,
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
        message: `Imported ${res.created} ${levelName.toLowerCase()} goal${res.created === 1 ? "" : "s"} into ${bucketLabel}.`,
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
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4" onClick={close}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Bulk upload ${levelName.toLowerCase()} goals`}
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
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}
                  >
                    <FileSpreadsheet size={20} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-ink-strong" style={{ fontSize: 19, letterSpacing: "-0.01em" }}>
                      Bulk upload · {levelName} goals
                    </h2>
                    <p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                      Into <strong className="text-ink-strong">{bucketLabel}</strong> · rows are appended (existing goals are kept)
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
                    {levelName} template
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadXlsxTemplate(props.level, props.periodKey, bucketLabel)}
                    className={`wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95 cursor-pointer ${FOCUS_RING}`}
                  >
                    <Download size={14} strokeWidth={2.4} /> Download Excel
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
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                    Download the <strong className="text-ink-soft">{levelName}</strong> template, fill one goal per row, then upload
                    the Excel/CSV. Columns:{" "}
                    <strong className="text-ink-soft">Area · Goal · Measure · Actual · Target · Type · Weight</strong>. Only{" "}
                    <strong className="text-ink-soft">Goal</strong> is required — % Done is computed from Actual ÷ Target.
                    Duplicates (of an existing goal or another row) are flagged so you can rename or drop them before importing.
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
                      {dupCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold"
                          style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}
                        >
                          <Copy size={13} /> {dupCount} duplicate{dupCount === 1 ? "" : "s"}
                        </span>
                      )}
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
                            {["", "Goal (editable)", "Area", "Measure", "Actual", "Target", "Type", "Wt", "Status", ""].map((h, i) => (
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
                            const isDup = r.dup !== null;
                            return (
                              <tr
                                key={r.key}
                                style={{
                                  borderBottom: "1px solid var(--color-hairline)",
                                  background: bad
                                    ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                                    : isDup
                                      ? "color-mix(in srgb, #b45309 6%, transparent)"
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
                                  <input
                                    value={r.title}
                                    onChange={(e) => editTitle(r.key, e.target.value)}
                                    aria-label={`Goal title row ${r.sheetRow}`}
                                    className={`w-[240px] max-w-full rounded-md border bg-white px-2 py-1 text-[13px] font-semibold text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                                    style={{ borderColor: bad ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
                                  />
                                  {bad && (
                                    <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
                                      {r.errors.join(" · ")}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">{r.area ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">{r.uom ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.actual ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.target ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top text-ink-soft">{r.category ?? "—"}</td>
                                <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.weight < 0 ? "—" : r.weight}</td>
                                <td className="px-2.5 py-2 align-top">
                                  {isDup ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                                      style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}
                                      title={r.dup === "existing" ? "A goal with this title already exists in this bucket" : "This title is repeated earlier in the file"}
                                    >
                                      <Copy size={11} /> {r.dup === "existing" ? "Exists" : "Repeat"}
                                    </span>
                                  ) : bad ? (
                                    <span className="text-[11.5px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>
                                      Fix
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--color-green-deep)" }}>
                                      <Check size={12} /> OK
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 align-top">
                                  <button
                                    type="button"
                                    onClick={() => dropRow(r.key)}
                                    aria-label={`Remove row ${r.sheetRow}`}
                                    title="Remove this row"
                                    className={`grid size-6 place-items-center rounded-md text-altus-red hover:bg-altus-red hover:text-white ${FOCUS_RING}`}
                                  >
                                    <Trash2 size={12} strokeWidth={2.4} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {dupCount > 0 && (
                      <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                        Duplicates are unticked by default. Rename them in the Goal box to make them unique, tick to import anyway, or remove the row.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-hairline)" }}>
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
