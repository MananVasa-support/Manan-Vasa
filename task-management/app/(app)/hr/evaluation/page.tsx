import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { EvaluationV2Screen } from "@/components/hr/candidate/evaluation-v2/evaluation-v2-screen";
import { WeightMatrixPanel } from "@/components/hr/candidate/evaluation-v2/weight-matrix-panel";
import type { EvaluatorRole } from "@/lib/hr/candidate/evaluation-v2";

export const dynamic = "force-dynamic";

/**
 * Candidate Evaluation v2 — the structured, weighted, two-instance instrument.
 * A FULL-SCREEN focused surface (no rail). Interviewer role by default; the
 * Management Assessment links in with `?role=management&candidate=<id>` to fill
 * its own management pass on the same instrument (locked to that candidate).
 */
export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; candidate?: string }>;
}) {
  const me = await requireWorkspace("hr");
  const superAdmin = isSuperAdmin(me.email);
  const { role: roleParam, candidate } = await searchParams;
  const role: EvaluatorRole = roleParam === "management" ? "management" : "interviewer";

  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  const backHref = (role === "management" ? "/hr/management-assessment" : "/hr?open=pre-interview") as Route;
  const backLabel = role === "management" ? "Back to Assessment" : "Back to Pre-Interview";

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={backHref}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">{backLabel}</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      {superAdmin && (
        <div className="mx-auto w-full max-w-[1120px] px-6 max-md:px-4 pt-6">
          <WeightMatrixPanel />
        </div>
      )}

      <EvaluationV2Screen
        candidates={candidates}
        role={role}
        isSuperAdmin={superAdmin}
        fixedCandidateId={candidate || undefined}
      />
    </div>
  );
}
