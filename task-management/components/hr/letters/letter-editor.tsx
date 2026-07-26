"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  Send,
  Loader2,
  Printer,
  Check,
  Building2,
  UserPlus2,
  UserRound,
  Venus,
  SquarePen,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { Letterhead } from "@/components/hr/letterhead/letterhead";
import { ENTITY_LIST, getEntity, type EntityId } from "@/lib/hr/entities";
import {
  type LetterTemplate,
  type Block,
  type Span,
  type LetterSignature,
  collectFields,
  initialValues,
  tableRowVisible,
} from "@/lib/hr/letters/types";
import { templateToRichHtml } from "@/lib/hr/letters/rich";
import { applyPronouns, normalizeGender, type Gender } from "@/lib/hr/pronouns";
import {
  readCtcLetterPrefill,
  clearCtcLetterPrefill,
  ctcComponentsToLetterValues,
} from "@/lib/hr/ctc/local-store";
import { fireToast } from "@/lib/toast";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The "Edit freely" (Google-Docs) TipTap editor is a "use client" leaf that
 * imports the whole @tiptap graph. It is loaded ONLY through next/dynamic with
 * ssr:false so that graph never enters this module's server-render path — the
 * documented webpack-compile-hang guard. Never import it statically.
 */
const RichLetterEditor = dynamic(
  () => import("@/components/hr/letters/rich-letter-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="alw-rich-loading">
        <Loader2 size={20} className="alw-spin" />
        <span>Opening the free-edit editor…</span>
      </div>
    ),
  },
);

/** The signing-model options offered for a rich ("Edit freely") letter. */
const SIGNING_MODELS: { value: LetterSignature; label: string }[] = [
  { value: "none", label: "No signature" },
  { value: "acknowledge", label: "Acknowledge" },
  { value: "esign", label: "E-Sign (DigiLocker)" },
];

export interface LetterRosterOption {
  id: string;
  name: string;
  designation: string;
}

/** A submitted candidate the editor can quick-pick to seed the recipient name +
 *  pronoun gender (his/her, Mr./Ms., …). `gender` is the raw stored value. */
export interface LetterCandidateOption {
  id: string;
  name: string;
  gender: string;
}

/** Gender options for the toolbar selector. */
const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "neutral", label: "— (Mr./Ms.)" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

/**
 * The interactive letter page body. Renders the template on the shared
 * <Letterhead>, lets HR swap the paying entity (which swaps the logo + footer),
 * edit ONLY the red/editable fields inline (floating-label inputs), export a PDF,
 * or issue + archive the letter via the document flow. Keyboard-first: the first
 * field autofocuses; Tab walks the fields; the toolbar buttons are reachable and
 * carry their own shortcuts. NO framer-motion — CSS transitions only.
 */
