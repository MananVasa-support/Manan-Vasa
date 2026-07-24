import { FileText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listTemplates } from "@/app/(app)/hr-docs/actions";
import { loadHrRoster } from "@/lib/hr-docs/roster";
import { SimpleDocHub } from "@/components/hr-docs/simple-hub";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * HR Documents — the letter library. A clean template gallery (SimpleDocHub)
 * that composes any letter via the self-contained LetterCompose → /api/hr-docs
 * endpoints. (The old DocumentHub + its CTC/admin editors imported the heavy
 * action graph and hung the webpack compile — replaced here.)
 */
export default async function HrDocsPage() {
  const me = await requireWorkspace("hr");
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  if (!isAdmin) {
    return (
      <Shell subtitle="HR letters are composed and issued by the HR desk. Your issued documents appear in your Dossier.">
        <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink-muted">
            Letters are issued by HR. If you need one, reach out to the HR desk.
          </p>
        </div>
      </Shell>
    );
  }

  const res = await listTemplates();
  const templates = res.ok ? res.templates : [];
  const roster = await loadHrRoster();

  return (
    <Shell subtitle="Compose from the letter library — pick a template, edit the wording inline, and issue.">
      <SimpleDocHub templates={templates} roster={roster} hrName={me.name} />
    </Shell>
  );
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1280px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <FileText size={13} strokeWidth={2.6} /> HR · Letters
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px,3.6vw,46px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Letter Library
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">{subtitle}</p>
        </header>
        {children}
      </main>
      <DashboardFooter />
    </>
  );
}
