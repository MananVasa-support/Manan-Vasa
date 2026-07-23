"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Download, Loader2, RefreshCw, PenLine, Coins } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { listEmployeeDocuments, type DocumentStatusRow } from "@/app/(app)/hr-docs/actions";
import { getDocumentDownloadUrl } from "@/app/(app)/hr-docs/download-actions";
import { CtcWorkbench } from "@/components/hr-docs/ctc-editor";
import type { HrDocEmployee } from "@/components/hr-docs/compose-dialog";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * Per-employee list of issued HR documents with a status pill + download link.
 * Self-fetching so it drops straight into the dossier (or the /hr-docs self view)
 * with just an employeeId. Visibility is enforced server-side (owner or admin).
 */
export function EmployeeDocuments({
  employeeId,
  isAdmin = false,
  title = "Issued documents",
  employee,
}: {
  employeeId: string;
  isAdmin?: boolean;
  title?: string;
  /** When provided (admin views), enables the CTC compensation workbench entry. */
  employee?: HrDocEmployee;
}) {
  const [rows, setRows] = useState<DocumentStatusRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [ctcOpen, setCtcOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await listEmployeeDocuments(employeeId);
    if (!res.ok) {
      setError(res.error);
      setRows([]);
      return;
    }
    setRows(res.documents);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(id: string) {
    setDownloading(id);
    try {
      const res = await getDocumentDownloadUrl(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5 max-md:p-4">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em" }}>
          <FileText size={16} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} /> {title}
        </h3>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCtcOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong hover:border-ink-soft"
            >
              <Coins size={13} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} /> Compensation
            </button>
          )}
          <button
            type="button"
            onClick={() => { setRows(null); void load(); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-muted hover:text-ink-strong"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={2.3} />
          </button>
        </div>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 py-8 text-[13.5px] font-medium text-ink-muted">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="py-6 text-[13.5px] font-medium text-ink-muted">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-[13.5px] font-medium text-ink-muted">
          {isAdmin ? "No documents have been issued to this person yet." : "You have no issued documents yet."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-ink-strong">{d.title}</div>
                <div className="mt-0.5 text-[11.5px] font-medium text-ink-soft">
                  {d.issuedAt ? `Issued ${fmtDate(d.issuedAt)}` : `Drafted ${fmtDate(d.createdAt)}`}
                  {d.emailedAt ? " · Emailed" : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <StatusPill status={d.status} signature={d.signature} signatureStatus={d.signatureStatus} />
                {d.signature === "esign" && d.signatureStatus !== "signed" && d.status !== "draft" && (
                  <a
                    href={`/documents/sign?kind=${d.category === "appointment" ? "agreement" : "letter"}&doc=${d.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-white"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                  >
                    <PenLine size={13} strokeWidth={2.4} /> Sign
                  </a>
                )}
                {d.renderedPdfPath && (
                  <button
                    type="button"
                    onClick={() => download(d.id)}
                    disabled={downloading === d.id}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-50"
                  >
                    {downloading === d.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={2.3} />}
                    PDF
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {ctcOpen && (
        <CtcWorkbench
          fixedEmployee={employee}
          fixedEmployeeId={employeeId}
          onClose={() => {
            setCtcOpen(false);
            setRows(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}

/** Effective lifecycle label — e-sign status wins for signable documents. */
function StatusPill({ status, signature, signatureStatus }: { status: string; signature: string; signatureStatus: string | null }) {
  let label = "Draft";
  let color = "#6b7280";
  let bg = "rgba(107,114,128,0.12)";

  if (signature === "esign" && signatureStatus) {
    if (signatureStatus === "signed") { label = "Signed"; color = "#047857"; bg = "rgba(4,120,87,0.12)"; }
    else if (signatureStatus === "verified") { label = "Verified"; color = "#047857"; bg = "rgba(4,120,87,0.12)"; }
    else { label = "Awaiting signature"; color = "#B45309"; bg = "rgba(180,83,9,0.12)"; }
  } else if (status === "signed") { label = "Signed"; color = "#047857"; bg = "rgba(4,120,87,0.12)"; }
  else if (status === "acknowledged") { label = "Acknowledged"; color = "#047857"; bg = "rgba(4,120,87,0.12)"; }
  else if (status === "sent") { label = "Sent"; color = ACCENT_DEEP; bg = "rgba(168,4,0,0.10)"; }
  else { label = "Draft"; }

  return (
    <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color, background: bg }}>
      {label}
    </span>
  );
}
