import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { PageShell } from "@/components/layout/page-shell";
import { getCandidateBasics, getCandidateEvaluation } from "@/app/(app)/hr/candidate-actions";
import { EvaluationRecord } from "@/components/hr/candidate/evaluation-record";

export const dynamic = "force-dynamic";

/**
 * Candidate → Evaluation Checklist Record. A read-only, full-screen view of a
 * candidate's saved evaluation (overall + section scores + every criterion's
 * stars + Quick Summary). Opened from the Candidate Records list.
 */
export default async function EvaluationRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await requireHrStaff();
  const { id } = await params;
  const [basics, ratings] = await Promise.all([getCandidateBasics(id), getCandidateEvaluation(id)]);
  if (!basics) notFound();

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr/candidates" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to Candidate Records</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>
      <PageShell width="narrow" py={false} className="pt-8 pb-20">
        <EvaluationRecord name={basics.fullName} position={basics.positionApplied} ratings={ratings} />
      </PageShell>
    </div>
  );
}
