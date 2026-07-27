"use client";

import * as React from "react";
import {
  Loader2,
  Check,
  Save,
  ClipboardCheck,
  UserRound,
  AlertTriangle,
  ChevronDown,
  Gavel,
  Briefcase,
  ShieldCheck,
  Printer,
  Share2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  EVAL_BUCKETS,
  EVAL_SECTIONS,
  sectionItemIds,
  type EvaluationInstance,
  type EvaluatorRole,
  type EvalSection,
  type PassFail,
  type RecommendationValue,
  type TextboxId,
  RECOMMENDATIONS,
} from "@/lib/hr/candidate/evaluation-v2";
import {
  overallScore,
  ratingProgress,
  isSectionApplicable,
  eligibilityVerdict,
  allSectionScores,
  type WeightProfile,
} from "@/lib/hr/candidate/evaluation-v2-scoring";
import { getEvaluationV2, saveEvaluationV2 } from "@/app/(app)/hr/evaluation-v2-actions";
import type { EvaluationV2Load } from "@/app/(app)/hr/evaluation-v2-actions-types";
import { OverallDial, toneFor } from "./dial";
import { BucketAccordion, SectionShell } from "./layout";
import { EligibilitySection } from "./eligibility-section";
import { RatingSection } from "./rating-section";
import {
  XFactorInput,
  SellGate,
  OverallInput,
  RecommendationBar,
  ClosingTextboxes,
} from "./special-sections";
import { EvaluationV2Report } from "./evaluation-v2-report";
import type { EvalController } from "./controller";

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

