"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { INTAKE_SECTIONS, vkey, type IntakeSection } from "@/lib/hr/candidate/intake-schema";
import { saveCandidateIntake, uploadCandidateFile } from "@/app/(app)/hr/candidate-actions";
import { fireToast } from "@/lib/toast";
import { IntakeRail } from "./intake-rail";
import { IntakeSectionStep } from "./intake-section-step";
import { IntakeReviewStep } from "./intake-review-step";

const RED = "var(--color-altus-red)";
const DRAFT_KEY = "candidate-intake-draft-v1";

// All animation + the "large field" scoping as a STATIC stylesheet (no
// framer-motion — its barrel cold-compiles ~49s and hangs; no styled-jsx either).
// .iw-fields enlarges the reused FieldInput inputs without touching the shared
// component, and without stretching the pill toggle buttons.
const IW_CSS = `
@keyframes iwStepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.iw-step { animation: iwStepIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes iwRowIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.iw-row { animation: iwRowIn 0.25s ease-out both; }
.iw-fields input:not([type="file"]),
.iw-fields textarea { min-height: 48px; font-size: 15px; padding: 12px 16px; }
.iw-fields textarea { min-height: 104px; line-height: 1.5; }
.iw-fields label { font-weight: 700; font-size: 14.5px; }
@media (prefers-reduced-motion: reduce) { .iw-step, .iw-row { animation: none !important; } }
`;

type Vals = Record<string, string>;
type StepStatus = "active" | "done" | "error" | "idle";

