import { redirect } from "next/navigation";
import type { Route } from "next";
import { Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { getScoreConfig } from "@/lib/queries/pms";
import { ScoreConfigEditor } from "@/components/pms/score-config-editor";
import { MODULE_THEME } from "@/lib/module-theme";

export const dynamic = "force-dynamic";

const ACCENT = MODULE_THEME.employees.accent;
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

export default async function PmsConfigPage() {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) redirect("/pms" as Route);

  const config = await getScoreConfig();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Settings size={13} strokeWidth={2.6} /> Employees · Performance · Settings
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.2vw,42px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
          >
            Scoring policy
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "64ch" }}>
            You define exactly how performance is measured — every weight, threshold and curve lives
            here as data, not code. Changes apply on the next score, no deploy.
          </p>
        </header>

        <ScoreConfigEditor initial={config} />
      </main>
      <DashboardFooter />
    </>
  );
}
