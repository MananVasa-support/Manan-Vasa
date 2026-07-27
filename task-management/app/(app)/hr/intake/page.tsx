import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listInterviewPositions, listCandidateDrafts, getCandidateDraft } from "@/app/(app)/hr/candidate-actions";
import { listDepartments } from "@/lib/queries/departments";
import { IntakeFormLauncher } from "@/components/hr/candidate/intake-form-launcher";
import { IntakeChooser } from "@/components/hr/candidate/intake-chooser";
import type { IntakeInitial } from "@/components/hr/candidate/intake-wizard";

export const dynamic = "force-dynamic";

/**
 * Pre-Interview → Candidate Interview Form. Default view = the New/Continue
 * chooser. `?new=1` opens a fresh wizard; `?draft=<id>` resumes/edits a saved
 * candidate. The wizard autosaves to the DB, so nothing is lost on refresh/leave.
 */
export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; draft?: string }>;
}) {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const sp = await searchParams;

  // ── Wizard mode: new form, or resume/edit an existing candidate ──
  if (sp.new || sp.draft) {
    const [positions, depts] = await Promise.all([
      listInterviewPositions().catch(() => [] as string[]),
      listDepartments().catch(() => []),
    ]);
    const departments = depts.filter((d) => d.isActive).map((d) => d.name);

    let initial: IntakeInitial | undefined;
    if (sp.draft) {
      const d = await getCandidateDraft(sp.draft).catch(() => null);
      if (d) {
        initial = {
          draftId: d.id,
          values: d.values,
          instances: d.instances,
          photoPath: d.photoPath,
          signaturePath: d.signaturePath,
          startAtReview: d.submitted,
        };
      }
    }
    return <IntakeFormLauncher positions={positions} departments={departments} canManagePositions={isAdmin} initial={initial} />;
  }

  // ── Chooser mode (default): start new or continue an unfinished form ──
  const drafts = await listCandidateDrafts().catch(() => []);
  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
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
      <main className="mx-auto w-full max-w-[1080px] px-6 max-md:px-4 pt-10 pb-20">
        <IntakeChooser drafts={drafts} />
      </main>
    </div>
  );
}
