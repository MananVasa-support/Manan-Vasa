"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  IdCard,
  Loader2,
  Check,
  Save,
  ArrowUpRight,
  FolderLock,
  FileSignature,
  Sparkles,
  Wrench,
  HeartHandshake,
  Library,
  UserRound,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import {
  getManagementAssessment,
  saveManagementAssessment,
  type ManagementAssessmentState,
} from "@/app/(app)/hr/management-assessment-actions";
import { SkillMultiSelect, type SkillSelection } from "@/components/hr/candidate/skill-multiselect";
import type { SkillLookupOptions } from "@/lib/hr/skills";

const EMPTY_SKILLS: SkillSelection = { technical: [], nonTechnical: [] };

/**
 * The per-person HR Record hub (`/hr/record`). Pick a candidate, then work their
 * whole file from one room:
 *   1. Letters — one-tap Compose links (name + gender pre-seeded via ?candidate=)
 *      for the recruitment/appointment letters, plus the full Letters library.
 *   2. Skills requirement checklist — the bare-minimum "can they do it" surface,
 *      edited HERE with inline +Add/Delete. Persisted onto the SAME
 *      management_assessment.skills field the Management Assessment reads (no new
 *      storage / migration) so it stays one source of truth.
 *   3. Documents — a jump to the person's dossier vault.
 *
 * Saving skills re-persists the WHOLE management_assessment blob (notes,
 * recordings, outcome, …) unchanged around the new skills, so editing here never
 * clobbers what the MA screen captured.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** Recruitment → appointment letters worth composing straight from a record.
 *  Keys mirror the letters registry; titles are inlined so we don't pull the
 *  (server-side) template graph into this client bundle. */
const RECORD_LETTERS: { key: string; title: string; blurb: string }[] = [
  { key: "selection", title: "Selection Letter", blurb: "Extend the role to the selected candidate." },
  { key: "acceptance", title: "Acceptance Letter", blurb: "Their written acceptance of the offer." },
  { key: "appointment", title: "Appointment Letter", blurb: "The formal appointment on the letterhead." },
  { key: "confirmation", title: "Confirmation Letter", blurb: "Confirm the employee after probation." },
  { key: "free-training", title: "Free Training Letter", blurb: "Pre-employment training & evaluation." },
];

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

/** Map a loaded MA state back to the save-action input, so re-saving skills keeps
 *  every other MA field intact. */
function maToInput(ma: ManagementAssessmentState, skills: SkillSelection) {
  return {
    notes: ma.notes,
    recordings: ma.recordings.map((r) => ({ path: r.path, durationSec: r.durationSec, createdAt: r.createdAt })),
    attachments: ma.attachments.map((a) => ({ path: a.path, name: a.name, mime: a.mime, size: a.size })),
    designation: ma.designation,
    dateOfJoining: ma.dateOfJoining,
    outcome: ma.outcome,
    oneMoreAssignment: ma.oneMoreAssignment,
    assignmentBrief: ma.assignmentBrief,
    recruiter: ma.recruiter,
    rejectionReason: ma.rejectionReason,
    skills: { technical: skills.technical, nonTechnical: skills.nonTechnical },
    managementScore: ma.managementScore,
    proposedSalary: ma.proposedSalary,
  };
}

