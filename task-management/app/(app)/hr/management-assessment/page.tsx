import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { getEvaluationWeights } from "@/app/(app)/hr/eval-weights-actions";
import { equalWeights, type EvaluationWeights } from "@/lib/hr/candidate/evaluation-weights";
import { listSkillLookups, type SkillLookupOptions } from "@/lib/hr/skills";
import { ManagementAssessmentScreen } from "@/components/hr/candidate/management-assessment-screen";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview → Management Assessment. A FULL-SCREEN focused surface (no rail,
 * no app header). Pick the candidate, then capture the management round: rich
 * dictated notes, in-browser voice recordings, and file/image/video attachments —
 * all persisted onto that candidate's record.
 */
export default async function ManagementAssessmentPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  const emptySkills: SkillLookupOptions = {
    technical: [],
    nonTechnical: [],
    custom: { technical: [], nonTechnical: [] },
  };
  let skillOptions: SkillLookupOptions = emptySkills;
  try {
    skillOptions = await Promise.race([
      listSkillLookups(),
      new Promise<SkillLookupOptions>((resolve) => setTimeout(() => resolve(emptySkills), 3500)),
    ]);
  } catch {
    skillOptions = emptySkills;
  }

  let weights: EvaluationWeights = equalWeights();
  try {
    weights = await Promise.race([
      getEvaluationWeights(),
      new Promise<EvaluationWeights>((resolve) => setTimeout(() => resolve(equalWeights()), 3500)),
    ]);
  } catch {
    weights = equalWeights();
  }

  return (
    <div className="min-h-dvh" style={{ background: "#faf9fb" }}>
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr?open=pre-interview" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to Pre-Interview</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      <ManagementAssessmentScreen candidates={candidates} skillOptions={skillOptions} isAdmin={isAdmin} weights={weights} />
    </div>
  );
}