export function IntakeWizard({ onClose, onSaved }: { onClose: () => void; onSaved?: (id: string) => void }) {
  const sections = INTAKE_SECTIONS;
  const reviewStep = sections.length;

  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<Vals>({});
  // Repeater instances: sectionId -> array of stable uids.
  const [instances, setInstances] = React.useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const s of sections) if (s.repeat) init[s.id] = Array.from({ length: Math.max(s.repeat.seed, s.repeat.min) }, (_, i) => `i${i}`);
    return init;
  });
  const [photo, setPhoto] = React.useState<{ path?: string; preview?: string; busy?: boolean }>({});
  const [sign, setSign] = React.useState<{ path?: string; preview?: string; busy?: boolean }>({});
  const [saving, setSaving] = React.useState(false);
  const [attempted, setAttempted] = React.useState<Set<string>>(new Set());
  const uidRef = React.useRef(100);

  // Restore draft
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.values) setValues(d.values);
        if (d.instances) setInstances(d.instances);
      }
    } catch {}
  }, []);
  // Autosave draft (debounced)
  React.useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, instances })); } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [values, instances]);

  const set = React.useCallback((key: string, v: string) => setValues((p) => ({ ...p, [key]: v })), []);

  // ── completion / progress ──
  function requiredKeysForSection(s: IntakeSection): string[] {
    if (s.declaration) return s.fields.filter((f) => f.required).map((f) => vkey(s.id, f.key));
    if (s.repeat) {
      const ids = instances[s.id] ?? [];
      const first = ids[0];
      if (!first) return [];
      return s.fields.filter((f) => f.required).map((f) => `${s.id}.${first}.${f.key}`);
    }
    return s.fields.filter((f) => f.required).map((f) => vkey(s.id, f.key));
  }
  /** Required value-keys (or __photo__/__sign__ markers) still empty in a section. */
  function missingKeys(s: IntakeSection): string[] {
    const out = requiredKeysForSection(s).filter((k) => (values[k] ?? "").trim() === "");
    if (s.declaration) {
      if (!photo.path) out.push(`${s.id}.__photo__`);
      if (!sign.path) out.push(`${s.id}.__sign__`);
    }
    return out;
  }
  function sectionComplete(s: IntakeSection): boolean {
    return missingKeys(s).length === 0;
  }
  const allRequired = sections.flatMap(requiredKeysForSection);
  const filledRequired = allRequired.filter((k) => (values[k] ?? "").trim() !== "").length;
  const pct = Math.round((filledRequired / Math.max(allRequired.length, 1)) * 100);

  function go(to: number) {
    setStep(Math.max(0, Math.min(reviewStep, to)));
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".iw-step [data-autofocus]")?.focus());
  }
  function focusFirstInvalid() {
    document.querySelector<HTMLElement>('.iw-step [data-invalid="true"] input, .iw-step [data-invalid="true"] textarea, .iw-step [data-invalid="true"] button')?.focus();
  }
  // Hard-block: Next only advances when the current section's required fields are filled.
  function handleNext() {
    const s = sections[step];
    if (!s) return go(step + 1);
    if (missingKeys(s).length > 0) {
      setAttempted((p) => new Set(p).add(s.id));
      fireToast({ message: "Please complete the required fields in this section.", type: "error" });
      requestAnimationFrame(focusFirstInvalid);
      return;
    }
    go(step + 1);
  }
  // Hard-block: Submit only fires when EVERY section is complete; else jump to the first gap.
  function handleSubmit() {
    const firstBad = sections.findIndex((s) => missingKeys(s).length > 0);
    if (firstBad >= 0) {
      setAttempted(new Set(sections.map((s) => s.id)));
      fireToast({ message: "Some required fields are still missing — jumping you there.", type: "error" });
      go(firstBad);
      requestAnimationFrame(focusFirstInvalid);
      return;
    }
    submit();
  }

  // ── repeater ops ──
  function addInstance(s: IntakeSection) {
    setInstances((p) => {
      const cur = p[s.id] ?? [];
      if (s.repeat && cur.length >= s.repeat.max) return p;
      return { ...p, [s.id]: [...cur, `u${uidRef.current++}`] };
    });
  }
  function removeInstance(sid: string, uid: string) {
    setInstances((p) => ({ ...p, [sid]: (p[sid] ?? []).filter((x) => x !== uid) }));
  }

  async function upload(kind: "photo" | "signature", file: File) {
    const preview = URL.createObjectURL(file);
    const setter = kind === "photo" ? setPhoto : setSign;
    setter({ preview, busy: true });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await uploadCandidateFile(fd);
    if (!res.ok) { setter({ preview }); fireToast({ message: res.error, type: "error" }); return; }
    setter({ preview, path: res.path });
  }

  async function submit() {
    setSaving(true);
    try {
      const res = await saveCandidateIntake({
        fullName: values["personal.fullName"] ?? "",
        positionApplied: values["personal.position"] ?? undefined,
        mobile: values["personal.mobile"] ?? undefined,
        email: values["personal.email"] ?? undefined,
        data: values,
        photoPath: photo.path,
        signaturePath: sign.path,
      });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      fireToast({ message: "Candidate saved." });
      onSaved?.(res.id);
    } finally {
      setSaving(false);
    }
  }

  const active = step < reviewStep ? sections[step] : null;

  // Rail steps: the 7 sections + the Review step, each with a computed status.
  const steps: { label: string; status: StepStatus }[] = [
    ...sections.map((s, i): { label: string; status: StepStatus } => ({
      label: s.title,
      status: i === step ? "active" : sectionComplete(s) ? "done" : attempted.has(s.id) ? "error" : "idle",
    })),
    { label: "Review & Submit", status: step === reviewStep ? "active" : "idle" },
  ];

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#faf9fb]">
      <style dangerouslySetInnerHTML={{ __html: IW_CSS }} />

      {/* header + progress */}
      <div className="flex items-center gap-4 border-b border-hairline bg-white px-6 py-3.5 max-md:px-4">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3.5 py-2 text-[13px] font-semibold text-ink-strong transition-colors hover:border-ink-soft max-md:px-2.5" aria-label="Back">
          <ArrowLeft size={16} strokeWidth={2.4} /> <span className="max-md:hidden">Back</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="Altus" className="h-5 w-auto" style={{ display: "block" }} />
            <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
              Candidate Interview Form
            </h2>
          </div>
          <div className="mt-2 h-1.5 w-full max-w-[460px] overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
            <div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${RED}, var(--color-altus-red-deep))`, width: `${pct}%`, transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)" }} />
          </div>
        </div>
        <span className="shrink-0 text-[12.5px] font-bold text-ink-muted tabular-nums">{pct}% complete</span>
      </div>

      {/* body: rail (desktop column + mobile strip) + step area */}
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <IntakeRail steps={steps} activeIndex={step} onSelect={go} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[860px] px-10 py-10 max-md:px-4 max-md:py-6">
            <div key={step} className="iw-step">
              {active ? (
                <IntakeSectionStep
                  section={active}
                  values={values}
                  set={set}
                  instances={instances[active.id] ?? []}
                  onAdd={() => addInstance(active)}
                  onRemove={(uid) => removeInstance(active.id, uid)}
                  photo={photo}
                  sign={sign}
                  onUpload={upload}
                  invalid={attempted.has(active.id) ? new Set(missingKeys(active)) : new Set<string>()}
                />
              ) : (
                <IntakeReviewStep sections={sections} values={values} instances={instances} photo={photo} sign={sign} onEdit={go} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline bg-white px-6 py-3.5 max-md:px-4">
        <button onClick={() => go(step - 1)} disabled={step === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-ink-soft disabled:opacity-40">
          <ArrowLeft size={15} /> Back
        </button>
        <span className="text-[12.5px] font-medium text-ink-subtle max-md:hidden">Step {Math.min(step + 1, reviewStep + 1)} of {reviewStep + 1}</span>
        {step < reviewStep ? (
          <button onClick={handleNext} className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black">
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? "Saving…" : "Save candidate"}
          </button>
        )}
      </div>
    </div>
  );
}