export function LetterEditor({
  template,
  roster,
  candidates = [],
  isAdmin,
  initialCandidateId,
  initialEmployeeId,
}: {
  template: LetterTemplate;
  roster: LetterRosterOption[];
  candidates?: LetterCandidateOption[];
  isAdmin: boolean;
  /** Pre-seed the recipient from a candidate (e.g. `?candidate=<id>`). */
  initialCandidateId?: string;
  /**
   * Pre-select the Attach-employee (e.g. `?employee=<id>` from the CTC Workbench).
   * Also fills the name + designation fields and, for the CTC letter, the ₹
   * component figures from the Workbench pre-fill dropped in localStorage.
   */
  initialEmployeeId?: string;
}) {
  const fields = useMemo(() => collectFields(template), [template]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(template));
  const [entity, setEntity] = useState<EntityId>(template.entityDefault ?? "altus-corp");
  const [employeeId, setEmployeeId] = useState<string>("");
  // Candidate gender → resolves gendered tokens ({title}/{he}/{his}/…) live.
  const [gender, setGender] = useState<Gender>("neutral");
  const [candidateId, setCandidateId] = useState<string>("");
  const [busyPdf, setBusyPdf] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);

  // ── "Edit freely" (rich / Google-Docs) mode ──────────────────────
  const [richMode, setRichMode] = useState(false);
  // The frozen seed the TipTap editor loads. Kept stable while in rich mode so
  // swapping the paying entity re-brands the letterhead WITHOUT reseeding (and
  // thus wiping) the user's body edits.
  const [richSeed, setRichSeed] = useState<string>("");
  const richHtmlRef = useRef<string>("");
  const richGetHtmlRef = useRef<(() => string) | null>(null);
  const [richDirty, setRichDirty] = useState(false);
  const [signingModel, setSigningModel] = useState<LetterSignature>(
    () => template.signature ?? "none",
  );

  const firstFieldId = fields[0]?.id;

  // The field a picked candidate's name seeds: prefer "candidateName", then
  // "name", else the first field in the template.
  const nameFieldId = useMemo(() => {
    const byId = (id: string) => fields.find((fld) => fld.id === id)?.id;
    return byId("candidateName") ?? byId("name") ?? fields[0]?.id;
  }, [fields]);

  const setValue = useCallback((id: string, v: string) => {
    setValues((prev) => (prev[id] === v ? prev : { ...prev, [id]: v }));
    setIssued(false);
  }, []);

  /** Quick-pick a candidate: seed the recipient-name field + derive the pronoun
   *  gender from their intake. The manual Gender selector still overrides after. */
  const onPickCandidate = useCallback(
    (id: string) => {
      setCandidateId(id);
      const cand = candidates.find((c) => c.id === id);
      if (!cand) return;
      if (nameFieldId) setValue(nameFieldId, cand.name);
      setGender(normalizeGender(cand.gender));
    },
    [candidates, nameFieldId, setValue],
  );

  // Pre-seed from `?candidate=<id>` exactly once, when that candidate is loaded.
  // Runs the same quick-pick as the manual picker (name + pronoun gender).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !initialCandidateId) return;
    if (!candidates.some((c) => c.id === initialCandidateId)) return;
    seededRef.current = true;
    onPickCandidate(initialCandidateId);
  }, [initialCandidateId, candidates, onPickCandidate]);

  /** Attach an employee (from `?employee=<id>`): select them, fill the name +
   *  designation fields, and — for the CTC letter — merge the ₹ component figures
   *  the Workbench dropped in localStorage (mapped to the letter's field ids,
   *  zero components skipped). One-shot: the pre-fill is consumed + cleared. */
  const onSeedEmployee = useCallback(
    (id: string) => {
      const emp = roster.find((r) => r.id === id);
      if (!emp) return;
      setEmployeeId(id);
      const nameId =
        fields.find((fl) => fl.id === "employeeName")?.id ??
        fields.find((fl) => fl.id === "name")?.id ??
        fields.find((fl) => fl.id === "candidateName")?.id;
      const hasDesignation = fields.some((fl) => fl.id === "designation");
      const prefill = readCtcLetterPrefill();
      const applyPrefill = prefill && prefill.employeeId === id;
      const compValues = applyPrefill ? ctcComponentsToLetterValues(prefill.components) : {};
      setValues((prev) => {
        const next = { ...prev };
        if (nameId && emp.name) next[nameId] = emp.name;
        if (hasDesignation && emp.designation) next.designation = emp.designation;
        for (const [k, v] of Object.entries(compValues)) {
          if (fields.some((fl) => fl.id === k)) next[k] = v;
        }
        return next;
      });
      if (applyPrefill && prefill) {
        setEntity(prefill.entity);
        clearCtcLetterPrefill();
      }
      setIssued(false);
    },
    [roster, fields],
  );

  // Pre-select from `?employee=<id>` exactly once, when the roster is loaded.
  const seededEmpRef = useRef(false);
  useEffect(() => {
    if (seededEmpRef.current || !initialEmployeeId) return;
    if (!roster.some((r) => r.id === initialEmployeeId)) return;
    seededEmpRef.current = true;
    onSeedEmployee(initialEmployeeId);
  }, [initialEmployeeId, roster, onSeedEmployee]);

  /** The current rich HTML — prefer the editor's live getter, else the ref. */
  const currentRichHtml = useCallback(
    () => richGetHtmlRef.current?.() ?? richHtmlRef.current,
    [],
  );

  /** Enter "Edit freely": seed the TipTap editor from the current fields. */
  const enterRichMode = useCallback(() => {
    const seed = templateToRichHtml(template, values, entity, gender);
    setRichSeed(seed);
    richHtmlRef.current = seed;
    richGetHtmlRef.current = null;
    setRichDirty(false);
    setSigningModel(template.signature ?? "none");
    setIssued(false);
    setRichMode(true);
  }, [template, values, entity, gender]);

  /** Return to the structured field editor — confirm if there are free edits. */
  const backToFields = useCallback(() => {
    if (
      richDirty &&
      !window.confirm("Discard your free-edit changes and return to the field editor?")
    ) {
      return;
    }
    setRichMode(false);
    setRichDirty(false);
    setIssued(false);
  }, [richDirty]);

  const onRichChange = useCallback(
    (html: string) => {
      richHtmlRef.current = html;
      setIssued(false);
      setRichDirty((d) => d || html !== richSeed);
    },
    [richSeed],
  );

  const onRichReady = useCallback((getHtml: () => string) => {
    richGetHtmlRef.current = getHtml;
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    [],
  );

  const recipientName = (values.candidateName ?? values.name ?? "").trim();
  const recipientEmail = (values.candidateEmail ?? values.email ?? "").trim();

  async function exportPdf() {
    setBusyPdf(true);
    try {
      const payload = richMode
        ? { key: template.key, entity, gender, contentKind: "rich" as const, bodyHtml: currentRichHtml() }
        : { key: template.key, entity, gender, values, date: today };
      const r = await fetch("/api/hr/letters/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        fireToast({ message: `Could not export PDF (${r.status}).`, type: "error" });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.key}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      fireToast({ message: "Could not export PDF.", type: "error" });
    } finally {
      setBusyPdf(false);
    }
  }

  async function issue() {
    if (!isAdmin) return;
    if (!employeeId && !recipientName) {
      fireToast({ message: "Fill the recipient's name, or attach an employee.", type: "error" });
      return;
    }
    setIssuing(true);
    try {
      const url = richMode ? "/api/hr/letters/issue-rich" : "/api/hr/letters/issue";
      const payload = richMode
        ? {
            key: template.key,
            entity,
            gender,
            bodyHtml: currentRichHtml(),
            signingModel,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
          }
        : {
            key: template.key,
            entity,
            gender,
            values,
            employeeId: employeeId || undefined,
            candidateName: employeeId ? undefined : recipientName || undefined,
            candidateEmail: employeeId ? undefined : recipientEmail || undefined,
          };
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const res = (await r.json().catch(() => ({ ok: false }))) as
        | { ok: true }
        | { ok: false; error?: string };
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not issue the letter.", type: "error" });
        return;
      }
      setIssued(true);
      fireToast({ message: "Letter issued and archived." });
    } catch {
      fireToast({ message: "Could not issue the letter.", type: "error" });
    } finally {
      setIssuing(false);
    }
  }

  const ctx: RenderCtx = { values, setValue, firstFieldId, entity, today, gender };

  return (
    <div className="alw-wrap">
      <style>{EDITOR_CSS}</style>

      {/* ── Toolbar (does not print) ─────────────────────────────── */}
      <div className="alw-toolbar no-print">
        <label className="alw-pick">
          <Building2 size={15} strokeWidth={2.2} aria-hidden />
          <span className="alw-pick-label">Paying entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as EntityId)}
            aria-label="Paying entity"
          >
            {ENTITY_LIST.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>

        {isAdmin && candidates.length > 0 && (
          <label className="alw-pick">
            <UserRound size={15} strokeWidth={2.2} aria-hidden />
            <span className="alw-pick-label">Candidate</span>
            <select
              value={candidateId}
              onChange={(e) => onPickCandidate(e.target.value)}
              aria-label="Quick-pick a candidate (seeds name + gender)"
            >
              <option value="">— pick a candidate —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.gender ? ` · ${c.gender}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="alw-pick">
          <Venus size={15} strokeWidth={2.2} aria-hidden />
          <span className="alw-pick-label">Gender</span>
          <select
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as Gender);
              setIssued(false);
            }}
            aria-label="Gender (resolves his/her, Mr./Ms.)"
          >
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {isAdmin && roster.length > 0 && (
          <label className="alw-pick">
            <UserPlus2 size={15} strokeWidth={2.2} aria-hidden />
            <span className="alw-pick-label">Attach employee</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              aria-label="Attach to employee (optional)"
            >
              <option value="">— none (candidate letter) —</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.designation ? ` · ${r.designation}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {richMode && isAdmin && (
          <label className="alw-pick">
            <ShieldCheck size={15} strokeWidth={2.2} aria-hidden />
            <span className="alw-pick-label">Signing</span>
            <select
              value={signingModel}
              onChange={(e) => {
                setSigningModel(e.target.value as LetterSignature);
                setIssued(false);
              }}
              aria-label="Signing model"
            >
              {SIGNING_MODELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="alw-actions">
          {richMode ? (
            <button type="button" className="alw-btn alw-btn-ghost" onClick={backToFields}>
              <ArrowLeft size={15} strokeWidth={2.2} /> Back to fields
            </button>
          ) : (
            <button type="button" className="alw-btn alw-btn-edit" onClick={enterRichMode}>
              <SquarePen size={15} strokeWidth={2.2} /> Edit freely
            </button>
          )}
          <button type="button" className="alw-btn alw-btn-ghost" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2.2} /> Print
          </button>
          <button
            type="button"
            className="alw-btn alw-btn-ghost"
            onClick={exportPdf}
            disabled={busyPdf}
          >
            {busyPdf ? <Loader2 size={15} className="alw-spin" /> : <Download size={15} strokeWidth={2.2} />}
            {busyPdf ? "Exporting…" : "Export PDF"}
          </button>
          {isAdmin && (
            <button
              type="button"
              className="alw-btn alw-btn-primary"
              onClick={issue}
              disabled={issuing || issued}
            >
              {issued ? (
                <Check size={15} strokeWidth={2.6} />
              ) : issuing ? (
                <Loader2 size={15} className="alw-spin" />
              ) : (
                <Send size={15} strokeWidth={2.2} />
              )}
              {issued ? "Issued" : issuing ? "Issuing…" : "Issue letter"}
            </button>
          )}
        </div>
      </div>

      {/* ── The letter on its letterhead ─────────────────────────── */}
      {richMode ? (
        // "Edit freely" — the Google-Docs TipTap editor inside the frozen
        // letterhead. `entity` is live (re-brands the letterhead) while
        // `initialHtml` stays the frozen seed so the body edits survive an
        // entity swap.
        <RichLetterEditor
          entity={entity}
          initialHtml={richSeed}
          onChange={onRichChange}
          onReady={onRichReady}
        />
      ) : (
        <div className="alw-stage">
          <Letterhead entity={entity}>
            <div className="alw-date">{today}</div>
            {template.blocks.map((block, i) => (
              <BlockView key={i} block={block} ctx={ctx} />
            ))}
          </Letterhead>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Block + span rendering (mirrors the PDF renderer's structure)        */
/* ------------------------------------------------------------------ */

interface RenderCtx {
  values: Record<string, string>;
  setValue: (id: string, v: string) => void;
  firstFieldId?: string;
  entity: EntityId;
  today: string;
  gender: Gender;
}

function BlockView({ block, ctx }: { block: Block; ctx: RenderCtx }) {
  switch (block.kind) {
    case "spacer":
      return <div style={{ height: block.size === "lg" ? 22 : block.size === "sm" ? 6 : 12 }} />;
    case "heading": {
      const size = block.level === 1 ? 20 : block.level === 3 ? 14 : 16;
      return (
        <p
          className="alw-heading"
          style={{ fontSize: size }}
        >
          {applyPronouns(block.text, ctx.gender)}
        </p>
      );
    }
    case "paragraph":
      return (
        <p className="alw-p" style={{ textAlign: block.align === "center" ? "center" : "left" }}>
          <Spans spans={block.spans} ctx={ctx} />
        </p>
      );
    case "term":
      return (
        <p className="alw-p alw-term">
          <span className="alw-term-label">{applyPronouns(block.label, ctx.gender)}</span>
          <span className="alw-term-sep"> : </span>
          <Spans spans={block.value} ctx={ctx} />
        </p>
      );
    case "bullets":
      return (
        <ul className="alw-ul">
          {block.items.map((item, i) => (
            <li key={i}>
              <Spans spans={item} ctx={ctx} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return <TableView block={block} ctx={ctx} />;
    case "signature":
      return <SignatureView block={block} ctx={ctx} />;
  }
}

/**
 * A bordered table. The interactive editor shows ALL rows (so every component is
 * fillable); a "Hide empty rows" toggle previews the FINAL document, which drops
 * component rows whose per-month amount is blank/zero. Group rows span all
 * columns; total/grand rows carry their own weight. Fields inside cells stay
 * fully editable via the shared <Spans>.
 */
function TableView({
  block,
  ctx,
}: {
  block: Extract<Block, { kind: "table" }>;
  ctx: RenderCtx;
}) {
  const [hideEmpty, setHideEmpty] = useState(false);
  const rows = hideEmpty ? block.rows.filter((r) => tableRowVisible(r, ctx.values)) : block.rows;
  const cols = block.columns.length;
  return (
    <div className="alw-tablewrap">
      <div className="alw-table-toolbar no-print">
        <button
          type="button"
          className="alw-table-toggle"
          onClick={() => setHideEmpty((h) => !h)}
          aria-pressed={hideEmpty}
        >
          {hideEmpty ? "Show all rows" : "Hide empty rows"}
        </button>
      </div>
      <table className="alw-table">
        <thead>
          <tr>
            {block.columns.map((c, i) => (
              <th key={i} className={i === 0 ? "alw-th-left" : "alw-th-num"}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const kind = row.kind ?? "normal";
            if (kind === "group") {
              return (
                <tr key={ri} className="alw-tr-group">
                  <td colSpan={cols}>
                    <Spans spans={row.cells[0] ?? []} ctx={ctx} />
                  </td>
                </tr>
              );
            }
            const cls =
              kind === "grand" ? "alw-tr-grand" : kind === "total" ? "alw-tr-total" : "alw-tr";
            return (
              <tr key={ri} className={cls}>
                {Array.from({ length: cols }).map((_, ci) => (
                  <td key={ci} className={ci === 0 ? "alw-td-left" : "alw-td-num"}>
                    <Spans spans={row.cells[ci] ?? []} ctx={ctx} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignatureView({
  block,
  ctx,
}: {
  block: Extract<Block, { kind: "signature" }>;
  ctx: RenderCtx;
}) {
  const e = getEntity(ctx.entity);
  return (
    <div className="alw-sign">
      {block.forEntity && <p className="alw-sign-for">For {e.displayName}</p>}
      {block.esign && <p className="alw-sign-esign">(E-Sign)</p>}
      <p className="alw-sign-name">
        <Spans spans={block.name} ctx={ctx} />
      </p>
      {block.designation && (
        <p className="alw-sign-desig">
          <Spans spans={block.designation} ctx={ctx} />
        </p>
      )}
      {block.showDate && <p className="alw-sign-meta">Date: {ctx.today}</p>}
      {block.place && (
        <p className="alw-sign-meta">
          Place: <Spans spans={block.place} ctx={ctx} />
        </p>
      )}
    </div>
  );
}

function Spans({ spans, ctx }: { spans: Span[]; ctx: RenderCtx }) {
  return (
    <>
      {spans.map((span, i) =>
        span.t === "text" ? (
          <span key={i}>{applyPronouns(span.text, ctx.gender)}</span>
        ) : (
          <Field key={span.id} spec={span} ctx={ctx} />
        ),
      )}
    </>
  );
}

/** One inline editable field. Shows a light-grey placeholder (the term to fill)
 *  when empty and normal black text once filled — NO overlaying label, never red.
 *  The red in the reference docs only marked "fill this in". */
function Field({
  spec,
  ctx,
}: {
  spec: Extract<Span, { t: "field" }>;
  ctx: RenderCtx;
}) {
  const value = ctx.values[spec.id] ?? "";
  const filled = value.trim().length > 0;
  const autoFocus = spec.id === ctx.firstFieldId;
  const common = {
    value,
    autoFocus,
    placeholder: spec.label,
    "aria-label": spec.label,
    "data-filled": filled || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      ctx.setValue(spec.id, e.target.value),
    style: { minWidth: `${Math.max(spec.label.length, value.length, 6)}ch` },
  };
  return spec.multiline ? (
    <textarea rows={1} {...common} className="alw-input alw-input-multi" />
  ) : (
    <input type="text" {...common} className="alw-input" />
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const EDITOR_CSS = `
.alw-wrap{width:100%;}
/* Toolbar */
.alw-toolbar{
  position:sticky;top:60px;z-index:20;
  display:flex;flex-wrap:nowrap;overflow-x:auto;align-items:center;justify-content:safe center;gap:10px 14px;
  padding:11px 16px;margin-bottom:20px;
  background:color-mix(in srgb, var(--color-surface-soft, #f8fafc) 92%, transparent);
  backdrop-filter:blur(8px);
  border:1px solid var(--color-hairline, #e2e8f0);
  border-radius:16px;
}
.alw-pick{display:flex;flex-direction:column;gap:4px;position:relative;padding-left:22px;flex-shrink:0;}
.alw-pick svg{position:absolute;left:0;top:26px;color:${RED_DEEP};}
.alw-pick-label{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.alw-pick select{
  appearance:none;-webkit-appearance:none;
  min-width:128px;max-width:180px;
  padding:8px 28px 8px 11px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1px solid var(--color-hairline-strong, #cbd5e1);border-radius:10px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.4'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 8px center;
  cursor:pointer;
}
.alw-pick select:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);}
.alw-actions{margin-left:16px;display:flex;flex-wrap:nowrap;flex-shrink:0;gap:8px;align-items:center;}
.alw-btn{
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;
  padding:8px 12px;border-radius:11px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:700;cursor:pointer;
  border:1px solid transparent;transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}
.alw-btn:disabled{opacity:.55;cursor:default;}
.alw-btn-ghost{background:#fff;color:var(--color-ink-strong, #0f172a);border-color:var(--color-hairline-strong, #cbd5e1);}
.alw-btn-ghost:not(:disabled):hover{border-color:var(--color-ink-muted, #94a3b8);transform:translateY(-1px);}
.alw-btn-primary{color:#fff;background:linear-gradient(135deg, ${RED}, ${RED_DEEP});box-shadow:0 10px 22px -12px rgba(168,4,0,.8);}
.alw-btn-primary:not(:disabled):hover{transform:translateY(-1px);}
.alw-btn-edit{
  color:${RED_DEEP};background:#fff;
  border-color:color-mix(in srgb, ${RED} 40%, #cbd5e1);
  box-shadow:0 6px 16px -12px rgba(168,4,0,.7);
}
.alw-btn-edit:not(:disabled):hover{border-color:${RED};transform:translateY(-1px);}
.alw-spin{animation:alw-spin 1s linear infinite;}
@keyframes alw-spin{to{transform:rotate(360deg);}}

/* "Edit freely" editor loading state */
.alw-rich-loading{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  min-height:420px;color:var(--color-ink-muted,#64748b);
  font-family:var(--font-display, system-ui, sans-serif);font-size:14px;font-weight:600;
}
.alw-rich-loading svg{color:${RED};}

/* Stage — centres the A4 page */
.alw-stage{display:flex;justify-content:center;padding-bottom:40px;}

/* Body typography inside the letterhead */
.alw-date{
  text-align:right;font-size:13px;font-weight:600;
  color:var(--color-ink-muted, #475569);margin-bottom:18px;
}
.alw-p{margin:0 0 14px;font-size:15px;line-height:1.95;color:var(--color-ink-strong, #0f172a);}
.alw-heading{
  margin:16px 0 8px;font-weight:800;letter-spacing:-.01em;
  font-family:var(--font-display, Georgia, serif);color:var(--color-ink-strong, #0f172a);
}
.alw-term{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px;}
.alw-term-label{font-weight:700;}
.alw-term-sep{font-weight:700;}
.alw-ul{margin:0 0 14px;padding-left:4px;list-style:none;}
.alw-ul li{position:relative;padding-left:20px;margin-bottom:7px;font-size:15px;line-height:1.9;color:var(--color-ink-strong,#0f172a);}
.alw-ul li::before{content:"";position:absolute;left:2px;top:.72em;width:6px;height:6px;border-radius:9999px;background:${RED};}

/* Table block (e.g. the CTC break-up) */
.alw-tablewrap{margin:6px 0 16px;overflow-x:auto;}
.alw-table-toolbar{display:flex;justify-content:flex-end;margin-bottom:8px;}
.alw-table-toggle{
  display:inline-flex;align-items:center;gap:5px;cursor:pointer;
  padding:5px 11px;border-radius:8px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11.5px;font-weight:800;letter-spacing:.02em;color:${RED_DEEP};
  background:#fff;border:1px solid color-mix(in srgb, ${RED} 32%, #cbd5e1);
  transition:background .12s ease, transform .12s ease;
}
.alw-table-toggle:hover{background:rgba(225,6,0,.06);transform:translateY(-1px);}
.alw-table{
  width:100%;border-collapse:collapse;
  border:1px solid var(--color-hairline-strong, #cbd5e1);
  border-radius:12px;overflow:hidden;font-variant-numeric:tabular-nums;
}
.alw-table thead th{
  padding:10px 14px;background:linear-gradient(180deg,#fbfbfd,#f2f3f6);
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
  border-bottom:1px solid var(--color-hairline-strong, #cbd5e1);
}
.alw-th-left{text-align:left;}
.alw-th-num{text-align:right;}
.alw-table td{
  padding:7px 14px;font-size:14px;color:var(--color-ink-strong, #0f172a);
  border-bottom:1px solid var(--color-hairline, #eef0f4);vertical-align:middle;
}
.alw-td-left{text-align:left;font-weight:600;}
.alw-td-num{text-align:right;white-space:nowrap;}
.alw-tr:hover{background:color-mix(in srgb, ${RED} 3%, transparent);}
.alw-tr-group td{
  padding:9px 14px;background:#0f172a08;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:12.5px;font-weight:900;letter-spacing:.02em;color:${RED_DEEP};text-transform:uppercase;
}
.alw-tr-total td{
  background:color-mix(in srgb, ${RED} 5%, #fff);font-weight:800;
  border-top:1px solid var(--color-hairline-strong, #cbd5e1);
}
.alw-tr-grand td{
  background:linear-gradient(120deg, ${RED}, ${RED_DEEP});color:#fff;font-weight:900;font-size:14.5px;
}
.alw-tr-grand .alw-input{color:#fff;border-bottom-color:rgba(255,255,255,.5);}
.alw-tr-grand .alw-input::placeholder{color:rgba(255,255,255,.7);}
.alw-tr-grand .alw-input:focus{background:rgba(255,255,255,.14);border-bottom-color:#fff;}

/* Signature block */
.alw-sign{margin-top:26px;line-height:1.6;}
.alw-sign-for{margin:0 0 2px;font-weight:800;color:${RED_DEEP};font-size:15px;}
.alw-sign-esign{margin:0 0 14px;font-size:12.5px;letter-spacing:.06em;color:var(--color-ink-muted,#94a3b8);}
.alw-sign-name{margin:0;font-weight:800;font-size:15px;color:var(--color-ink-strong,#0f172a);}
.alw-sign-desig{margin:2px 0 0;font-size:13.5px;color:var(--color-ink-muted,#475569);}
.alw-sign-meta{margin:2px 0 0;font-size:13px;color:var(--color-ink-muted,#475569);}

/* Inline editable field — grey placeholder when empty, black text when filled */
.alw-input{
  font:inherit;color:var(--color-ink-strong,#0f172a);font-weight:600;
  background:transparent;border:none;outline:none;
  border-bottom:1px dashed #c7cdd6;
  padding:0 3px 1px;margin:0 1px;
  field-sizing:content;box-sizing:content-box;vertical-align:baseline;
  transition:border-color .15s ease, background .15s ease;
}
.alw-input::placeholder{color:#9aa4b2;font-weight:500;opacity:1;}
.alw-input:hover{border-bottom-color:#9aa4b2;}
.alw-input:focus{
  border-bottom-color:${RED};border-bottom-style:solid;
  background:rgba(225,6,0,.05);
}
.alw-input-multi{resize:none;overflow:hidden;line-height:inherit;min-width:16ch;max-width:100%;white-space:pre-wrap;vertical-align:top;}

@media (max-width:900px){
  .alw-pick select{min-width:112px;}
}

/* Print — only the paper */
@media print{
  .no-print{display:none !important;}
  .alw-stage{padding:0;}
  .alw-input{border-bottom:none;background:transparent;color:var(--color-ink-strong,#0f172a);}
}
`;

export default LetterEditor;
