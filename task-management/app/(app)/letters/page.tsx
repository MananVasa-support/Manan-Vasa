import { Mail } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listAllLetters, listMyLetters, listActiveRoster } from "@/lib/hr/sections";
import { LettersWorkspace } from "@/components/hr/letters/letters-workspace";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function LettersPage() {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Letters"
        Icon={Mail}
        blurb="HR letters — offer, confirmation, increment and experience letters, per employee. This section is being built."
      />
    );
  }

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const [letters, roster] = await Promise.all([
    isAdmin ? listAllLetters() : listMyLetters(me.id),
    isAdmin ? listActiveRoster() : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Letters
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            {isAdmin ? "HR letters" : "My letters"}
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] font-medium text-ink-muted">
            {isAdmin
              ? "Issue and archive offer, confirmation, increment and experience letters per employee. Each person sees their own here."
              : "Your offer, confirmation, increment and experience letters, all in one place."}
          </p>
        </header>
        <LettersWorkspace letters={letters} isAdmin={isAdmin} roster={roster} />
      </main>
      <DashboardFooter />
    </>
  );
}
