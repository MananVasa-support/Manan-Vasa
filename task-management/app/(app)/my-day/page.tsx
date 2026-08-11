import GoalsPlanPage from "@/app/(app)/goals/plan/page";

export const dynamic = "force-dynamic";

/**
 * WMS · My Day — the SAME Plan My Day surface as `/goals/plan`, exposed inside
 * the WMS room.
 *
 * This is a re-export, not a copy: the page component, its `getPlanDayPayload`
 * assembler, its `PlanBoard` state and its `daily_checklist` persistence are
 * one implementation with one code path, so the two URLs can never drift.
 *
 * WHY A SEPARATE ROUTE AT ALL, rather than linking WMS at `/goals/plan`:
 * `workspaceForPath` (lib/workspaces.ts) owns `/goals*` for the GOALS room, so
 * a WMS nav entry pointing there would flip the whole sidebar to Goals the
 * moment you clicked it. A WMS-owned path keeps the room you're standing in.
 *
 * Both gates ride along untouched, because they live INSIDE the page component,
 * not in `app/(app)/goals/layout.tsx` (which only re-checks the same module
 * flag): `goalsCascadeEnabled()` 404s the route when the module is off, and
 * `requireGoalsAccess()` enforces the identical permission scope. The admin
 * personal/professional `goalsSpace` branch resolves the same way too — so this
 * route shows the signed-in user exactly the plan `/goals/plan` shows them.
 */
export default GoalsPlanPage;
