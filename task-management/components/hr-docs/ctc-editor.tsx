"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Save,
  Plus,
  Trash2,
  FileSignature,
  Download,
  PenLine,
  Layers,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { COMPANY_NAME } from "@/lib/hr-docs/merge";
import {
  emptyCtcFields,
  type CtcFields,
  type CtcReason,
  type GrowthStep,
} from "@/lib/hr-docs/types";
import {
  createCtcBreakup,
  updateCtcFields,
  listCtcVersions,
  newCtcVersion,
  renderCtcLetter,
  type CtcVersionRow,
} from "@/app/(app)/hr-docs/ctc-actions";
import { getDocumentDownloadUrl } from "@/app/(app)/hr-docs/download-actions";
import type { HrDocEmployee } from "@/components/hr-docs/compose-dialog";
import { GrowthJourney } from "@/components/hr-docs/growth-journey";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * CTC Break-Up workbench — the NEW HR compensation engine (category D). Pick an
 * employee (or open scoped to one), author the 20-field structured CTC with a
 * live letter preview that HIDES any 0/empty field, keep the Growth Journey
 * timeline, version it (initial → promotion / appraisal), and generate + route
 * the CTC letter into the same e-sign machinery as every other document.
 */
export function CtcWorkbench({
  roster,
  fixedEmployee,
  fixedEmployeeId,
  initialReason = "initial",
  onClose,
}: {
  roster?: HrDocEmployee[];
  fixedEmployee?: HrDocEmployee;
  fixedEmployeeId?: string;
  initialReason?: CtcReason;
  onClose: () => void;
}) {
  const lockedId = fixedEmployee?.id ?? fixedEmployeeId ?? null;
  const [employeeId, setEmployeeId] = useState<string | null>(lockedId);

  const [versions, setVersions] = useState<CtcVersionRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fields, setFields] = useState<CtcFields>(emptyCtcFields());
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [journey, setJourney] = useState<GrowthStep[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ instanceId: string; signatureId: string | null } | null>(null);

  const employeeFromRoster = useMemo(
    () => fixedEmployee ?? roster?.find((e) => e.id === employeeId) ?? null,
    [fixedEmployee, roster, employeeId],
  );

  const active = useMemo(
    () => versions?.find((v) => v.id === activeId) ?? null,
    [versions, activeId],
  );

  const displayName =
    employeeFromRoster?.name || fields.employeeName || active?.fields.employeeName || "Employee";

  const dirty = useMemo(
    () => snapshotOf(fields, effectiveDate) !== savedSnapshot,
    [fields, effectiveDate, savedSnapshot],
  );

  const loadVersions = useCallback(
    async (empId: string, preferId?: string) => {
      const res = await listCtcVersions(empId);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        setVersions([]);
        return;
      }
      setVersions(res.versions);
      const next = preferId
        ? res.versions.find((v) => v.id === preferId)
        : res.versions[0];
      if (next) selectVersion(next);
      else {
        setActiveId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function selectVersion(v: CtcVersionRow) {
    setActiveId(v.id);
    setFields({ ...emptyCtcFields(), ...v.fields });
    setEffectiveDate(v.effectiveDate ?? "");
    setJourney(v.growthJourney);
    setSavedSnapshot(snapshotOf({ ...emptyCtcFields(), ...v.fields }, v.effectiveDate ?? ""));
    setGenerated(null);
  }

  useEffect(() => {
    if (employeeId) void loadVersions(employeeId);
  }, [employeeId, loadVersions]);

  // Esc + scroll lock.
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

  function prefillFields(): Partial<CtcFields> {
    const e = employeeFromRoster;
    if (!e) return {};
    return {
      employeeName: e.name,
      designation: e.designation,
      dateOfJoining: e.joiningDate,
      reportingManager: e.reportingManager,
    };
  }

  async function createInitial() {
    if (!employeeId) return;
    setBusy(true);
    try {
      const res = await createCtcBreakup({
        employeeId,
        reason: "initial",
        fields: prefillFields(),
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      await loadVersions(employeeId, res.ctc.id);
      fireToast({ message: "Initial CTC created." });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!activeId || busy) return;
    setBusy(true);
    try {
      const res = await updateCtcFields({
        id: activeId,
        fields,
        effectiveDate: effectiveDate ? effectiveDate : null,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setVersions((prev) => (prev ? prev.map((v) => (v.id === res.ctc.id ? res.ctc : v)) : prev));
      setSavedSnapshot(snapshotOf(fields, effectiveDate));
      fireToast({ message: "CTC saved." });
    } finally {
      setBusy(false);
    }
  }

  async function makeVersion(reason: Exclude<CtcReason, "initial">) {
    if (!employeeId || busy) return;
    setBusy(true);
    try {
      const res = await newCtcVersion({ employeeId, reason });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      await loadVersions(employeeId, res.ctc.id);
      fireToast({ message: `New ${reason} version created.` });
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!activeId || busy) return;
    setBusy(true);
    try {
      if (dirty) {
        const saved = await updateCtcFields({
          id: activeId,
          fields,
          effectiveDate: effectiveDate ? effectiveDate : null,
        });
        if (!saved.ok) {
          fireToast({ message: saved.error, type: "error" });
          return;
        }
        setSavedSnapshot(snapshotOf(fields, effectiveDate));
      }
      const res = await renderCtcLetter({ id: activeId });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setGenerated({ instanceId: res.instanceId, signatureId: res.signatureId });
      fireToast({ message: "CTC letter generated." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadGenerated() {
    if (!generated) return;
    const res = await getDocumentDownloadUrl(generated.instanceId);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const showPicker = !lockedId && !employeeId;

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
        aria-label="Compensation workbench"
        className="my-8 max-md:my-0 w-full max-w-[1160px] overflow-hidden rounded-2xl bg-surface-card max-md:rounded-none"
        style={{ boxShadow: "0 30px 80px -30px rgba(15,23,42,0.6), inset 0 0 0 1px var(--color-hairline)" }}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
              Compensation · CTC Break-Up
            </span>
            <h2
              className="truncate text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}
            >
              {showPicker ? "Choose an employee" : displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {showPicker ? (
          <EmployeePicker roster={roster ?? []} onPick={setEmployeeId} />
        ) : versions === null ? (
          <div className="flex items-center gap-2 px-6 py-16 text-[13.5px] font-medium text-ink-muted">
            <Loader2 size={16} className="animate-spin" /> Loading compensation…
          </div>
        ) : versions.length === 0 ? (
          <EmptyState name={displayName} busy={busy} onCreate={createInitial} />
        ) : (
          <div className="ctc-form grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
            {/* editor pane */}
            <div className="max-h-[74vh] overflow-y-auto border-b border-hairline p-5 lg:border-b-0 lg:border-r">
              {/* version switcher */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Versions</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => makeVersion("promotion")}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11.5px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-50"
                    >
                      <Plus size={11} strokeWidth={2.8} /> Promotion
                    </button>
                    <button
                      type="button"
                      onClick={() => makeVersion("appraisal")}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11.5px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-50"
                    >
                      <Plus size={11} strokeWidth={2.8} /> Appraisal
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        if (v.id === activeId) return;
                        if (dirty && !window.confirm("Discard unsaved changes to this version?")) return;
                        selectVersion(v);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold transition"
                      style={
                        v.id === activeId
                          ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, color: "#fff" }
                          : { background: "var(--color-surface-muted)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
                      }
                    >
                      <Layers size={12} strokeWidth={2.4} /> v{v.version}
                      <span style={{ opacity: 0.7 }}>· {reasonLabel(v.reason)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* identity */}
              <Section label="Employee">
                <TextField label="Employee name" value={fields.employeeName} onChange={(v) => setField("employeeName", v)} />
                <TextField label="Designation" value={fields.designation} onChange={(v) => setField("designation", v)} />
                <TextField label="Date of joining" value={fields.dateOfJoining} onChange={(v) => setField("dateOfJoining", v)} />
                <TextField label="Reporting manager" value={fields.reportingManager} onChange={(v) => setField("reportingManager", v)} />
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Effective date</span>
                  <input
                    type="date"
                    className="ctc-input"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>
                <MoneyField label="Increment % (per month)" value={fields.pctPerMonth} onChange={(v) => setField("pctPerMonth", v)} suffix="%" />
                <MoneyField label="Increment % (per annum)" value={fields.pctPerAnnum} onChange={(v) => setField("pctPerAnnum", v)} suffix="%" />
              </Section>

              {/* earnings */}
              <Section label="Earnings (monthly)">
                <MoneyField label="Basic" value={fields.basic} onChange={(v) => setField("basic", v)} />
                <MoneyField label="House Rent Allowance" value={fields.hra} onChange={(v) => setField("hra", v)} />
                <MoneyField label="Statutory Bonus" value={fields.statutoryBonus} onChange={(v) => setField("statutoryBonus", v)} />
                <MoneyField label="Medical" value={fields.medical} onChange={(v) => setField("medical", v)} />
                <MoneyField label="Attire" value={fields.attire} onChange={(v) => setField("attire", v)} />

                <div className="col-span-full">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Other allowances</span>
                    <button
                      type="button"
                      onClick={addAllowance}
                      className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11.5px] font-semibold text-ink-strong hover:border-ink-soft"
                    >
                      <Plus size={11} strokeWidth={2.8} /> Add
                    </button>
                  </div>
                  {fields.otherAllowances.length === 0 ? (
                    <p className="text-[12px] text-ink-subtle">None — add nameable allowance lines (e.g. Conveyance, LTA).</p>
                  ) : (
                    <div className="space-y-2">
                      {fields.otherAllowances.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="ctc-input flex-1"
                            placeholder="Allowance name"
                            value={a.name}
                            onChange={(e) => updateAllowance(i, { name: e.target.value })}
                          />
                          <input
                            className="ctc-input w-[120px]"
                            inputMode="decimal"
                            placeholder="0"
                            value={a.amount}
                            onChange={(e) => updateAllowance(i, { amount: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={() => removeAllowance(i)}
                            aria-label="Remove allowance"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface-muted hover:text-[#dc2626]"
                          >
                            <Trash2 size={13} strokeWidth={2.4} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {/* deductions */}
              <Section label="Deductions (monthly)">
                <MoneyField label="Professional Tax" value={fields.professionalTax} onChange={(v) => setField("professionalTax", v)} />
                <MoneyField label="Provident Fund" value={fields.providentFund} onChange={(v) => setField("providentFund", v)} />
                <MoneyField label="Income Tax (TDS)" value={fields.incomeTax} onChange={(v) => setField("incomeTax", v)} />
              </Section>

              {/* summary */}
              <Section label="Summary">
                <MoneyField label="Net take-home (monthly)" value={fields.netSalary} onChange={(v) => setField("netSalary", v)} />
                <MoneyField label="Cost to Company (per annum)" value={fields.costToCompany} onChange={(v) => setField("costToCompany", v)} />
                <MoneyField label="Retention Bonus" value={fields.retentionBonus} onChange={(v) => setField("retentionBonus", v)} />
              </Section>

              {/* notes */}
              <Section label="Notes">
                <div className="col-span-full">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Note lines</span>
                    <button
                      type="button"
                      onClick={addNote}
                      className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-[11.5px] font-semibold text-ink-strong hover:border-ink-soft"
                    >
                      <Plus size={11} strokeWidth={2.8} /> Add note
                    </button>
                  </div>
                  {fields.notes.length === 0 ? (
                    <p className="text-[12px] text-ink-subtle">No note lines.</p>
                  ) : (
                    <div className="space-y-2">
                      {fields.notes.map((n, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="ctc-input flex-1"
                            placeholder="Note"
                            value={n}
                            onChange={(e) => updateNote(i, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeNote(i)}
                            aria-label="Remove note"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface-muted hover:text-[#dc2626]"
                          >
                            <Trash2 size={13} strokeWidth={2.4} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <label className="col-span-full block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Additional notes</span>
                  <textarea
                    className="ctc-input"
                    rows={3}
                    style={{ resize: "vertical" }}
                    value={fields.extraNotes}
                    onChange={(e) => setField("extraNotes", e.target.value)}
                  />
                </label>
              </Section>

              {/* growth journey */}
              <div className="mt-5 rounded-xl border border-hairline bg-surface-muted p-4">
                {activeId && (
                  <GrowthJourney
                    key={activeId}
                    ctcId={activeId}
                    initialSteps={journey}
                    onPreviewChange={setJourney}
                  />
                )}
              </div>
            </div>

            {/* preview pane */}
            <div className="max-h-[74vh] overflow-y-auto bg-surface-muted p-5">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                Live preview · 0/empty fields hidden
              </span>
              <CtcPreview
                fields={fields}
                journey={journey}
                version={active?.version}
                reason={active?.reason ?? "initial"}
                effectiveDate={effectiveDate}
              />
            </div>
          </div>
        )}

        {/* footer */}
        {!showPicker && versions && versions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
            <div className="min-w-0">
              {generated ? (
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="font-semibold" style={{ color: ACCENT_DEEP }}>CTC letter generated.</span>
                  <button
                    type="button"
                    onClick={downloadGenerated}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2.5 py-1 font-semibold text-ink-strong hover:border-ink-soft"
                  >
                    <Download size={12.5} strokeWidth={2.4} /> PDF
                  </button>
                  {generated.signatureId && (
                    <a
                      href={`/documents/sign?kind=letter&doc=${generated.instanceId}`}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                    >
                      <PenLine size={12.5} strokeWidth={2.4} /> Review &amp; sign
                    </a>
                  )}
                </div>
              ) : (
                <p className="truncate text-[12.5px] font-medium text-ink-muted">
                  {dirty ? "Unsaved changes to this version." : "Generating archives a PDF and opens the e-sign flow."}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card px-4 py-2 text-[13.5px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-45"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.3} />}
                Save
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} strokeWidth={2.3} />}
                Generate CTC letter
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .ctc-form .ctc-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 8px 10px;
          font-size: 13px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .ctc-form .ctc-input:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 16%, transparent);
        }
      `}</style>
    </div>
  );

  function setField<K extends keyof CtcFields>(key: K, value: CtcFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }
  function addAllowance() {
    setFields((prev) => ({ ...prev, otherAllowances: [...prev.otherAllowances, { name: "", amount: "" }] }));
  }
  function updateAllowance(i: number, patch: { name?: string; amount?: string }) {
    setFields((prev) => ({
      ...prev,
      otherAllowances: prev.otherAllowances.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  }
  function removeAllowance(i: number) {
    setFields((prev) => ({ ...prev, otherAllowances: prev.otherAllowances.filter((_, idx) => idx !== i) }));
  }
  function addNote() {
    setFields((prev) => ({ ...prev, notes: [...prev.notes, ""] }));
  }
  function updateNote(i: number, value: string) {
    setFields((prev) => ({ ...prev, notes: prev.notes.map((n, idx) => (idx === i ? value : n)) }));
  }
  function removeNote(i: number) {
    setFields((prev) => ({ ...prev, notes: prev.notes.filter((_, idx) => idx !== i) }));
  }

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function EmployeePicker({ roster, onPick }: { roster: HrDocEmployee[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter(
      (e) => e.name.toLowerCase().includes(needle) || e.designation.toLowerCase().includes(needle),
    );
  }, [q, roster]);

  return (
    <div className="p-5">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search employees…"
        className="mb-3 w-full rounded-lg border border-hairline-strong bg-surface-card px-3 py-2.5 text-[13.5px] text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
      />
      <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e.id)}
              className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition hover:bg-surface-muted"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}>
                  <UserRound size={17} strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-ink-strong">{e.name}</span>
                  {e.designation && <span className="block truncate text-[12px] text-ink-soft">{e.designation}</span>}
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-ink-soft" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-8 text-center text-[13px] text-ink-muted">No matches.</li>}
      </ul>
    </div>
  );
}

function EmptyState({ name, busy, onCreate }: { name: string; busy: boolean; onCreate: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}>
        <FileSignature size={26} strokeWidth={2} />
      </div>
      <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}>
        No CTC on file for {name}
      </h3>
      <p className="mx-auto mt-1 max-w-[46ch] text-[13.5px] font-medium text-ink-muted">
        Create the initial structured CTC break-up. You can revise it later as a promotion or appraisal version.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.6} />}
        Create initial CTC
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT_DEEP }}>
        {label}
      </h3>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
      <input className="ctc-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
      <div className="relative">
        {!suffix && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-subtle">Rs</span>
        )}
        <input
          className="ctc-input"
          style={{ paddingLeft: suffix ? undefined : 32, paddingRight: suffix ? 26 : undefined }}
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-subtle">{suffix}</span>
        )}
      </div>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Live CTC preview — mirrors lib/hr-docs/render.ts renderCtcPdf        */
/* ------------------------------------------------------------------ */

function CtcPreview({
  fields: f,
  journey,
  version,
  reason,
  effectiveDate,
}: {
  fields: CtcFields;
  journey: GrowthStep[];
  version?: number;
  reason: string;
  effectiveDate: string;
}) {
  const title = CTC_TITLE_BY_REASON[reason] ?? "CTC Breakup Letter";

  const idRows: Array<[string, string]> = [];
  if (f.employeeName.trim()) idRows.push(["Employee", f.employeeName.trim()]);
  if (f.designation.trim()) idRows.push(["Designation", f.designation.trim()]);
  if (f.dateOfJoining.trim()) idRows.push(["Date of Joining", f.dateOfJoining.trim()]);
  if (f.reportingManager.trim()) idRows.push(["Reporting Manager", f.reportingManager.trim()]);
  if (effectiveDate) idRows.push(["Effective Date", fmtIsoDate(effectiveDate)]);
  if (hasMoney(f.pctPerMonth)) idRows.push(["Increment (per month)", `${money(f.pctPerMonth)}%`]);
  if (hasMoney(f.pctPerAnnum)) idRows.push(["Increment (per annum)", `${money(f.pctPerAnnum)}%`]);

  const earnings: Array<[string, number]> = [];
  if (hasMoney(f.basic)) earnings.push(["Basic", money(f.basic)]);
  if (hasMoney(f.hra)) earnings.push(["House Rent Allowance", money(f.hra)]);
  if (hasMoney(f.statutoryBonus)) earnings.push(["Statutory Bonus", money(f.statutoryBonus)]);
  if (hasMoney(f.medical)) earnings.push(["Medical", money(f.medical)]);
  if (hasMoney(f.attire)) earnings.push(["Attire", money(f.attire)]);
  for (const a of f.otherAllowances) {
    if (a.name.trim() && hasMoney(a.amount)) earnings.push([a.name.trim(), money(a.amount)]);
  }
  const grossM = earnings.reduce((s, [, m]) => s + m, 0);

  const deductions: Array<[string, number]> = [];
  if (hasMoney(f.professionalTax)) deductions.push(["Professional Tax", money(f.professionalTax)]);
  if (hasMoney(f.providentFund)) deductions.push(["Provident Fund", money(f.providentFund)]);
  if (hasMoney(f.incomeTax)) deductions.push(["Income Tax (TDS)", money(f.incomeTax)]);

  const summary: Array<[string, number]> = [];
  if (hasMoney(f.costToCompany)) summary.push(["Cost to Company (per annum)", money(f.costToCompany)]);
  if (hasMoney(f.retentionBonus)) summary.push(["Retention Bonus", money(f.retentionBonus)]);

  const notes = f.notes.filter((n) => n.trim());
  const steps = journey.filter((g) => g.title.trim() || g.detail.trim());

  return (
    <div
      className="mx-auto w-full max-w-[680px] bg-white text-[#111]"
      style={{ boxShadow: "0 10px 30px -18px rgba(15,23,42,0.45), 0 0 0 1px rgba(0,0,0,0.06)", borderRadius: 6, colorScheme: "light" }}
    >
      {/* masthead */}
      <div className="flex items-center justify-between px-8 pt-7 pb-4" style={{ borderBottom: "2px solid #E10600" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.01em", color: "#A80400" }}>
            {COMPANY_NAME}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7280", marginTop: 2 }}>
            Compensation · Confidential
          </div>
        </div>
        {version ? <div style={{ fontSize: 11, color: "#374151" }}>Version {version}</div> : null}
      </div>

      <div className="px-8 py-6">
        {/* title band */}
        <div style={{ background: "#E10600", color: "#fff", padding: "8px 12px", fontWeight: 800, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", borderRadius: 3 }}>
          {title}
        </div>

        {/* identity */}
        {idRows.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <PreviewHeading>Employee</PreviewHeading>
            <table style={{ width: "100%", fontSize: 12 }}>
              <tbody>
                {idRows.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: "#525252", padding: "3px 0", width: 170 }}>{k}</td>
                    <td style={{ color: "#111", fontWeight: 700, padding: "3px 0" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* earnings */}
        {earnings.length > 0 && (
          <MoneyTable
            heading="Earnings"
            rows={earnings.map(([l, m]) => [l, m, m * 12] as const)}
            footer={["Gross Earnings", grossM, grossM * 12]}
          />
        )}

        {/* deductions */}
        {deductions.length > 0 && (
          <MoneyTable heading="Deductions" rows={deductions.map(([l, m]) => [l, m, m * 12] as const)} />
        )}

        {/* net */}
        {hasMoney(f.netSalary) && (
          <div style={{ marginTop: 10, background: "#FDECEA", borderRadius: 4, padding: "8px 10px", display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 12.5, color: "#111" }}>
            <span>Net Take-home Salary</span>
            <span>
              {inr(money(f.netSalary))} <span style={{ color: "#A80400" }}>/ {inr(money(f.netSalary) * 12)}</span>
            </span>
          </div>
        )}

        {/* summary */}
        {summary.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <PreviewHeading>Summary</PreviewHeading>
            {summary.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12.5, color: "#111", padding: "3px 0" }}>
                <span>{k}</span>
                <span style={{ color: "#A80400" }}>{inr(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* notes */}
        {notes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <PreviewHeading>Notes</PreviewHeading>
            <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc", fontSize: 12, color: "#404040" }}>
              {notes.map((n, i) => (
                <li key={i} style={{ marginBottom: 3 }}>{n.trim()}</li>
              ))}
            </ul>
          </div>
        )}

        {f.extraNotes.trim() && (
          <div style={{ marginTop: 14 }}>
            <PreviewHeading>Additional Notes</PreviewHeading>
            <p style={{ fontSize: 12, color: "#404040", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{f.extraNotes.trim()}</p>
          </div>
        )}

        {/* growth journey */}
        {steps.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <PreviewHeading>Growth Journey</PreviewHeading>
            <ol style={{ margin: 0, padding: 0, borderLeft: "2px solid #F3C9C6", paddingLeft: 14, listStyle: "none" }}>
              {steps.map((s) => (
                <li key={s.id} style={{ position: "relative", marginBottom: 10 }}>
                  <span style={{ position: "absolute", left: -19, top: 4, width: 7, height: 7, borderRadius: "50%", background: "#E10600" }} />
                  {s.date.trim() && <div style={{ fontSize: 9.5, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.date}</div>}
                  {s.title.trim() && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111" }}>{s.title}</div>}
                  {s.detail.trim() && <div style={{ fontSize: 11.5, color: "#404040", lineHeight: 1.5 }}>{s.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* e-sign footer */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#A80400", textTransform: "uppercase", letterSpacing: "0.07em" }}>Signature</div>
          <div style={{ height: 1, background: "#D4D4D4", margin: "8px 0 6px" }} />
          <div style={{ width: 200, height: 1, background: "#111" }} />
          <div style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>{f.employeeName.trim() || "Employee"} · Signature (DigiLocker e-sign)</div>
        </div>

        {earnings.length === 0 && deductions.length === 0 && !hasMoney(f.netSalary) && summary.length === 0 && (
          <p style={{ marginTop: 18, fontSize: 12, fontStyle: "italic", color: "#9ca3af" }}>
            Fill the earnings, deductions and summary — figures appear here as you type. Zero / empty fields stay hidden.
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, color: "#A80400", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #D4D4D4", paddingBottom: 4, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function MoneyTable({
  heading,
  rows,
  footer,
}: {
  heading: string;
  rows: ReadonlyArray<readonly [string, number, number]>;
  footer?: [string, number, number];
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <PreviewHeading>{heading}</PreviewHeading>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#A3A3A3", fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <th style={{ textAlign: "left", fontWeight: 700 }} />
            <th style={{ textAlign: "right", fontWeight: 700, paddingBottom: 4 }}>Per Month</th>
            <th style={{ textAlign: "right", fontWeight: 700, paddingBottom: 4 }}>Per Annum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, m, a]) => (
            <tr key={l}>
              <td style={{ color: "#404040", padding: "2.5px 0" }}>{l}</td>
              <td style={{ color: "#404040", textAlign: "right" }}>{inr(m)}</td>
              <td style={{ color: "#404040", textAlign: "right" }}>{inr(a)}</td>
            </tr>
          ))}
          {footer && (
            <tr style={{ borderTop: "1px solid #D4D4D4", fontWeight: 800, color: "#111" }}>
              <td style={{ padding: "5px 0 0" }}>{footer[0]}</td>
              <td style={{ textAlign: "right", padding: "5px 0 0" }}>{inr(footer[1])}</td>
              <td style={{ textAlign: "right", padding: "5px 0 0", color: "#A80400" }}>{inr(footer[2])}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* helpers (mirror render.ts)                                           */
/* ------------------------------------------------------------------ */

const CTC_TITLE_BY_REASON: Record<string, string> = {
  initial: "CTC Breakup Letter",
  promotion: "Revised CTC — Promotion",
  appraisal: "Revised CTC — Appraisal",
};

function reasonLabel(reason: string): string {
  return reason === "promotion" ? "Promotion" : reason === "appraisal" ? "Appraisal" : "Initial";
}

function money(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0;
  const n = typeof s === "number" ? s : parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function hasMoney(s: string | number | null | undefined): boolean {
  return money(s) !== 0;
}
function inr(n: number): string {
  return "Rs " + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtIsoDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}
function snapshotOf(fields: CtcFields, effectiveDate: string): string {
  return JSON.stringify({ fields, effectiveDate });
}
