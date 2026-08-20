import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import { MODULE_THEME } from "@/lib/module-theme";
import { getPlanDayPayload, clampWindowStart, clampWindowDays } from "./payload";
import { resolvePlanTarget } from "@/lib/goals/plan-target";

const THEME = MODULE_THEME.goals;

export const dynamic = "force-dynamic";

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

  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // WHICH 3-DAY WINDOW (?d=0…4). `d` is now the offset of the LEFTMOST kanban
  // column, so Next/Previous slide the whole view by one day and `?d=0` is the
  // familiar Today | Tomorrow | Day After.
  // HOW MANY days at once (?v=1|3|7) — the view dropdown. The window start is
  // clamped against it, so switching to a 7-day view can't leave the board
  // starting past the end of the horizon.
  const windowDays = clampWindowDays(pick(sp.v));
  const windowStart = clampWindowStart(pick(sp.d), windowDays);

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

  const payload = await getPlanDayPayload(
    target.employeeId,
    new Date(),
    windowStart,
    { owner: target.name, manager: target.manager, managerManager: target.managerManager },
    windowDays,
  );

  return (
    <>
      {/* A WHITE ground for Plan My Day (Sir). The app-wide `body` rule in
          globals.css washes every page with three radial gradients (purple, red,
          green) over a grey base — editing that would repaint the WHOLE app, so
          this lays a plain white sheet behind this route only. Fixed + -z-10 so
          it covers the viewport without ever intercepting a click or a drag. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white" />
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-3 pb-10 max-md:pt-2 max-md:pb-8">
        <PlanBoard target={target} payload={payload} />
      </PageShell>
    </>
  );
}