export function HrRecordScreen({
  candidates,
  skillOptions,
  isAdmin,
}: {
  candidates: CandidateRow[];
  skillOptions: SkillLookupOptions;
  isAdmin: boolean;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [skills, setSkills] = React.useState<SkillSelection>(EMPTY_SKILLS);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const maRef = React.useRef<ManagementAssessmentState | null>(null);
  const skillsRef = React.useRef(skills); skillsRef.current = skills;
  const cidRef = React.useRef(candidateId); cidRef.current = candidateId;
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = candidates.find((c) => c.id === candidateId) ?? null;
  const skillCount = skills.technical.length + skills.nonTechnical.length;

  const saveNow = React.useCallback(async () => {
    const id = cidRef.current;
    const ma = maRef.current;
    if (!id || !ma) return;
    setSaving(true);
    try {
      const res = await saveManagementAssessment(id, maToInput(ma, skillsRef.current));
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      // Keep the local MA mirror's skills in sync for the next save.
      maRef.current = { ...ma, skills: { technical: skillsRef.current.technical, nonTechnical: skillsRef.current.nonTechnical } };
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = React.useCallback(() => {
    if (!cidRef.current || !maRef.current) return;
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 800);
  }, [saveNow]);

  async function selectCandidate(id: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setCandidateId(id); cidRef.current = id;
    setSkills(EMPTY_SKILLS); skillsRef.current = EMPTY_SKILLS;
    maRef.current = null;
    setDirty(false);
    if (!id) return;
    setLoading(true);
    try {
      const state = await getManagementAssessment(id);
      maRef.current = state;
      const next = state.skills
        ? { technical: state.skills.technical, nonTechnical: state.skills.nonTechnical }
        : EMPTY_SKILLS;
      setSkills(next); skillsRef.current = next;
    } catch {
      fireToast({ message: "Couldn't load this person's record.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function updateSkills(next: SkillSelection) {
    setSkills(next); skillsRef.current = next;
    scheduleSave();
  }

  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const tone = STATUS_TONE[selected?.status ?? "new"] ?? STATUS_TONE.new!;

  return (
    <>
      <style>{CSS}</style>
      <main className="mx-auto w-full max-w-[1120px] px-6 max-md:px-4 pt-7 pb-24">
        {/* Hero */}
        <div className="mb-6 rec-fade">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <IdCard size={13} strokeWidth={2.6} /> HR · Record
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            HR Record
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[15px] font-medium text-ink-muted">
            One room for a person&apos;s whole file — compose their letters, judge the bare-minimum
            skills they must have, and reach their documents. Pick who you&apos;re working on to begin.
          </p>
        </div>

        {/* Person picker + header */}
        <div className="rec-fade rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
          <label htmlFor="rec-candidate" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            Person
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rec-select-wrap min-w-[280px] flex-1">
              <select
                id="rec-candidate"
                data-autofocus
                value={candidateId}
                onChange={(e) => void selectCandidate(e.target.value)}
                className="w-full appearance-none rounded-xl border border-hairline-strong bg-white px-3.5 py-3 pr-9 text-[14.5px] font-semibold text-ink-strong outline-none transition-colors focus:border-altus-red"
              >
                <option value="">— Select a person —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName || "Unnamed"}{c.positionApplied ? ` · ${c.positionApplied}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Save status */}
            {candidateId && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" style={{ color: RED }} /> Saving…</>
                  ) : dirty ? (
                    <><span className="inline-block h-2 w-2 rounded-full" style={{ background: RED }} /> Unsaved</>
                  ) : (
                    <><Check size={14} strokeWidth={3} style={{ color: "#15803d" }} /> Saved</>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void saveNow()}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                >
                  <Save size={14} /> Save
                </button>
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rec-fade">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[16px] font-black text-white"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}
              >
                {initials(selected.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[17px] font-black leading-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
                  {selected.fullName || "Unnamed"}
                </p>
                <p className="truncate text-[13px] font-medium text-ink-muted">
                  {[selected.positionApplied || selected.position, selected.department].filter(Boolean).join(" · ") || "Position not set"}
                </p>
              </div>
              <span
                className="ml-auto inline-flex items-center rounded-pill px-3 py-1 text-[12px] font-bold"
                style={{ background: tone.bg, color: tone.fg }}
              >
                {tone.label}
              </span>
              {selected.mobile && (
                <span className="inline-flex items-center rounded-pill border border-hairline px-3 py-1 text-[12px] font-semibold text-ink-muted">
                  {selected.mobile}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {!candidateId ? (
          <EmptyState />
        ) : loading ? (
          <div className="mt-6 grid place-items-center rounded-2xl border border-hairline bg-white py-24 text-ink-muted">
            <Loader2 className="animate-spin" style={{ color: RED }} />
            <p className="mt-2 text-[13.5px] font-medium">Loading this person&apos;s record…</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-12 gap-5">
            {/* Letters */}
            <section className="col-span-12 lg:col-span-7 rec-fade">
              <RecordCard
                n={1}
                icon={<FileSignature size={18} />}
                title="Letters"
                sub="Compose a letter for this person — their name & gender are pre-filled."
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {RECORD_LETTERS.map((l) => (
                    <Link
                      key={l.key}
                      href={`/hr/letters/${l.key}?candidate=${candidateId}` as Route}
                      className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface-card px-3.5 py-3 text-left transition-all hover:border-hairline-strong hover:shadow-md"
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                        <FileSignature size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-[14px] font-bold text-ink-strong">
                          {l.title}
                          <ArrowUpRight size={14} className="text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                        <span className="mt-0.5 block text-[12px] font-medium leading-snug text-ink-muted">{l.blurb}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  href={"/hr/letters" as Route}
                  className="mt-3 inline-flex items-center gap-2 rounded-pill border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                >
                  <Library size={15} /> Browse all letters <ArrowUpRight size={14} />
                </Link>
              </RecordCard>
            </section>

            {/* Documents */}
            <section className="col-span-12 lg:col-span-5 rec-fade">
              <RecordCard
                n={3}
                icon={<FolderLock size={18} />}
                title="Documents"
                sub="Their secure document vault — appointment, CTC, IDs & more."
              >
                <Link
                  href={"/dossier" as Route}
                  className="group flex items-center gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3.5 text-left transition-all hover:border-hairline-strong hover:shadow-md"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}>
                    <FolderLock size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-ink-strong">Open dossier</span>
                    <span className="block text-[12.5px] font-medium text-ink-muted">Every document on file, in one secure place.</span>
                  </span>
                  <ArrowUpRight size={17} className="shrink-0 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
                  <UserRound size={13} className="mt-0.5 shrink-0" />
                  Once the candidate becomes an employee, their files live in the dossier vault.
                </p>
              </RecordCard>
            </section>

            {/* Skills requirement checklist */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={2}
                icon={<Sparkles size={18} />}
                title="Skills requirement checklist"
                sub="The bare-minimum skills this role demands — tick what they can genuinely do. Add or remove options inline."
                right={
                  <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
                    {skillCount} selected
                  </span>
                }
              >
                <SkillMultiSelect value={skills} onChange={updateSkills} options={skillOptions} isAdmin={isAdmin} />

                {skillCount > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <SkillGroupSummary
                      icon={<Wrench size={13} strokeWidth={2.4} />}
                      title="Technical"
                      items={skills.technical}
                      tone="technical"
                    />
                    <SkillGroupSummary
                      icon={<HeartHandshake size={13} strokeWidth={2.4} />}
                      title="Non-Technical"
                      items={skills.nonTechnical}
                      tone="nonTechnical"
                    />
                  </div>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
                  Saved onto the person&apos;s record — the same skills the Management Assessment shows.
                </p>
              </RecordCard>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function SkillGroupSummary({
  icon, title, items, tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: "technical" | "nonTechnical";
}) {
  const chip =
    tone === "technical"
      ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }
      : { background: "color-mix(in srgb, #2563eb 10%, white)", color: "#1d4ed8" };
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        <span className="text-altus-red">{icon}</span> {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-ink-subtle">None ticked yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <span key={s} className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-bold" style={chip}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordCard({
  n, icon, title, sub, right, children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  sub: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-black tabular-nums text-ink-subtle">{String(n).padStart(2, "0")}</span>
            <h2 className="text-[17px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
              {title}
            </h2>
            {right && <span className="ml-auto">{right}</span>}
          </div>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-ink-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-hairline-strong bg-white px-6 py-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#E106001a", color: RED_DEEP }}>
        <IdCard size={26} strokeWidth={2.1} />
      </span>
      <h2 className="mt-4 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20 }}>
        Choose a person to open their record
      </h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] font-medium text-ink-muted">
        Their letters, skills checklist and documents unlock the moment you pick someone above.
      </p>
    </div>
  );
}

const CSS = `
  .rec-fade { animation: recFade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes recFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .rec-select-wrap { position: relative; }
  .rec-select-wrap::after { content: ""; position: absolute; right: 14px; top: 50%; width: 9px; height: 9px; border-right: 2px solid var(--color-ink-subtle); border-bottom: 2px solid var(--color-ink-subtle); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { .rec-fade { animation: none !important; } }
`;
