import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { getPlanDayPayload } from "./payload";

export const dynamic = "force-dynamic";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-11" → "11 Aug". Reads the IST ymd the payload already resolved —
 *  no re-parse, so the header can't disagree with the board about the day. */
function longDay(ymd: string): string {
  const [, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return ymd;
  return `${Number(d)} ${MONTH_ABBR[mi]}`;
}

/**
 * Plan-Your-Day (Module 4) — the redesigned drag-drop planner.
 *
 * Phase 5 (design §2.1): this route is now the DEEP-LINK ALIAS of the canvas
 * Day zoom stage — both render the SAME `<PlanBoard/>` fed by the SAME
 * `getPlanDayPayload` assembler, so the two surfaces can never drift. The
 * board persists to `daily_checklist` (same table the plan gate counts).
 */
export default async function GoalsPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  // PERSONAL space (admins) → the private day board (goals table, scope=personal).
  if ((await goalsSpace(isAdmin)) === "personal") {
    const sp = await searchParams;
    const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const data = await loadPersonalWD("day", { day: pick(sp.day), emp: pick(sp.emp) });
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <PersonalWDBoard data={data} />
        <DashboardFooter />
      </>
    );
  }

  const payload = await getPlanDayPayload(me.id);
  const isManager = payload.isManager;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-5 pb-12 max-md:pt-4 max-md:pb-10">
        {/* One title bar for BOTH doors into this page (Goals › Plan My Day and
            WMS › My Day) — deliberately room-neutral, because it is literally
            the same surface and the same daily state either way. */}
        <header className="mb-5 flex items-end justify-between gap-4 wg-rise max-sm:flex-col max-sm:items-start max-sm:gap-2">
          <div className="min-w-0">
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(22px, 2.3vw, 30px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              My Day
            </h1>
            <p className="mt-1 font-medium text-ink-muted" style={{ fontSize: 13.5, maxWidth: "70ch" }}>
              Plan your day around your goals and work.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[12.5px] font-bold text-ink-soft">
              Today · <span className="tabular-nums">{longDay(payload.ymd)}</span>
            </span>
            {isManager && (
              <a
                href="/goals/recycle-bin"
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
              >
                <Trash2 size={13} /> Recycle Bin
              </a>
            )}
          </div>
        </header>
        <PlanBoard
          initialPlan={payload.initialPlan}
          sources={payload.sources}
          minItems={payload.minItems}
          isManager={payload.isManager}
          initialPhase={payload.initialPhase}
          ymd={payload.ymd}
        />
      </PageShell>
      <DashboardFooter />
    </>
  );
}
