"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { previewTaskImport, commitTaskImport } from "@/app/(app)/tasks/import-actions";
import type { ImportPreview } from "@/lib/import/task-import";
import { fireToast } from "@/lib/toast";

const TEMPLATE =
  "Client,Subject,Doer,Initiator,Priority,Due Date,Description,Notes,Tags\n" +
  "Acme Corp,Marketing,Riya Shah,Manan Vasa,Critical,2026-06-20,Prepare the Q3 campaign deck,Share internally first,deck;q3\n" +
  "Globex,Documentation,arjun@altus.in,Manan Vasa,Normal,2026-06-25,Collect signed agreements,,docs";

/**
 * Admin CSV/XLSX task importer. Upload → server parses + validates every row
 * (resolving Doer/Initiator names or emails to employees) → review the preview
 * with row-level errors → commit. Parsing is server-side, so the heavy
 * spreadsheet lib never ships to the browser.
 */
export function TaskImport() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [previewing, startPreview] = React.useTransition();
  const [committing, startCommit] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onPick(f: File | null) {
    setPreview(null);
    setFile(f);
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    startPreview(async () => {
      const result = await previewTaskImport(fd);
      setPreview(result);
      if (result.fatal) fireToast({ message: result.fatal, type: "error" });
    });
  }

  function commit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startCommit(async () => {
      const res = await commitTaskImport(fd);
      if (!res.ok) {
        fireToast({ message: res.error || "Import failed.", type: "error" });
        return;
      }
      fireToast({
        message: `Imported ${res.created} task${res.created === 1 ? "" : "s"}${
          res.skipped ? ` · ${res.skipped} skipped` : ""
        }.`,
      });
      router.push("/tasks" as Route);
    });
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1100px] w-full px-6 max-md:px-4 py-8">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 500, fontSize: 34, letterSpacing: "-0.02em" }}
          >
            Import tasks
          </h1>
          <p className="mt-1.5 text-ink-soft" style={{ fontSize: 15 }}>
            Upload a CSV or Excel file. Each row becomes one task. Doer &amp; Initiator
            match on employee name or email.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-card px-4 h-10 text-[14px] font-semibold text-ink-strong hover:bg-surface-soft transition-colors"
        >
          <Download size={15} strokeWidth={2.2} />
          Download template
        </button>
      </div>

      {/* Dropzone / picker */}
      <label
        className="flex flex-col items-center justify-center gap-2 rounded-section border-2 border-dashed border-hairline-strong bg-surface-soft px-6 py-10 cursor-pointer transition-colors hover:bg-surface-card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPick(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <span className="inline-flex items-center gap-2 text-ink-strong font-semibold">
            <FileSpreadsheet size={18} className="text-altus-red" />
            {file.name}
          </span>
        ) : (
          <>
            <Upload size={24} className="text-ink-subtle" strokeWidth={2} />
            <span className="text-[15px] font-semibold text-ink-strong">
              Drop a file here, or click to choose
            </span>
            <span className="text-[13px] text-ink-subtle">.csv or .xlsx · up to 500 rows</span>
          </>
        )}
        {previewing && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-subtle mt-1">
            <Loader2 size={14} className="animate-spin" /> Reading…
          </span>
        )}
      </label>

      {preview && !preview.fatal && (
        <>
          {/* Summary */}
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-green/10 text-green-deep px-3 py-1.5 text-[14px] font-bold">
              <Check size={15} strokeWidth={2.6} />
              {preview.validCount} ready
            </span>
            {preview.errorCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-red/10 text-red-deep px-3 py-1.5 text-[14px] font-bold">
                <AlertTriangle size={15} strokeWidth={2.4} />
                {preview.errorCount} with errors (skipped)
              </span>
            )}
            <span className="text-[13px] text-ink-subtle">{preview.totalRows} rows total</span>
          </div>

          {/* Preview table */}
          <div className="mt-4 rounded-section border border-hairline overflow-auto max-h-[55vh]">
            <table className="min-w-full text-[13.5px]">
              <thead className="sticky top-0 bg-surface-soft">
                <tr className="text-left text-ink-subtle">
                  <th className="px-3 py-2.5 font-bold">#</th>
                  <th className="px-3 py-2.5 font-bold">Client</th>
                  <th className="px-3 py-2.5 font-bold">Subject</th>
                  <th className="px-3 py-2.5 font-bold">Doer</th>
                  <th className="px-3 py-2.5 font-bold">Initiator</th>
                  <th className="px-3 py-2.5 font-bold">Priority</th>
                  <th className="px-3 py-2.5 font-bold">Due</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.rowNumber}
                    className="border-t border-hairline"
                    style={{ background: r.ok ? undefined : "var(--color-red-bg, #fef2f2)" }}
                  >
                    <td className="px-3 py-2 tabular-nums text-ink-subtle">{r.rowNumber}</td>
                    <td className="px-3 py-2 text-ink-strong font-semibold">{r.client || "—"}</td>
                    <td className="px-3 py-2 text-ink-muted">{r.subject || "—"}</td>
                    <td className="px-3 py-2">{r.doerName || "—"}</td>
                    <td className="px-3 py-2">{r.initiatorName || "—"}</td>
                    <td className="px-3 py-2">{r.priorityLabel}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.dueAt ? r.dueAt.slice(0, 10) : r.dueRaw || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-green-deep font-bold">
                          <Check size={14} strokeWidth={2.6} /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-red-deep font-semibold">
                          <X size={14} strokeWidth={2.6} className="mt-0.5 shrink-0" />
                          <span>{r.errors.join("; ")}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="px-5 py-2.5 rounded-chip text-[14px] font-semibold border border-hairline bg-surface-soft text-ink-strong"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={committing || preview.validCount === 0}
              className="inline-flex items-center gap-2 text-white px-6 py-3 rounded-chip text-[15px] font-bold transition-transform disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, rgb(225,6,0), rgb(168,4,0))", boxShadow: "0 6px 16px rgba(225,6,0,0.32)" }}
            >
              {committing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.4} />}
              {committing ? "Importing…" : `Import ${preview.validCount} task${preview.validCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
