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
  ScrollText,
  CircleCheck,
  Circle,
  FileDown,
  LogOut,
  MessagesSquare,
  ClipboardCheck,
  ClipboardList,
  Mail,
  Boxes,
  Lock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { PageShell } from "@/components/layout/page-shell";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import {
  getManagementAssessment,
  saveManagementAssessment,
  type ManagementAssessmentState,
} from "@/app/(app)/hr/management-assessment-actions";
import { getPolicySigningStatus } from "@/app/(app)/hr/record/policy-status";
import type { PolicySignStatus } from "@/app/(app)/hr/record/policy-status-types";
import { getExitStatus } from "@/app/(app)/hr/record/exit-status";
import type { ExitSummary } from "@/app/(app)/hr/record/exit-status-types";
import {
  getWorkflowStatus,
  createOfficialEmail,
  allocateAssets,
  type WorkflowStatus,
} from "@/app/(app)/hr/record/workflow-status";
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
  const [policy, setPolicy] = React.useState<PolicySignStatus | null>(null);
  const [policyLoading, setPolicyLoading] = React.useState(false);
  const [docketLoading, setDocketLoading] = React.useState(false);
  const [exit, setExit] = React.useState<ExitSummary | null>(null);
  const [exitLoading, setExitLoading] = React.useState(false);
  const [workflow, setWorkflow] = React.useState<WorkflowStatus | null>(null);
  const [workflowLoading, setWorkflowLoading] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [assetsBusy, setAssetsBusy] = React.useState(false);

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
    setPolicy(null); setPolicyLoading(false);
    setExit(null); setExitLoading(false);
    setWorkflow(null); setWorkflowLoading(false);
    if (!id) return;
    setLoading(true);
    // Workflow status (onboarding gate + email/asset provisioning) loads in
    // PARALLEL alongside policy + exit — never blocking the editor.
    setWorkflowLoading(true);
    void getWorkflowStatus(id)
      .then((res) => { if (cidRef.current === id) setWorkflow(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setWorkflow(null); })
      .finally(() => { if (cidRef.current === id) setWorkflowLoading(false); });
    // Policy-signing + exit records load in PARALLEL (never block the editor).
    setPolicyLoading(true);
    void getPolicySigningStatus(id)
      .then((res) => { if (cidRef.current === id) setPolicy(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setPolicy(null); })
      .finally(() => { if (cidRef.current === id) setPolicyLoading(false); });
    setExitLoading(true);
    void getExitStatus(id)
      .then((res) => { if (cidRef.current === id) setExit(res.ok ? res.status : null); })
      .catch(() => { if (cidRef.current === id) setExit(null); })
      .finally(() => { if (cidRef.current === id) setExitLoading(false); });
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

  async function downloadDocket() {
    const id = cidRef.current;
    if (!id || docketLoading) return;
    setDocketLoading(true);
    try {
      const res = await fetch("/api/hr/docket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: id }),
      });
      // A JSON body means "nothing to download" (or an error) — surface it as a toast.
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        fireToast({ message: data?.error || "Couldn't build the docket.", type: "error" });
        return;
      }
      if (!res.ok) {
        fireToast({ message: "Couldn't build the docket.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Docket-${(selected?.fullName || "person").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      fireToast({ message: "Docket downloaded.", type: "success" });
    } catch {
      fireToast({ message: "Couldn't build the docket.", type: "error" });
    } finally {
      setDocketLoading(false);
    }
  }

  async function handleCreateEmail() {
    const id = cidRef.current;
    if (!id || emailBusy) return;
    setEmailBusy(true);
    try {
      const res = await createOfficialEmail(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      if (cidRef.current === id) setWorkflow(res.status);
      fireToast({ message: `Official email created — welcome mail sent.`, type: "success" });
    } catch {
      fireToast({ message: "Couldn't create the official email.", type: "error" });
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleAllocateAssets() {
    const id = cidRef.current;
    if (!id || assetsBusy) return;
    setAssetsBusy(true);
    try {
      const res = await allocateAssets(id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      if (cidRef.current === id) setWorkflow(res.status);
      fireToast({ message: "Assets marked allocated.", type: "success" });
    } catch {
      fireToast({ message: "Couldn't mark assets allocated.", type: "error" });
    } finally {
      setAssetsBusy(false);
    }
  }

  React.useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const tone = STATUS_TONE[selected?.status ?? "new"] ?? STATUS_TONE.new!;

  return (
    <>
      <style>{CSS}</style>
      <PageShell width="narrow" py={false} className="pt-7 pb-24">
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
            {/* Pending / action-needed — the very TOP of the panel. */}
            <section className="col-span-12 rec-fade">
              <PendingSummary workflow={workflow} policy={policy} loading={workflowLoading || policyLoading} />
            </section>

            {/* Onboarding form — the HIGHEST-priority dependency: it gates email + assets. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={1}
                icon={<ClipboardList size={18} />}
                title="Onboarding Form"
                sub="The joining data form. It must be submitted before email & assets unlock."
              >
                <OnboardingCard workflow={workflow} loading={workflowLoading} />
              </RecordCard>
            </section>

            {/* Create Official Email — locked until onboarding submitted. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={2}
                icon={<Mail size={18} />}
                title="Create Official Email"
                sub="Provision firstname.lastname@altuscorp.com & send the welcome mail."
              >
                <EmailStepCard
                  workflow={workflow}
                  loading={workflowLoading}
                  busy={emailBusy}
                  onCreate={() => void handleCreateEmail()}
                />
              </RecordCard>
            </section>

            {/* Allocate Assets — locked until onboarding submitted. */}
            <section className="col-span-12 lg:col-span-4 rec-fade">
              <RecordCard
                n={3}
                icon={<Boxes size={18} />}
                title="Allocate Assets"
                sub="Hand over the laptop, access & kit — mark it done once allocated."
              >
                <AssetsStepCard
                  workflow={workflow}
                  loading={workflowLoading}
                  busy={assetsBusy}
                  onAllocate={() => void handleAllocateAssets()}
                />
              </RecordCard>
            </section>

            {/* Letters */}
            <section className="col-span-12 lg:col-span-7 rec-fade">
              <RecordCard
                n={4}
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
                n={5}
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
                {selected && (
                  <button
                    type="button"
                    onClick={() => void downloadDocket()}
                    disabled={docketLoading}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
                  >
                    {docketLoading ? (
                      <><Loader2 size={15} className="animate-spin" /> Building docket…</>
                    ) : (
                      <><FileDown size={15} /> Download docket (PDF)</>
                    )}
                  </button>
                )}
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
                  <UserRound size={13} className="mt-0.5 shrink-0" />
                  The docket merges every archived, signed document into one PDF packet. Files also live in the dossier vault.
                </p>
              </RecordCard>
            </section>

            {/* Policies signed record */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={6}
                icon={<ScrollText size={18} />}
                title="Policy Signatures"
                sub="How many firm policies this person has signed — and what's still pending."
                right={
                  <span
                    className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}
                  >
                    {policy ? policy.policies.filter((p) => p.signed).length : 0} / {policy ? policy.policies.length : 0} signed
                  </span>
                }
              >
                <PoliciesSigned status={policy} loading={policyLoading} />
              </RecordCard>
            </section>

            {/* Exit & Handover record */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={7}
                icon={<LogOut size={18} />}
                title="Exit & Handover"
                sub="This person's exit interview and handover clearance — populated once their separation begins."
                right={
                  <Link
                    href={"/hr/exit" as Route}
                    className="inline-flex items-center gap-1 rounded-pill border border-hairline-strong bg-white px-3 py-1 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                  >
                    Open Exit <ArrowUpRight size={13} />
                  </Link>
                }
              >
                <ExitHandover status={exit} loading={exitLoading} />
              </RecordCard>
            </section>

            {/* Skills requirement checklist */}
            <section className="col-span-12 rec-fade">
              <RecordCard
                n={8}
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
      </PageShell>
    </>
  );
}

/**
 * The per-person policy-signing record: a progress RING (signed / total) beside a
 * checklist of every published policy — a green tick when signed, a hollow ring
 * when still pending. When the person isn't yet linked to an employee account, a
 * gentle note explains why nothing is signed yet.
 */
function PoliciesSigned({ status, loading }: { status: PolicySignStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid place-items-center py-8 text-ink-muted">
        <Loader2 className="animate-spin" style={{ color: RED }} />
      </div>
    );
  }
  const policies = status?.policies ?? [];
  const total = policies.length;
  const signed = policies.filter((p) => p.signed).length;
  const remaining = total - signed;
  const pct = total > 0 ? signed / total : 0;
  const allDone = total > 0 && signed === total;

  // Ring geometry
  const R = 46;
  const C = 2 * Math.PI * R;
  const dash = C * pct;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {/* Progress ring */}
      <div className="flex shrink-0 items-center gap-4">
        <div className="relative grid place-items-center" style={{ width: 116, height: 116 }}>
          <svg width={116} height={116} viewBox="0 0 116 116" className="rec-ring">
            <circle cx={58} cy={58} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={10} />
            <circle
              cx={58} cy={58} r={R} fill="none"
              stroke={allDone ? "#15803d" : RED}
              strokeWidth={10} strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              transform="rotate(-90 58 58)"
              style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute grid place-items-center text-center">
            <span className="text-[26px] font-black leading-none tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              {signed}
              <span className="text-[15px] font-bold text-ink-subtle">/{total}</span>
            </span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Signed</span>
          </div>
        </div>
        <div className="sm:hidden">
          <p className="text-[13px] font-semibold text-ink-strong">{allDone ? "All policies signed 🎉" : `${remaining} remaining`}</p>
        </div>
      </div>

      {/* Checklist */}
      <div className="min-w-0 flex-1">
        {total === 0 ? (
          <p className="text-[13.5px] font-medium text-ink-muted">No policies are published yet.</p>
        ) : (
          <>
            <div className="mb-3 hidden items-center gap-2 sm:flex">
              {allDone ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }}>
                  <CircleCheck size={13} strokeWidth={2.6} /> All signed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
                  {remaining} remaining
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {policies.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: p.signed ? "color-mix(in srgb, #16a34a 30%, white)" : "var(--color-hairline)",
                    background: p.signed ? "color-mix(in srgb, #16a34a 6%, white)" : "var(--color-surface-soft)",
                  }}
                >
                  {p.signed ? (
                    <CircleCheck size={17} strokeWidth={2.4} style={{ color: "#15803d" }} className="shrink-0" />
                  ) : (
                    <Circle size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">{p.title}</span>
                  <span
                    className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: p.signed ? "#15803d" : "var(--color-ink-subtle)" }}
                  >
                    {p.signed ? "Signed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
            {status && !status.matched && (
              <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
                <UserRound size={13} className="mt-0.5 shrink-0" />
                Not yet linked to an employee account — signatures will appear here once this person joins and signs on day one.
              </p>
            )}
          </>
        )}
      </div>
    </div>
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

/** The per-person Exit & Handover summary — exit interview status + handover
 *  clearance progress, or a gentle note when there's nothing on file yet. */
function ExitHandover({ status, loading }: { status: ExitSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid place-items-center py-8 text-ink-muted">
        <Loader2 className="animate-spin" style={{ color: RED }} />
      </div>
    );
  }
  const started = Boolean(status && (status.interviewUpdatedAt || status.handoverUpdatedAt));
  if (!status || !started) {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-subtle">
        <UserRound size={13} className="mt-0.5 shrink-0" />
        {status && !status.matched
          ? "Not linked to an employee account yet — exit records will appear here once this person joins and their separation begins."
          : "No exit process on file yet — the exit interview and handover clearance will show here once started."}
      </p>
    );
  }
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const pct = status.handoverTotal > 0 ? Math.round((status.handoverCleared / status.handoverTotal) * 100) : 0;
  const handoverDone = status.handoverTotal > 0 && status.handoverCleared === status.handoverTotal;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Exit interview */}
      <div
        className="rounded-xl border px-4 py-3"
        style={
          status.interviewUpdatedAt
            ? { borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 6%, white)" }
            : { borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }
        }
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          <MessagesSquare size={13} /> Exit Interview
        </div>
        {status.interviewUpdatedAt ? (
          <p className="text-[13.5px] font-bold" style={{ color: "#15803d" }}>Completed · {fmtDate(status.interviewUpdatedAt)}</p>
        ) : (
          <p className="text-[13.5px] font-medium text-ink-subtle">Not done yet</p>
        )}
      </div>

      {/* Handover & clearance */}
      <div
        className="rounded-xl border px-4 py-3"
        style={
          handoverDone
            ? { borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 6%, white)" }
            : { borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }
        }
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          <ClipboardCheck size={13} /> Handover & Clearance
        </div>
        {status.handoverUpdatedAt ? (
          <>
            <p className="text-[13.5px] font-bold text-ink-strong tabular-nums">
              {status.handoverCleared}/{status.handoverTotal} cleared
              <span className="ml-1 text-[12px] font-semibold" style={{ color: handoverDone ? "#15803d" : RED_DEEP }}>({pct}%)</span>
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: handoverDone ? "#16a34a" : `linear-gradient(90deg, ${RED}, ${RED_DEEP})` }} />
            </div>
            <p className="mt-1 text-[11px] font-medium text-ink-subtle">Updated {fmtDate(status.handoverUpdatedAt)}</p>
          </>
        ) : (
          <p className="text-[13.5px] font-medium text-ink-subtle">Not started</p>
        )}
      </div>
    </div>
  );
}

