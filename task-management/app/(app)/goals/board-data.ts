import "server-only";
import { requireGoalsAccess } from "@/lib/goals/access";
import { getYearBoard } from "@/lib/goals/queries";
import { fyStartYearOf } from "@/lib/goals/types";
import type { GoalNode } from "@/lib/goals/types";
import { toGoalDTO, type GoalDTO } from "@/components/goals/cascade/util";
import type { GoalsBoardData } from "@/components/goals/board/types";
import { resolveGoalsView } from "./cascade/view";

/**
 * Lean data-load for the Goals LEVEL BOARD pages (Yearly / Quarterly /
 * Monthly). A strict subset of `loadCanvasData` (canvas-data.ts): ONE
 * hierarchical query (getYearBoard = a single indexed IN-list select) + the
 * shared view/roster resolution — it skips the weekly-rows select and the
 * assigned-goals join the canvas needed, so the board pages are LIGHTER on
 * the pool than the canvas was (load-neutral hard law).
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

  const board = await getYearBoard(view.viewedEmployeeId, fy);
  const goals: GoalDTO[] = [...collect(board.years), ...collect(board.standalone)].map(
    toGoalDTO,
  );

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
  };
}
