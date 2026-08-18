import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { getPlanDayPayload } from "@/app/(app)/goals/plan/payload";
import { clampDayOffset } from "@/lib/queries/daily-checklist";
import { resolvePlanTarget } from "@/lib/goals/plan-target";

export const dynamic = "force-dynamic";

/**
 * WMS · Plan My Day — the drag-drop day planner.
 *
 * This page MOVED here from `/goals/plan` (2026-08). The planner is the WMS
 * daily surface now: `/goals/plan` is a redirect stub, and the Goals rail no
 * longer lists it.
 *
 * It replaced the separate My Day EXECUTION board that used to live on this
 * route. They were two halves of one loop — decide, then work through — but the
 * planner already owns both: once you hit "Start My Day" it switches to its own
 * post-start review phase (components/goals/plan/day-review.tsx), writing the
 * same `daily_checklist` rows through the same `setItemProgress` action the old
 * board used. One surface, one plan.
 *
 * WHY THIS PATH AND NOT `/goals/plan`: `workspaceForPath` (lib/workspaces.ts)
 * owns `/goals*` for the GOALS room, so a WMS nav entry pointing there would
 * flip the sidebar to Goals the moment you clicked it. `/my-day` keeps the room
 * you're in. PlanBoard navigates its day tabs off the RELATIVE `pathname`, so it
 * works unchanged on either route.
 *
 * Gates are unchanged from the planner's old home — the daily loop is one
 * module: `goalsCascadeEnabled()` 404s the route when off, and
 * `requireGoalsAccess()` enforces the identical permission scope. The plan gate
 * in app/(app)/layout.tsx exempts and redirects to THIS path; if you ever move
 * the planner again, move that with it or the gate becomes a redirect loop.
 */
export default async function MyDayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Which planner day (?d=0…6 → today through six days out).
  const dayOffset = clampDayOffset(pick(sp.d));

  // WHOSE day (?emp=<id>) — admins may plan for anyone, managers for their
  // downline. resolvePlanTarget falls back to the caller when not permitted, so
  // a hand-crafted ?emp= can never open someone else's plan.
  const target = await resolvePlanTarget(
    { id: me.id, name: me.name, isAdmin },
    pick(sp.emp),
  );

  // PERSONAL space (admins) → the private day board (goals table, scope=personal).
  if ((await goalsSpace(isAdmin)) === "personal") {
    const data = await loadPersonalWD("day", { day: pick(sp.day), emp: pick(sp.emp) });
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <PersonalWDBoard data={data} />
      </>
    );
  }

  const payload = await getPlanDayPayload(target.employeeId, new Date(), dayOffset);
  const isManager = payload.isManager;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-5 pb-12 max-md:pt-4 max-md:pb-10">
        {/* The header is now just the manager utility row. The eyebrow pill
            ("WMS · Daily Loop") is gone and the title moved INLINE with the day
            tabs — see PlanBoard’s `heading` prop — so the planner starts at the
            top of the page instead of under two stacked chrome rows. */}
        {isManager && (
          <div className="mb-2 flex justify-end wg-rise">
            <a
              href="/goals/recycle-bin"
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
            >
              <Trash2 size={13} /> Recycle Bin
            </a>
          </div>
        )}
        <PlanBoard
          heading={
            <h1
              className="mr-1 text-ink-strong wg-rise"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(19px, 1.9vw, 24px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              Plan My Day
            </h1>
          }
          target={target}
          initialPlan={payload.initialPlan}
          sources={payload.sources}
          minItems={payload.minItems}
          isManager={payload.isManager}
          initialPhase={payload.initialPhase}
          ymd={payload.ymd}
          dayOffset={payload.dayOffset}
        />
      </PageShell>
    </>
  );
}
