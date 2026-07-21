import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { MODULE_THEME } from "@/lib/module-theme";
import { getPlanDayPayload } from "./payload";

const THEME = MODULE_THEME.goals;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export const dynamic = "force-dynamic";

/**
 * Plan-Your-Day (Module 4) — the redesigned drag-drop planner.
 *
 * Phase 5 (design §2.1): this route is now the DEEP-LINK ALIAS of the canvas
 * Day zoom stage — both render the SAME `<PlanBoard/>` fed by the SAME
 * `getPlanDayPayload` assembler, so the two surfaces can never drift. The
 * board persists to `daily_checklist` (same table the plan gate counts).
 */
export default async function GoalsPlanPage() {
  const { me } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const payload = await getPlanDayPayload(me.id);
  const isManager = payload.isManager;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-6 max-md:px-3 pt-5 pb-12">
        <header className="mb-4 wg-rise">
          <div className="flex items-start justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              Goals · Daily Loop
            </span>
            {isManager && (
              <a
                href="/goals/recycle-bin"
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
              >
                <Trash2 size={13} /> Recycle Bin
              </a>
            )}
          </div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(22px, 2.3vw, 30px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 4,
            }}
          >
            Plan my day
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 13.5, maxWidth: "70ch" }}>
            Line up today from your goals and tasks — drag a card into the plan, or tap +. Hit your minimum to start a focused day.
          </p>
        </header>
        <PlanBoard
          initialPlan={payload.initialPlan}
          sources={payload.sources}
          minItems={payload.minItems}
          isManager={payload.isManager}
          initialPhase={payload.initialPhase}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
