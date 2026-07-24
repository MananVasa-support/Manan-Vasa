import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listCandidateIntakes } from "@/app/(app)/hr/candidate-actions";
import { BasicDetailsScreen } from "@/components/hr/candidate/basic-details-screen";

export const dynamic = "force-dynamic";

/**
 * Post-Interview → Candidate Records. A FULL-SCREEN focused list surface — no
 * left rail, no app header (chrome-shell hides the rail here). Altus logo, a
 * "Back to Post-Interview" button, and the searchable list of every candidate
 * whose interview form (/hr/intake) was filled. "New" jumps to the form.
 */
export default async function CandidatesPage() {
  await requireWorkspace("hr");

  // Resilient: a slow/failed/hanging list load must never block the form.
  let candidates: Awaited<ReturnType<typeof listCandidateIntakes>> = [];
  try {
    candidates = await Promise.race([
      listCandidateIntakes(),
      new Promise<typeof candidates>((resolve) => setTimeout(() => resolve([]), 3500)),
    ]);
  } catch {
    candidates = [];
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* Focused top bar — logo centred, Back-to-popup on the left */}
      <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr?open=post-interview" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to Post-Interview</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-6 max-md:px-4 pt-8 pb-16">
        <div className="mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}
          >
            Post-Interview · Candidate Records
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Candidate Records
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            Every candidate whose interview form was filled — search, review and track status.
          </p>
        </div>
        <BasicDetailsScreen candidates={candidates} />
      </main>
    </div>
  );
}