/** A Locked / Ready / Done state chip for the onboarding-gated workflow steps. */
function StepBadge({ state }: { state: "locked" | "ready" | "done" }) {
  const map = {
    locked: { bg: "color-mix(in srgb, #f59e0b 14%, white)", fg: "#b45309", label: "Locked", Icon: Lock },
    ready: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: RED_DEEP, label: "Ready", Icon: Circle },
    done: { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d", label: "Done", Icon: CircleCheck },
  }[state];
  const { Icon } = map;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ background: map.bg, color: map.fg }}>
      <Icon size={12} strokeWidth={2.6} /> {map.label}
    </span>
  );
}

/** The "Pending / Action needed" banner at the very top — the actionable
 *  worklist for this person, prioritising the onboarding dependency first. */
function PendingSummary({
  workflow, policy, loading,
}: {
  workflow: WorkflowStatus | null;
  policy: PolicySignStatus | null;
  loading: boolean;
}) {
  const items: string[] = [];
  const matched = workflow?.matched ?? false;

  if (matched) {
    if (!workflow!.onboardingSubmitted) {
      items.push(workflow!.onboardingExists ? "Onboarding form is a draft — awaiting submission" : "Onboarding form not started");
    }
    if (workflow!.onboardingSubmitted && !workflow!.emailProvisionedAt) items.push("Official company email not created");
    if (workflow!.onboardingSubmitted && !workflow!.assetsAllocatedAt) items.push("Company assets not allocated");
  }
  if (policy && policy.matched) {
    const pending = policy.policies.filter((p) => !p.signed).length;
    if (pending > 0) items.push(`${pending} ${pending === 1 ? "policy" : "policies"} pending signature`);
  }

  const allClear = matched && items.length === 0;
  const border = allClear
    ? "color-mix(in srgb, #16a34a 34%, white)"
    : items.length > 0
      ? "color-mix(in srgb, #f59e0b 40%, white)"
      : "var(--color-hairline)";
  const bg = allClear
    ? "color-mix(in srgb, #16a34a 7%, white)"
    : items.length > 0
      ? "color-mix(in srgb, #f59e0b 8%, white)"
      : "var(--color-surface-soft)";

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: border, background: bg }}>
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: allClear ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#f59e0b,#b45309)" }}
        >
          {allClear ? <CircleCheck size={18} /> : <AlertTriangle size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}>
            {loading ? "Checking what needs action…" : allClear ? "All clear — nothing pending" : items.length > 0 ? "Pending · action needed" : "Nothing to action yet"}
          </h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
            {loading
              ? "Loading this person's workflow status."
              : allClear
                ? "Onboarding, email, assets and every policy are complete."
                : items.length > 0
                  ? "Clear these first — they sit above the rest of the file for a reason."
                  : "Not yet linked to an employee account — items appear here once this person joins."}
          </p>
        </div>
      </div>
      {!loading && items.length > 0 && (
        <ul className="mt-3.5 grid gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] font-semibold text-ink-strong">
              <ArrowRight size={14} strokeWidth={2.6} style={{ color: "#b45309" }} className="shrink-0" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The onboarding-form status body — the gating dependency for email + assets. */
function OnboardingCard({ workflow, loading }: { workflow: WorkflowStatus | null; loading: boolean }) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="onboarding" />;
  const submitted = workflow.onboardingSubmitted;
  const draft = workflow.onboardingExists && !submitted;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={submitted ? "done" : "ready"} />
        {submitted && workflow.onboardingSubmittedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.onboardingSubmittedAt)}</span>
        )}
      </div>
      <p className="text-[13.5px] font-semibold text-ink-strong">
        {submitted ? "Onboarding form submitted." : draft ? "Onboarding form saved as a draft." : "Onboarding form not started yet."}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-subtle">
        {submitted
          ? "Email creation and asset allocation are unlocked."
          : "Email creation and asset allocation stay locked until this is submitted."}
      </p>
      {!submitted && (
        <Link
          href={"/dossier/onboarding" as Route}
          className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
        >
          Open onboarding form <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

/** Create-official-email step — locked until onboarding submitted. */
function EmailStepCard({
  workflow, loading, busy, onCreate,
}: {
  workflow: WorkflowStatus | null;
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="email creation" />;

  const done = Boolean(workflow.emailProvisionedAt);
  const unlocked = workflow.onboardingSubmitted;
  const state: "locked" | "ready" | "done" = done ? "done" : unlocked ? "ready" : "locked";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={state} />
        {done && workflow.emailProvisionedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.emailProvisionedAt)}</span>
        )}
      </div>

      {done ? (
        <>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Official email</p>
          <p className="mt-0.5 break-all text-[14px] font-black text-ink-strong">{workflow.officialEmail}</p>
          <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-ink-subtle">
            <Mail size={13} className="mt-0.5 shrink-0" /> Welcome mail sent to their personal inbox with login details.
          </p>
        </>
      ) : unlocked ? (
        <>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">Will provision</p>
          <p className="mt-0.5 break-all text-[14px] font-black text-ink-strong">{workflow.suggestedOfficialEmail}</p>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Mail size={14} /> Create email & welcome</>}
          </button>
        </>
      ) : (
        <LockedNote>Unlocks once the onboarding form is submitted.</LockedNote>
      )}
    </div>
  );
}

