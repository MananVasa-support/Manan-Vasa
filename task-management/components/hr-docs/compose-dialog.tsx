"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Send, Mail, PenLine, Loader2, UserRound, UserPlus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  resolveMerge,
  applyMerge,
  formatMergeDate,
  MERGE_FIELDS,
  type EmployeeMergeSource,
} from "@/lib/hr-docs/merge";
import { getDocType } from "@/lib/hr-docs/types";
import { composeDocument, issueDocument, type TemplateRow } from "@/app/(app)/hr-docs/actions";
import { DocFrame } from "@/components/hr-docs/doc-frame";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Roster shape the compose form + preview need (FK names pre-resolved server-side). */
export interface HrDocEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  reportingManager: string;
  joiningDate: string;
}

/** Tokens the merge engine fills from the employee row / sensible defaults. */
const AUTO_TOKENS = new Set([
  "name",
  "firstName",
  "email",
  "department",
  "designation",
  "reportingManager",
  "joiningDate",
  "date",
  "company",
]);

const FIELD_META = new Map(MERGE_FIELDS.map((f) => [f.token, f]));

function humanize(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Unique {{tokens}} in body order. */
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
 * Compose dialog — pick the recipient (employee, or a pre-hire candidate for
 * recruitment letters), fill the template's {{merge}} fields, watch the letter
 * recompute live, then Issue (compose → issue). Structured CTC letters are built
 * in the CTC workbench, so this dialog explains that instead of a merge form.
 */
export function ComposeDialog({
  template,
  roster,
  hrName,
  onClose,
}: {
  template: TemplateRow;
  roster: HrDocEmployee[];
  hrName: string;
  onClose: () => void;
}) {
  const docType = getDocType(template.typeKey);
  const structured = template.content === "structured";
  const isRecruitment = template.category === "recruitment";

  const [mode, setMode] = useState<"employee" | "candidate">(isRecruitment ? "candidate" : "employee");
  const [employeeId, setEmployeeId] = useState("");
  const [candName, setCandName] = useState("");
  const [candEmail, setCandEmail] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const emp = useMemo(() => roster.find((e) => e.id === employeeId), [roster, employeeId]);

  const bodyTokens = useMemo(() => tokensInBody(template.bodyMd), [template.bodyMd]);

  // The fully-resolved map that both the preview and the "auto value" hints read.
  const resolvedMap = useMemo(() => {
    const source: EmployeeMergeSource =
      mode === "employee" && emp
        ? { name: emp.name, email: emp.email, department: emp.department }
        : { name: candName, email: candEmail };
    const extra: Record<string, string> = { date: formatMergeDate(new Date()) };
    if (hrName) extra.hrName = hrName;
    if (mode === "employee" && emp) {
      if (emp.designation) extra.designation = emp.designation;
      if (emp.reportingManager) extra.reportingManager = emp.reportingManager;
      if (emp.joiningDate) extra.joiningDate = emp.joiningDate;
    }
    // Typed non-empty overrides win.
    for (const [k, v] of Object.entries(values)) if (v.trim()) extra[k] = v;
    return resolveMerge(source, extra);
  }, [mode, emp, candName, candEmail, hrName, values]);

  const previewBody = useMemo(() => applyMerge(template.bodyMd, resolvedMap), [template.bodyMd, resolvedMap]);

  // In-window editable letter body (WYSIWYG on the resolved text). It tracks the
  // auto-resolved content until HR hand-edits it; from then on their wording wins
  // and is what gets frozen + issued. "Reset to auto" re-syncs to the template.
  const [editedBody, setEditedBody] = useState(previewBody);
  const [bodyDirty, setBodyDirty] = useState(false);
  useEffect(() => {
    if (!bodyDirty) setEditedBody(previewBody);
  }, [previewBody, bodyDirty]);

  // Esc to close; lock body scroll while open.
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

  function set(token: string, v: string) {
    setValues((prev) => ({ ...prev, [token]: v }));
  }

  const recipientReady =
    mode === "employee" ? Boolean(employeeId) : candName.trim().length > 0;

  async function onIssue() {
    if (structured) return;
    if (!recipientReady) {
      fireToast({ message: mode === "employee" ? "Pick an employee first." : "Enter the candidate's name.", type: "error" });
      return;
    }
    setBusy(true);
    try {
      // Only send non-empty typed values — empty falls back to server auto-resolve.
      const mergeValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) mergeValues[k] = v.trim();

      const composed = await composeDocument({
        typeKey: template.typeKey,
        employeeId: mode === "employee" ? employeeId : undefined,
        candidate:
          mode === "candidate"
            ? { name: candName.trim(), email: candEmail.trim() || undefined }
            : undefined,
        mergeValues,
        // The inline-edited letter body is the source of truth for this document.
        bodyMd: editedBody,
      });
      if (!composed.ok) {
        fireToast({ message: composed.error, type: "error" });
        return;
      }
      const issued = await issueDocument({ instanceId: composed.instanceId });
      if (!issued.ok) {
        fireToast({ message: issued.error, type: "error" });
        return;
      }
      const msg = issued.emailed
        ? "Emailed to the recipient."
        : issued.signatureId
          ? "Issued — sent for signature."
          : "Issued.";
      setDone(msg);
      fireToast({ message: msg });
    } finally {
      setBusy(false);
    }
  }

  const trig = docType?.trigger ?? template.trigger;
  const IssueIcon = trig === "email" ? Mail : docType?.signature === "esign" ? PenLine : Send;
  const issueLabel = trig === "email" ? "Issue & email" : docType?.signature === "esign" ? "Issue for signature" : "Issue";

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
        aria-label={`Compose ${template.title}`}
        className="my-8 max-md:my-0 w-full max-w-[1080px] overflow-hidden rounded-2xl bg-surface-card max-md:rounded-none"
        style={{ boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6), inset 0 0 0 1px var(--color-hairline)" }}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
              Compose
            </span>
            <h2
              className="truncate text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}
            >
              {template.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <TagRow trigger={trig} signature={docType?.signature ?? template.signature} content={template.content} />
            <button
              type="button"
              onClick={() => !busy && onClose()}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong"
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* form pane */}
          <div className="hrdocs-form max-h-[72vh] overflow-y-auto border-b border-hairline p-5 lg:border-b-0 lg:border-r">
            {structured ? (
              <div className="rounded-xl border border-hairline bg-surface-muted p-4 text-[13.5px] leading-relaxed text-ink-muted">
                <p className="font-semibold text-ink-strong">This is a structured Compensation letter.</p>
                <p className="mt-1.5">
                  CTC breakups are built and versioned in the Compensation workbench (basic, HRA,
                  allowances, net, growth journey) — not from a merge form. Open the employee&apos;s
                  Compensation tab to author and issue it.
                </p>
              </div>
            ) : (
              <>
                {/* recipient */}
                {isRecruitment && (
                  <div className="mb-4 inline-flex rounded-lg p-0.5" style={{ background: "var(--color-surface-muted)" }}>
                    <ModeBtn active={mode === "candidate"} onClick={() => setMode("candidate")} Icon={UserPlus} label="Candidate" />
                    <ModeBtn active={mode === "employee"} onClick={() => setMode("employee")} Icon={UserRound} label="Employee" />
                  </div>
                )}

                {mode === "employee" ? (
                  <Field label="Employee">
                    <select className="ui-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} autoFocus>
                      <option value="">— select an employee —</option>
                      {roster.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                          {e.designation ? ` · ${e.designation}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5">
                    <Field label="Candidate name">
                      <input className="ui-input" value={candName} onChange={(e) => setCandName(e.target.value)} placeholder="Full name" autoFocus />
                    </Field>
                    <Field label={`Candidate email${trig === "email" ? " (required to send)" : " (optional)"}`}>
                      <input className="ui-input" type="email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="name@example.com" />
                    </Field>
                  </div>
                )}

                {/* merge fields */}
                {bodyTokens.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                      Fields
                    </h3>
                    <div className="grid grid-cols-1 gap-3.5">
                      {bodyTokens.map((token) => {
                        const meta = FIELD_META.get(token);
                        const auto = AUTO_TOKENS.has(token);
                        const autoVal = resolvedMap[token] ?? "";
                        return (
                          <Field key={token} label={meta?.label ?? humanize(token)} hint={meta?.hint}>
                            <input
                              className="ui-input"
                              value={values[token] ?? ""}
                              onChange={(e) => set(token, e.target.value)}
                              placeholder={
                                auto
                                  ? autoVal
                                    ? `Auto: ${autoVal}`
                                    : "Auto-filled on issue"
                                  : meta?.hint ?? humanize(token)
                              }
                            />
                          </Field>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-[11.5px] leading-snug text-ink-subtle">
                      Blank auto-fields are resolved from the employee record when issued. Type to override.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {/* editor + preview pane */}
          <div className="max-h-[72vh] overflow-y-auto bg-surface-muted p-5">
            {structured ? (
              <>
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Live preview
                </span>
                <DocFrame
                  title={template.title}
                  body={previewBody}
                  content={template.content}
                  signature={docType?.signature ?? template.signature}
                  recipientName={resolvedMap.name ?? ""}
                  hrName={hrName}
                  date={resolvedMap.date ?? ""}
                />
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Letter content · edit anything
                  </span>
                  {bodyDirty && (
                    <button
                      type="button"
                      onClick={() => { setBodyDirty(false); setEditedBody(previewBody); }}
                      className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted hover:text-ink-strong"
                    >
                      <PenLine size={11} strokeWidth={2.6} /> Reset to auto
                    </button>
                  )}
                </div>
                <textarea
                  className="hrdocs-bodyedit"
                  value={editedBody}
                  onChange={(e) => { setBodyDirty(true); setEditedBody(e.target.value); }}
                  spellCheck
                  placeholder="The letter body — type freely to add, remove or reword anything for this document."
                />
                <p className="mb-3 mt-1.5 text-[11.5px] leading-snug text-ink-subtle">
                  Fill the fields on the left to auto-draft, then edit the wording here. What you type is exactly what gets issued.
                </p>

                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Live preview
                </span>
                <DocFrame
                  title={template.title}
                  body={editedBody}
                  content={template.content}
                  signature={docType?.signature ?? template.signature}
                  recipientName={resolvedMap.name ?? ""}
                  hrName={hrName}
                  date={resolvedMap.date ?? ""}
                />
              </>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="min-w-0 truncate text-[12.5px] font-medium text-ink-muted">
            {done ? <span style={{ color: ACCENT_DEEP }}>{done}</span> : structured ? "Compensation letters are issued from the CTC workbench." : "Issuing freezes the edited letter above onto this document."}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              className="rounded-md border border-hairline-strong bg-surface-card px-4 py-2 text-[13.5px] font-semibold text-ink-strong hover:border-ink-soft"
            >
              {done ? "Close" : "Cancel"}
            </button>
            {!structured && !done && (
              <button
                type="button"
                onClick={onIssue}
                disabled={busy || !recipientReady}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <IssueIcon size={15} strokeWidth={2.4} />}
                {busy ? "Issuing…" : issueLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .hrdocs-form .ui-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 8px 10px;
          font-size: 13.5px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .hrdocs-form .ui-input:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 18%, transparent);
        }
        .hrdocs-bodyedit {
          width: 100%;
          min-height: 34vh;
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
          tab-size: 2;
        }
        .hrdocs-bodyedit:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 16%, transparent);
        }
      `}</style>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function ModeBtn({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: typeof UserRound; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition"
      style={active ? { background: "var(--color-surface-card)", color: "var(--color-ink-strong)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" } : { color: "var(--color-ink-muted)" }}
    >
      <Icon size={14} strokeWidth={2.4} /> {label}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}

function TagRow({ trigger, signature, content }: { trigger: string; signature: string; content: string }) {
  const tags = [triggerLabel(trigger), signatureLabel(signature), contentLabel(content)].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap items-center gap-1 max-md:hidden">
      {tags.map((t) => (
        <span key={t} className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function triggerLabel(t: string): string | null {
  return t === "email" ? "Email" : t === "request" ? "Request" : "Issued";
}
function signatureLabel(s: string): string | null {
  return s === "esign" ? "E-sign" : s === "acknowledge" ? "Acknowledge" : null;
}
function contentLabel(c: string): string | null {
  return c === "certificate" ? "Certificate" : c === "structured" ? "Structured" : null;
}
