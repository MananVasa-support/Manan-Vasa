"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Save, Loader2, Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { applyMerge, resolveMerge, formatMergeDate, MERGE_FIELDS } from "@/lib/hr-docs/merge";
import { getDocType } from "@/lib/hr-docs/types";
import { saveTemplateBody, type TemplateRow } from "@/app/(app)/hr-docs/actions";
import { DocFrame } from "@/components/hr-docs/doc-frame";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Sample values so the editor preview reads like a real letter. */
const SAMPLE = {
  name: "Aarav Sharma",
  designation: "Senior Associate",
  department: "Operations",
  reportingManager: "Manan Vasa",
  email: "aarav@altuscorp.in",
  joiningDate: formatMergeDate(new Date()),
  place: "Ahmedabad",
  ctc: "6,00,000",
  probationMonths: "6",
  noticePeriod: "30 days",
  hrName: "HR Desk",
};

/**
 * Template editor (admin) — edit a template's {{merge}} BODY with a click-to-insert
 * field palette; the fixed Altus frame + signature model stay locked. Saves via
 * saveTemplateBody. A sample-data preview shows the frame around the body.
 */
export function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow;
  onClose: () => void;
  onSaved?: (t: TemplateRow) => void;
}) {
  const docType = getDocType(template.typeKey);
  const [body, setBody] = useState(template.bodyMd);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const dirty = body !== template.bodyMd;

  const previewBody = useMemo(() => {
    const map = resolveMerge({ name: SAMPLE.name, email: SAMPLE.email, department: SAMPLE.department }, SAMPLE);
    return applyMerge(body, map);
  }, [body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  /** Insert {{token}} at the caret. */
  function insertToken(token: string) {
    const ta = taRef.current;
    const snippet = `{{${token}}}`;
    if (!ta) {
      setBody((b) => b + snippet);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function onSave() {
    setBusy(true);
    try {
      const res = await saveTemplateBody({ typeKey: template.typeKey, bodyMd: body });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Template saved." });
      onSaved?.(res.template);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 max-md:p-0"
      style={{ background: "rgba(10,10,12,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${template.title} template`}
        className="my-8 max-md:my-0 w-full max-w-[1080px] overflow-hidden rounded-2xl bg-surface-card max-md:rounded-none"
        style={{ boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6), inset 0 0 0 1px var(--color-hairline)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Edit template body</span>
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}>
              {template.title}
            </h2>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* editor */}
          <div className="border-b border-hairline p-5 lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-muted">
              Edit the body only — the Altus letterhead, {docType?.signature === "esign" ? "e-sign" : docType?.signature === "acknowledge" ? "acknowledgement" : "signature"} block and frame are fixed. Click a field to insert it at the cursor.
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.token}
                  type="button"
                  onClick={() => insertToken(f.token)}
                  title={f.hint}
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold transition hover:brightness-95"
                  style={{ background: `${ACCENT}12`, color: ACCENT_DEEP }}
                >
                  <Plus size={11} strokeWidth={2.8} /> {f.label}
                </button>
              ))}
            </div>

            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
              className="w-full rounded-lg border border-hairline-strong bg-surface-card p-3 font-mono text-[12.5px] leading-relaxed text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
              style={{ minHeight: 360, resize: "vertical" }}
              placeholder="Write the letter body. Use {{name}}, {{designation}}, … for merge fields."
            />
          </div>

          {/* preview */}
          <div className="max-h-[72vh] overflow-y-auto bg-surface-muted p-5">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Preview (sample data)</span>
            <DocFrame
              title={template.title}
              body={previewBody}
              content={template.content}
              signature={docType?.signature ?? template.signature}
              recipientName={SAMPLE.name}
              hrName={SAMPLE.hrName}
              date={formatMergeDate(new Date())}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="truncate text-[12.5px] font-medium text-ink-muted">
            {dirty ? "Unsaved changes" : "Body matches the saved template."}
          </p>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => !busy && onClose()} className="rounded-md border border-hairline-strong bg-surface-card px-4 py-2 text-[13.5px] font-semibold text-ink-strong hover:border-ink-soft">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy || !dirty}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.3} />}
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