/** Allocate-assets step — locked until onboarding submitted. */
function AssetsStepCard({
  workflow, loading, busy, onAllocate,
}: {
  workflow: WorkflowStatus | null;
  loading: boolean;
  busy: boolean;
  onAllocate: () => void;
}) {
  if (loading) return <StepSpinner />;
  if (!workflow?.matched) return <UnlinkedNote what="asset allocation" />;

  const done = Boolean(workflow.assetsAllocatedAt);
  const unlocked = workflow.onboardingSubmitted;
  const state: "locked" | "ready" | "done" = done ? "done" : unlocked ? "ready" : "locked";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <StepBadge state={state} />
        {done && workflow.assetsAllocatedAt && (
          <span className="text-[12px] font-semibold text-ink-muted">{fmtDay(workflow.assetsAllocatedAt)}</span>
        )}
      </div>

      {done ? (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-strong">
          <CircleCheck size={15} strokeWidth={2.4} style={{ color: "#15803d" }} className="mt-0.5 shrink-0" />
          Company assets allocated to this employee.
        </p>
      ) : unlocked ? (
        <>
          <p className="text-[13px] leading-relaxed text-ink-muted">Hand over the laptop, access and kit, then mark it complete.</p>
          <button
            type="button"
            onClick={onAllocate}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Marking…</> : <><Boxes size={14} /> Mark assets allocated</>}
          </button>
        </>
      ) : (
        <LockedNote>Unlocks once the onboarding form is submitted.</LockedNote>
      )}
    </div>
  );
}

function StepSpinner() {
  return (
    <div className="grid place-items-center py-6 text-ink-muted">
      <Loader2 className="animate-spin" style={{ color: RED }} size={18} />
    </div>
  );
}

function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-soft px-3 py-2.5 text-[12.5px] font-medium leading-relaxed text-ink-muted">
      <Lock size={13} className="mt-0.5 shrink-0" style={{ color: "#b45309" }} /> {children}
    </p>
  );
}

function UnlinkedNote({ what }: { what: string }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-subtle">
      <UserRound size={13} className="mt-0.5 shrink-0" />
      Not yet linked to an employee account — {what} becomes available once this person joins.
    </p>
  );
}

/** Friendly "12 Aug 2026" for an ISO string. */
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
    <div className="mt-6 grid place-items-center rounded-2xl border border-solid border-hairline-strong bg-white px-6 py-20 text-center">
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
