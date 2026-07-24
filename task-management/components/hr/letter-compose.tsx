"use client";

import { useState } from "react";
import { X, Send, Loader2, PenLine } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * A fresh, SELF-CONTAINED letter compose dialog — imports nothing from the
 * hr-docs graph (the old ComposeDialog + actions chain hangs webpack). Takes
 * plain data props and does compose+issue via the /api/hr-docs endpoints.
 *
 * Pick recipient → edit the body inline (WYSIWYG on the resolved text) → issue.
 */
const RED = "#E10600";
const RED_DEEP = "#A80400";

export interface ComposeTemplate {
  typeKey: string;
  title: string;
  bodyMd: string;
  content: string; // "text" | "structured" | "certificate"
}
export interface ComposeEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  reportingManager: string;
  joiningDate: string;
}

function applyMerge(body: string, map: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, t: string) => map[t] ?? "");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, error: `Request failed (${r.status})` } as T;
  return (await r.json()) as T;
}

export function LetterCompose({
  template,
  roster,
  hrName,
  onClose,
}: {
  template: ComposeTemplate;
  roster: ComposeEmployee[];
  hrName: string;
  onClose: () => void;
}) {
  const structured = template.content === "structured";
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const emp = roster.find((e) => e.id === employeeId);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const map: Record<string, string> = {
    name: emp?.name ?? "",
    firstName: emp?.name?.split(/\s+/)[0] ?? "",
    email: emp?.email ?? "",
    department: emp?.department ?? "",
    designation: emp?.designation ?? "",
    reportingManager: emp?.reportingManager ?? "",
    joiningDate: emp?.joiningDate ?? "",
    date: today,
    company: "Altus Corp",
    hrName,
  };

  const [body, setBody] = useState(template.bodyMd);
  const [dirty, setDirty] = useState(false);
  const resolved = applyMerge(dirty ? body : template.bodyMd, map);
  // Keep the editor synced to the auto-resolved text until HR hand-edits it.
  const shown = dirty ? body : resolved;

  async function issue() {
    if (structured) return;
    if (!employeeId) {
      fireToast({ message: "Pick an employee first.", type: "error" });
      return;
    }
    setBusy(true);
    try {
      const composed = await postJson<{ ok: true; instanceId: string } | { ok: false; error: string }>(
        "/api/hr-docs/compose",
        { typeKey: template.typeKey, employeeId, bodyMd: shown },
      );
      if (!composed.ok) {
        fireToast({ message: composed.error, type: "error" });
        return;
      }
      const issued = await postJson<{ ok: true; emailed: boolean } | { ok: false; error: string }>(
        "/api/hr-docs/issue",
        { instanceId: composed.instanceId },
      );
      if (!issued.ok) {
        fireToast({ message: issued.error, type: "error" });
        return;
      }
      const msg = issued.emailed ? "Emailed to the recipient." : "Issued.";
      setDone(msg);
      fireToast({ message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-4 max-md:p-0"
      style={{ background: "rgba(10,10,12,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="my-8 max-md:my-0 w-full max-w-[1000px] overflow-hidden rounded-2xl bg-white max-md:rounded-none" style={{ boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6)" }}>
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Compose</span>
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20 }}>{template.title}</h2>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {structured ? (
          <div className="p-6 text-[14px] text-ink-muted">
            This is a structured Compensation letter — build it from the CTC workbench in the Letter Library.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            {/* form pane */}
            <div className="max-h-[70vh] overflow-y-auto border-b border-hairline p-5 lg:border-b-0 lg:border-r">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Employee</span>
                <select
                  className="w-full rounded-md border border-hairline-strong bg-white px-2.5 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  autoFocus
                >
                  <option value="">— select an employee —</option>
                  {roster.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ""}</option>
                  ))}
                </select>
              </label>
              <p className="mt-4 text-[12.5px] leading-snug text-ink-subtle">
                The letter auto-fills from the employee record. Edit the wording on the right — what you type is exactly what gets issued.
              </p>
            </div>

            {/* editor + preview */}
            <div className="max-h-[70vh] overflow-y-auto bg-surface-muted p-5">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Letter content · edit anything</span>
              <textarea
                className="w-full rounded-[10px] border border-hairline-strong bg-white p-4 text-[14px] leading-relaxed text-ink-strong outline-none focus:border-altus-red"
                style={{ minHeight: "42vh", fontFamily: "var(--font-display), Georgia, serif", whiteSpace: "pre-wrap" }}
                value={shown}
                onChange={(e) => { setDirty(true); setBody(e.target.value); }}
                spellCheck
              />
            </div>
          </div>
        )}

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="min-w-0 truncate text-[12.5px] font-medium text-ink-muted">
            {done ? <span style={{ color: RED_DEEP }}>{done}</span> : "Issuing freezes the edited letter onto this document."}
          </p>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => !busy && onClose()} className="rounded-md border border-hairline-strong bg-white px-4 py-2 text-[13.5px] font-semibold text-ink-strong hover:border-ink-soft">
              {done ? "Close" : "Cancel"}
            </button>
            {!structured && !done && (
              <button type="button" onClick={issue} disabled={busy || !employeeId} className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />}
                {busy ? "Issuing…" : "Issue"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
