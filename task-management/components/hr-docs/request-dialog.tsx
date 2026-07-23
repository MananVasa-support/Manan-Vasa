"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Send, Inbox, CalendarDays, LogOut } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { resolveMerge, applyMerge, formatMergeDate, MERGE_FIELDS } from "@/lib/hr-docs/merge";
import { submitRequest } from "@/app/(app)/hr-docs/actions";
import { DocFrame } from "@/components/hr-docs/doc-frame";
import { EmployeeDocuments } from "@/components/hr-docs/employee-documents";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** The minimal request-template shape the self-service flow needs. */
export interface RequestTemplate {
  typeKey: string;
  title: string;
  bodyMd: string;
}

/** Employee identity for the request preview (their own record). */
export interface RequestUser {
  name: string;
  email: string;
  department: string;
  designation: string;
}

const FIELD_META = new Map(MERGE_FIELDS.map((f) => [f.token, f]));

/** Tokens auto-resolved from the employee record — shown as read-only hints. */
const AUTO_TOKENS = new Set(["name", "firstName", "email", "department", "designation", "date", "company"]);

function humanize(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function tokensInBody(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const t = m[1]!;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Self-service HR requests panel — the employee-initiated end of the letters
 * program (category F). Leave / resignation requests compose with the employee
 * as the recipient and flow to HR (who see them in the person's document list).
 * Bundles the request launcher above the employee's own issued documents and
 * refreshes the list after a submission.
 */
export function SelfDocsPanel({
  employeeId,
  user,
  requestTemplates,
}: {
  employeeId: string;
  user: RequestUser;
  requestTemplates: RequestTemplate[];
}) {
  const [active, setActive] = useState<RequestTemplate | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5">
      {requestTemplates.length > 0 && (
        <section className="rounded-2xl border border-hairline bg-surface-card p-5 max-md:p-4">
          <div className="mb-1 flex items-center gap-2">
            <Inbox size={16} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} />
            <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 16 }}>
              Raise a request
            </h3>
          </div>
          <p className="mb-3.5 text-[13px] font-medium text-ink-muted">
            Submit a formal request to HR. It is recorded to your document file and reviewed by the HR desk.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {requestTemplates.map((t) => (
              <button
                key={t.typeKey}
                type="button"
                onClick={() => setActive(t)}
                className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-surface-card px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition hover:border-ink-soft hover:shadow-sm"
              >
                {t.typeKey === "resignation_request" ? (
                  <LogOut size={15} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} />
                ) : (
                  <CalendarDays size={15} strokeWidth={2.3} style={{ color: ACCENT_DEEP }} />
                )}
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <EmployeeDocuments key={refreshKey} employeeId={employeeId} isAdmin={false} />

      {active && (
        <RequestDialog
          template={active}
          user={user}
          onClose={() => setActive(null)}
          onSubmitted={() => {
            setActive(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

/** The request compose dialog — fill the request body's fields + live preview. */
export function RequestDialog({
  template,
  user,
  onClose,
  onSubmitted,
}: {
  template: RequestTemplate;
  user: RequestUser;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const bodyTokens = useMemo(() => tokensInBody(template.bodyMd), [template.bodyMd]);

  const resolvedMap = useMemo(() => {
    const extra: Record<string, string> = { date: formatMergeDate(new Date()) };
    if (user.designation) extra.designation = user.designation;
    for (const [k, v] of Object.entries(values)) if (v.trim()) extra[k] = v;
    return resolveMerge(
      { name: user.name, email: user.email, department: user.department },
      extra,
    );
  }, [user, values]);

  const previewBody = useMemo(() => applyMerge(template.bodyMd, resolvedMap), [template.bodyMd, resolvedMap]);

  // In-window editable request body — tracks the auto-draft until hand-edited.
  const [editedBody, setEditedBody] = useState(previewBody);
  const [bodyDirty, setBodyDirty] = useState(false);
  useEffect(() => {
    if (!bodyDirty) setEditedBody(previewBody);
  }, [previewBody, bodyDirty]);

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

  async function submit() {
    setBusy(true);
    try {
      const mergeValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) mergeValues[k] = v.trim();
      const res = await submitRequest({ typeKey: template.typeKey, mergeValues, bodyMd: editedBody });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Request submitted to HR." });
      onSubmitted();
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
        aria-label={`Request ${template.title}`}
        className="my-8 max-md:my-0 w-full max-w-[980px] overflow-hidden rounded-2xl bg-surface-card max-md:rounded-none"
        style={{ boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6), inset 0 0 0 1px var(--color-hairline)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Request</span>
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}>
              {template.title}
            </h2>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="reqdocs-form max-h-[70vh] overflow-y-auto border-b border-hairline p-5 lg:border-b-0 lg:border-r">
            {bodyTokens.length === 0 ? (
              <p className="text-[13px] text-ink-muted">This request has no fields to fill — review the preview and submit.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {bodyTokens.map((token) => {
                  const meta = FIELD_META.get(token);
                  const auto = AUTO_TOKENS.has(token);
                  const autoVal = resolvedMap[token] ?? "";
                  return (
                    <label key={token} className="block">
                      <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                        {meta?.label ?? humanize(token)}
                      </span>
                      <input
                        className="ui-input"
                        value={values[token] ?? ""}
                        onChange={(e) => setValues((prev) => ({ ...prev, [token]: e.target.value }))}
                        placeholder={auto ? (autoVal ? `Auto: ${autoVal}` : "Auto-filled") : meta?.hint ?? humanize(token)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto bg-surface-muted p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Request content · edit anything</span>
              {bodyDirty && (
                <button
                  type="button"
                  onClick={() => { setBodyDirty(false); setEditedBody(previewBody); }}
                  className="rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted hover:text-ink-strong"
                >
                  Reset to auto
                </button>
              )}
            </div>
            <textarea
              className="reqdocs-bodyedit"
              value={editedBody}
              onChange={(e) => { setBodyDirty(true); setEditedBody(e.target.value); }}
              spellCheck
              placeholder="Your request — type freely to reword anything before submitting."
            />
            <p className="mb-3 mt-1.5 text-[11.5px] leading-snug text-ink-subtle">
              Fill the fields to auto-draft, then edit the wording here. What you type is exactly what HR receives.
            </p>

            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Live preview</span>
            <DocFrame
              title={template.title}
              body={editedBody}
              content="text"
              signature="none"
              recipientName={resolvedMap.name ?? ""}
              date={resolvedMap.date ?? ""}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="truncate text-[12.5px] font-medium text-ink-muted">Submitting records this request to your HR document file.</p>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => !busy && onClose()} className="rounded-md border border-hairline-strong bg-surface-card px-4 py-2 text-[13.5px] font-semibold text-ink-strong hover:border-ink-soft">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.4} />}
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .reqdocs-form .ui-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 8px 10px;
          font-size: 13.5px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .reqdocs-form .ui-input:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 18%, transparent);
        }
        .reqdocs-bodyedit {
          width: 100%;
          min-height: 30vh;
          resize: vertical;
          border-radius: 10px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 14px 16px;
          font-family: var(--font-display), Georgia, "Times New Roman", serif;
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-ink-strong);
          outline: none;
          white-space: pre-wrap;
        }
        .reqdocs-bodyedit:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 16%, transparent);
        }
      `}</style>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
