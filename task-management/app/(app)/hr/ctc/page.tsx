import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { loadCtcRoster } from "@/app/(app)/hr/ctc/actions";
import { CtcWorkbench } from "@/components/hr/ctc/ctc-workbench";

export const dynamic = "force-dynamic";

/**
 * Pre-Joining → CTC / Compensation Workbench (`/hr/ctc`). For a selected employee
 * + paying entity, build/edit a structured CTC breakup (earnings, deductions,
 * employer contributions → gross, net, total CTC), versioned over time as a
 * Growth Journey with undo/redo, and jump to the compensation letters that quote
 * the numbers. Full-screen focused surface (no rail) — its own back button navs.
 */
export default async function CtcPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const roster = await loadCtcRoster().catch(() => []);

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/hr?open=pre-joining" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Back to Pre-Joining</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <span className="justify-self-center truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          CTC / Compensation Workbench
        </span>
        <span aria-hidden className="justify-self-end" />
      </header>

      <PageShell width="standard" py={false} className="pt-8 pb-24">
        <CtcWorkbench roster={roster} isAdmin={isAdmin} />
      </PageShell>
    </div>
  );
}
