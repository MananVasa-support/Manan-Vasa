import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { goalsSpace } from "@/lib/goals/space";
import { loadPersonalWD } from "@/app/(app)/goals/personal-wd-data";
import { PersonalWDBoard } from "@/components/goals/board/personal-wd-board";
import { PlanBoard } from "@/components/goals/plan/plan-board";
import {
  getPlanDayPayload,
  clampWindowStart,
  clampWindowDays,
} from "@/app/(app)/goals/plan/payload";
import { resolvePlanTarget } from "@/lib/goals/plan-target";

export const dynamic = "force-dynamic";

/**
 * WMS · Daily Goals & Commitments — the drag-drop day planner.
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
  // HOW MANY days at once (?v=1|2|3|4|7) — the view dropdown — and WHICH window
  // (?d=…), where `d` is the offset of the LEFTMOST column, so the arrows slide
  // the whole board by a day. The start is clamped against the span, so widening
  // near the far end can't leave the board beginning past the horizon.
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
      {/* A WHITE ground for the planner (Sir). The app-wide `body` rule in
          globals.css washes every page with three radial gradients (purple, red,
          green) over a grey base — editing that would repaint the WHOLE app, so
          this lays a plain white sheet behind this route only. Fixed + -z-10 so
          it covers the viewport without ever intercepting a click or a drag. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white" />
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-3 pb-10 max-md:pt-2 max-md:pb-8">
        {/* No `heading` prop and no separate Recycle Bin row any more: the board
            carries its own title, the employee picker and the Recycle Bin link
            in ONE header bar, so a second row above it would just be chrome. */}
        <PlanBoard target={target} payload={payload} />
      </PageShell>
    </>
  );
}