type Candidate = { id: string; fullName: string; positionApplied?: string | null; status?: string | null };

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: "New" },
  shortlisted: { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Shortlisted" },
  rejected: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)", label: "Rejected" },
  hired: { bg: "color-mix(in srgb, #2563eb 12%, white)", fg: "#1d4ed8", label: "Hired" },
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function EvaluationV2Screen({
  candidates,
  role,
  isSuperAdmin,
  fixedCandidateId,
}: {
  candidates: Candidate[];
  role: EvaluatorRole;
  isSuperAdmin: boolean;
  /** When set (e.g. opened from the Management Assessment for a specific person),
   *  the candidate is locked to this id and the picker is hidden. */
  fixedCandidateId?: string;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  const [instance, setInstance] = React.useState<EvaluationInstance | null>(null);
  const [load, setLoad] = React.useState<EvaluationV2Load | null>(null);
  const [designation, setDesignation] = React.useState<string>("default");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [open, setOpen] = React.useState<Record<string, boolean>>({
    prerequisites: true,
    mandatory: true,
    evaluations: true,
  });

  // Refs for the debounced autosave (always the freshest values).
  const cidRef = React.useRef(candidateId); cidRef.current = candidateId;
  const instRef = React.useRef(instance); instRef.current = instance;
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = candidates.find((c) => c.id === candidateId) ?? null;

  const profile: WeightProfile = React.useMemo(() => {
    if (!load) return {};
    return load.profilesByDesignation[designation] ?? load.profilesByDesignation["default"] ?? {};
  }, [load, designation]);

  const saveNow = React.useCallback(async () => {
    const id = cidRef.current;
    const inst = instRef.current;
    if (!id || !inst) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaving(true);
    try {
      const res = await saveEvaluationV2(id, role, inst);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setDirty(false);
    } catch {
      fireToast({ message: "Couldn't save the evaluation — check your connection.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [role]);

  const scheduleSave = React.useCallback(() => {
    if (!cidRef.current || !instRef.current) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 800);
  }, [saveNow]);

  /** Apply an updater to the instance + mark dirty + schedule a save. */
  const patch = React.useCallback(
    (fn: (prev: EvaluationInstance) => EvaluationInstance) => {
      setInstance((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        instRef.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  async function selectCandidate(id: string) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setCandidateId(id); cidRef.current = id;
    setInstance(null); instRef.current = null;
    setLoad(null);
    setError(null);
    setDirty(false);
    if (!id) return;
    setLoading(true);
    try {
      const res = await getEvaluationV2(id, role);
      if (cidRef.current !== id) return; // superseded by a newer selection
      if (!res.ok) { setError(res.error); return; }
      setLoad(res.load);
      setInstance(res.load.instance); instRef.current = res.load.instance;
      setDesignation(res.load.suggestedDesignation || "default");
    } catch {
      if (cidRef.current === id) setError("Couldn't load this candidate's evaluation.");
    } finally {
      if (cidRef.current === id) setLoading(false);
    }
  }

  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Fixed-candidate mode: lock to the given candidate and auto-load it (no picker).
  React.useEffect(() => {
    if (fixedCandidateId && fixedCandidateId !== cidRef.current) {
      void selectCandidate(fixedCandidateId);
    }
    // selectCandidate is stable enough for this one-shot lock-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedCandidateId]);

  // The full mutation surface handed to sections.
  const ctrl: EvalController | null = React.useMemo(() => {
    if (!instance) return null;
    return {
      instance,
      profile,
      readOnly: false,
      setPassfail: (id: string, v: PassFail) => patch((p) => ({ ...p, passfail: { ...p.passfail, [id]: v } })),
      setRating: (id: string, v: number) =>
        patch((p) => {
          const ratings = { ...p.ratings };
          if (v <= 0) delete ratings[id];
          else ratings[id] = v;
          return { ...p, ratings, cantSay: p.cantSay.filter((x) => x !== id) };
        }),
      toggleCantSay: (id: string) =>
        patch((p) => ({
          ...p,
          cantSay: p.cantSay.includes(id) ? p.cantSay.filter((x) => x !== id) : [...p.cantSay, id],
        })),
      setNote: (id: string, v: string) => patch((p) => ({ ...p, notes: { ...p.notes, [id]: v } })),
      setSectionNote: (id: string, v: string) => patch((p) => ({ ...p, sectionNotes: { ...p.sectionNotes, [id]: v } })),
      setXFactor: (v: number) => patch((p) => ({ ...p, xFactor: v })),
      setSell: (v: boolean) => patch((p) => ({ ...p, sellResponsibility: v })),
      setOverall: (v: number) => patch((p) => ({ ...p, overall: v })),
      setRecommendation: (v: RecommendationValue) =>
        patch((p) => ({ ...p, recommendation: p.recommendation === v ? p.recommendation : v })),
      setTextbox: (id: TextboxId, v: string) => patch((p) => ({ ...p, textboxes: { ...p.textboxes, [id]: v } })),
    };
  }, [instance, profile, patch]);

  const roleLabel = role === "interviewer" ? "Interviewer" : "Management";
  const RoleIcon = role === "interviewer" ? ClipboardCheck : Gavel;

  const overall = instance ? overallScore(instance, profile) : null;
  const progress = instance ? ratingProgress(instance) : { rated: 0, total: 0 };
  const pctDone = progress.total > 0 ? Math.round((progress.rated / progress.total) * 100) : 0;
  const otherOverall =
    load?.other ? overallScore(load.other, profile) : null;

  const tone = STATUS_TONE[selected?.status ?? "new"] ?? STATUS_TONE.new!;

  /** Print → Save as PDF (the report + form print via the print CSS). */
  const printPdf = React.useCallback(() => window.print(), []);

  /** Share a concise evaluation summary on WhatsApp (wa.me prefilled message). */
  const shareWhatsApp = React.useCallback(() => {
    if (!instance || !selected) return;
    const ov = overallScore(instance, profile);
    const elig = eligibilityVerdict(instance);
    const rec = RECOMMENDATIONS.find((r) => r.value === instance.recommendation)?.label ?? "—";
    const secs = allSectionScores(instance, profile).filter((s) => s.applicable && s.micro !== null);
    const lines = [
      `*${selected.fullName || "Candidate"} — Candidate Evaluation*`,
      `Evaluator: ${roleLabel}`,
      `Overall: ${ov.avg !== null ? `${fmt(ov.avg)}/10` : "—"}`,
      `Eligibility: ${
        elig.dealbreaker
          ? `⚠️ Deal-breaker (${elig.noItems.length} failed)`
          : elig.answered === elig.total
            ? "All clear ✅"
            : `${elig.answered}/${elig.total} answered`
      }`,
      `Recommendation: ${rec}`,
      "",
      "*Section scores (X / Y)*",
      ...secs.map((s) => `• ${s.title}: ${s.x}/${s.weight}`),
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }, [instance, selected, profile, roleLabel]);

  return (
    <>
      <style>{CSS}</style>
      <main className="mx-auto w-full max-w-[1120px] px-6 pb-28 pt-7 max-md:px-4">
        {/* Hero */}
        <div className="ev2-fade mb-5">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <RoleIcon size={13} strokeWidth={2.6} /> {roleLabel} · Evaluation
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Candidate Evaluation
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[15px] font-medium text-ink-muted">
            Work top-to-bottom — clear the non-negotiables, rate each competency out of 10, and the
            weighted score, section dials and progress fill in live. Everything autosaves as you go.
          </p>
        </div>

        {/* Sticky control header */}
        <div className="ev2-sticky ev2-fade sticky top-[64px] z-20 mb-6 rounded-2xl border border-hairline bg-white/95 p-4 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-4">
            {/* Candidate picker (hidden in fixed-candidate mode) */}
            {!fixedCandidateId && (
              <div className="ev2-select-wrap min-w-[240px] flex-1">
                <label htmlFor="ev2-candidate" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  Candidate
                </label>
                <select
                  id="ev2-candidate"
                  data-autofocus
                  autoFocus
                  value={candidateId}
                  onChange={(e) => void selectCandidate(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 pr-9 text-[14px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                >
                  <option value="">— Select candidate —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName || "Unnamed"}{c.positionApplied ? ` · ${c.positionApplied}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Role chip */}
            <span
              className="inline-flex shrink-0 items-center gap-1.5 self-end rounded-pill px-3 py-2 text-[12px] font-bold"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, white)", color: RED_DEEP }}
              title={`You are filling the ${roleLabel} evaluation`}
            >
              <RoleIcon size={13} strokeWidth={2.5} /> {roleLabel}
            </span>

            {/* Designation selector */}
            {load && (
              <div className="ev2-select-wrap min-w-[170px] shrink-0">
                <label htmlFor="ev2-designation" className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  <Briefcase size={11} className="mr-1 inline-block align-[-1px]" />
                  Designation
                </label>
                <select
                  id="ev2-designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 pr-9 text-[13.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
                  title="Chooses the weight profile used for every score"
                >
                  <option value="default">Default profile</option>
                  {load.designations.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Save state + button */}
            {candidateId && (
              <div className="flex shrink-0 items-center gap-3 self-end">
                <SaveState saving={saving} dirty={dirty} loading={loading} />
                <button
                  type="button"
                  onClick={() => void saveNow()}
                  disabled={saving || loading || !instance}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                >
                  <Save size={14} /> Save
                </button>
              </div>
            )}
          </div>

          {/* Candidate identity + live score rail */}
          {selected && instance && (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-hairline pt-4">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[15px] font-black text-white"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}
              >
                {initials(selected.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15.5px] font-black leading-tight text-ink-strong" style={{ fontFamily: DISPLAY }}>
                  {selected.fullName || "Unnamed"}
                </p>
                <p className="truncate text-[12.5px] font-medium text-ink-muted">
                  {selected.positionApplied || "Position not set"}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
                {tone.label}
              </span>

              <div className="ml-auto flex items-center gap-5">
                {/* Progress */}
                <div className="min-w-[150px]">
                  <div className="flex items-center justify-between text-[12px] font-semibold text-ink-strong">
                    <span>Progress</span>
                    <span className="tabular-nums" style={{ color: RED_DEEP }}>{progress.rated}/{progress.total}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pctDone}%`, background: `linear-gradient(90deg, ${RED}, ${RED_DEEP})`, transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)" }}
                    />
                  </div>
                  {otherOverall && otherOverall.avg !== null && (
                    <p className="mt-1 text-[11px] font-semibold text-ink-subtle">
                      {load?.otherRole === "management" ? "Management" : "Interviewer"}: {fmt(otherOverall.avg)}/10
                    </p>
                  )}
                </div>

                {/* Overall weighted dial */}
                <OverallDial value={overall?.avg ?? null} pct={overall?.pct ?? null} size={104} />
              </div>
            </div>
          )}

          {isSuperAdmin && load && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
              <ShieldCheck size={12} /> Weight profiles are configurable per designation in Admin.
            </p>
          )}
        </div>

        {/* BODY STATES */}
        {!candidateId ? (
          <EmptyState />
        ) : loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void selectCandidate(candidateId)} />
        ) : instance && ctrl ? (
          <div className="space-y-6">
            {EVAL_BUCKETS.map((bucket, bi) => {
              const sections = EVAL_SECTIONS.filter((s) => s.bucket === bucket.id);
              return (
                <div key={bucket.id} className="ev2-fade" style={{ animationDelay: `${bi * 60}ms` }}>
                  <BucketAccordion
                    n={bi + 1}
                    title={bucket.title}
                    blurb={bucket.blurb}
                    open={open[bucket.id] ?? true}
                    onToggle={() => setOpen((o) => ({ ...o, [bucket.id]: !(o[bucket.id] ?? true) }))}
                    right={<BucketChip bucket={bucket.id} instance={instance} />}
                  >
                    <div className="space-y-7">
                      {sections.map((s) => renderSection(s, ctrl, instance, profile))}
                    </div>
                  </BucketAccordion>
                </div>
              );
            })}

            {/* FINAL DECISION */}
            <div className="ev2-fade rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] max-sm:p-4">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                  <Gavel size={17} />
                </span>
                <div>
                  <h2 className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
                    Final Decision
                  </h2>
                  <p className="text-[12.5px] font-medium text-ink-muted">Your recommendation and the narrative behind it.</p>
                </div>
              </div>
              <RecommendationBar ctrl={ctrl} />
              <div className="mt-5 border-t border-hairline pt-5">
                <ClosingTextboxes ctrl={ctrl} />
              </div>
            </div>

            {/* Share / export actions */}
            <div className="ev2-noprint ev2-fade flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={printPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <Printer size={15} /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={shareWhatsApp}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
              >
                <Share2 size={15} /> Share on WhatsApp
              </button>
            </div>

            {/* Scorecard report — this evaluation + a side-by-side with the other role */}
            <div className="ev2-fade">
              <EvaluationV2Report
                interviewer={role === "interviewer" ? instance : load?.other ?? null}
                management={role === "management" ? instance : load?.other ?? null}
                profile={profile}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

/** Renders one section by its input kind, inside a titled shell. */
function renderSection(
  s: EvalSection,
  ctrl: EvalController,
  instance: EvaluationInstance,
  profile: WeightProfile,
): React.ReactNode {
  switch (s.input) {
    case "passfail":
      return (
        <SectionShell key={s.id} code={s.code} title={s.title}>
          <EligibilitySection ctrl={ctrl} />
        </SectionShell>
      );
    case "rating": {
      if (s.gatedBy && !isSectionApplicable(s, instance)) return null; // gated away
      return (
        <SectionShell key={s.id} code={s.code} title={s.title} gated={Boolean(s.gatedBy)}>
          <RatingSection ctrl={ctrl} section={s} />
        </SectionShell>
      );
    }
    case "xfactor":
      return (
        <SectionShell key={s.id} code={s.code} title={s.title}>
          <XFactorInput ctrl={ctrl} />
        </SectionShell>
      );
    case "gate":
      return (
        <SectionShell key={s.id} code={s.code} title={s.title}>
          <SellGate ctrl={ctrl} />
        </SectionShell>
      );
    case "overall":
      return (
        <SectionShell key={s.id} code={s.code} title={s.title}>
          <OverallInput ctrl={ctrl} instance={instance} profile={profile} />
        </SectionShell>
      );
    default:
      return null;
  }
}

/** Per-bucket progress chip in the accordion header. */
function BucketChip({ bucket, instance }: { bucket: string; instance: EvaluationInstance }) {
  if (bucket === "prerequisites") {
    const v = eligibilityVerdict(instance);
    const t = v.dealbreaker
      ? { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)", label: `${v.noItems.length} failed` }
      : v.answered === v.total
        ? { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "All clear" }
        : { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: `${v.answered}/${v.total}` };
    return <span className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold tabular-nums" style={{ background: t.bg, color: t.fg }}>{t.label}</span>;
  }
  const secs = EVAL_SECTIONS.filter((s) => s.bucket === bucket && s.input === "rating" && isSectionApplicable(s, instance));
  const ids = secs.flatMap(sectionItemIds);
  const rated = ids.filter((id) => id in instance.ratings || instance.cantSay.includes(id)).length;
  const done = ids.length > 0 && rated === ids.length;
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold tabular-nums"
      style={done
        ? { background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }
        : { background: "color-mix(in srgb, var(--color-altus-red) 9%, white)", color: RED_DEEP }}
    >
      {rated}/{ids.length} rated
    </span>
  );
}

function SaveState({ saving, dirty, loading }: { saving: boolean; dirty: boolean; loading: boolean }) {
  if (loading) return null;
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
      {saving ? (
        <><Loader2 size={13} className="animate-spin" style={{ color: RED }} /> Saving…</>
      ) : dirty ? (
        <><span className="inline-block h-2 w-2 rounded-full" style={{ background: RED }} /> Unsaved</>
      ) : (
        <><Check size={13} strokeWidth={3} style={{ color: "#15803d" }} /> Saved</>
      )}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="ev2-fade mt-2 grid place-items-center rounded-2xl border border-dashed border-hairline-strong bg-white px-6 py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#E106001a", color: RED_DEEP }}>
        <UserRound size={26} strokeWidth={2.1} />
      </span>
      <h2 className="mt-4 text-ink-strong" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20 }}>
        Choose a candidate to begin
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] font-medium text-ink-muted">
        Pick someone above and the full evaluation — non-negotiables, competency ratings and the final
        recommendation — opens up, autosaving as you fill it.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-2 grid place-items-center rounded-2xl border border-hairline bg-white py-24 text-ink-muted">
      <Loader2 className="animate-spin" style={{ color: RED }} />
      <p className="mt-2 text-[13.5px] font-medium">Loading this candidate&apos;s evaluation…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-2 grid place-items-center rounded-2xl border px-6 py-16 text-center" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, white)", background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" }}>
      <span className="grid h-13 w-13 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}>
        <AlertTriangle size={24} />
      </span>
      <h2 className="mt-3 text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>
        Couldn&apos;t load the evaluation
      </h2>
      <p className="mt-1 max-w-[44ch] text-[13.5px] font-medium text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-black"
      >
        Try again
      </button>
    </div>
  );
}

const CSS = `
  .ev2-fade { animation: ev2Fade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes ev2Fade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .ev2-collapse { animation: ev2Collapse 0.32s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes ev2Collapse { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .ev2-select-wrap { position: relative; }
  .ev2-select-wrap > select { position: relative; }
  .ev2-select-wrap::after { content: ""; position: absolute; right: 14px; bottom: 16px; width: 8px; height: 8px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: rotate(45deg); pointer-events: none; }
  .ev2-rating:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, ${RED} 30%, transparent); }
  .ev2-rec-dot { animation: ev2Pulse 1.1s ease-in-out infinite; }
  @keyframes ev2Pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .ev2-fade, .ev2-collapse, .ev2-rec-dot { animation: none !important; }
  }
  @media print {
    .ev2-noprint, .ev2-sticky { display: none !important; }
  }
`;

export default EvaluationV2Screen;
