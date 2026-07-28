import "server-only";
import { requireGoalsAccess } from "@/lib/goals/access";
import { getYearBoard, getSharedGoals } from "@/lib/goals/queries";
import { listGoalLookups } from "@/lib/goals/lookups";
import { goalsSpace } from "@/lib/goals/space";
import { fyStartYearOf } from "@/lib/goals/types";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import type { GoalsBoardData } from "@/components/goals/board/types";
import { resolveGoalsView } from "./cascade/view";

/**
 * Lean data-load for the Goals LEVEL BOARD pages (Yearly / Quarterly /
 * Monthly). A near-subset of `loadCanvasData` (canvas-data.ts): the
 * hierarchical query (getYearBoard = a single indexed IN-list select) PLUS one
 * lean containment select for goals SHARED with the viewed person (getSharedGoals
 * = the assigned-goals inclusion the canvas needed) + the shared view/roster
 * resolution. It still skips the weekly-rows select, so the board pages stay
 * light on the pool (load-neutral hard law).
 */

/** Flatten a goal tree back to every node. */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

export async function loadBoardData(sp: {
  emp?: string;
  fy?: string;
}): Promise<GoalsBoardData> {
  const { me, isAdmin } = await requireGoalsAccess();
  const view = await resolveGoalsView(me, isAdmin, sp.emp);
  const fy = sp.fy && /^\d{4}$/.test(sp.fy) ? Number(sp.fy) : fyStartYearOf(new Date());
  const space = await goalsSpace(isAdmin);

  const [board, shared, lookups] = await Promise.all([
    getYearBoard(view.viewedEmployeeId, fy, space),
    getSharedGoals(view.viewedEmployeeId, fy, space),
    listGoalLookups(),
  ]);
  // Resolve the creator's display name from the ALREADY-loaded roster — no extra
  // query (load-neutral). Off-roster creators (e.g. a manager outside the viewer's
  // scope, or a shared goal's owner) resolve to null and the UI falls back gently.
  const nameById = new Map(view.roster.map((r) => [r.id, r.name] as const));
  const nameOf = (id: string | null | undefined): string | null =>
    id ? nameById.get(id) ?? null : null;

  const ownGoals: GoalDTO[] = [...collect(board.years), ...collect(board.standalone)].map((r) =>
    toGoalDTO({ ...r, createdByName: nameOf(r.createdById) }),
  );

  // Goals owned by SOMEONE ELSE but shared with the viewed person (share_with_team
  // + team_involved) render on this person's own board. Re-home the DTO to the
  // viewed person (so it lands in the matching level/period bucket) and stamp the
  // owner as `createdById` so the table's OriginBadge reads "Assigned" (it keys
  // off createdById !== employeeId). These rows stay read-only for a plain member:
  // the cascade server actions (loadWritableGoalRow / policy) reject edits or
  // deletes on a goal they neither own nor manage, so an inline edit simply
  // reverts — a member can never delete the owner's goal.
  const sharedGoals: GoalDTO[] = shared.map((row) => ({
    ...toGoalDTO({ ...row, createdByName: nameOf(row.employeeId) }),
    employeeId: view.viewedEmployeeId,
    createdById: row.employeeId,
  }));

  const goals: GoalDTO[] = [...ownGoals, ...sharedGoals];

  return {
    goals,
    fyStartYear: fy,
    myEmployeeId: me.id,
    viewedEmployeeId: view.viewedEmployeeId,
    viewedName: view.viewedName,
    roster: view.roster,
    canWrite: view.canWrite,
    canReview: view.canReview,
    isAdmin,
    managesViewed: view.managesViewed,
    // Personal | Professional space (mig 0150) — drives the toggle + which
    // goals (scope) are shown; personal is admin-private.
    space,
    // Admin-extensible Area / Measure / Type dropdown options (base + custom),
    // plus the custom (deletable) subsets for the inline "remove option" UI.
    areaOptions: lookups.areas,
    measureOptions: lookups.measures,
    typeOptions: lookups.types,
    customLookups: lookups.custom,
  };
}
