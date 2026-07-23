"use client";

/**
 * Weekly engine adapter for the shared inline GoalTableView. Maps the table's
 * generic mutation surface onto the `weekly_goals` server actions so the SAME
 * table drives weekly goals (keeping the commit/approve rituals + month link
 * that live on that engine). Title writes `target_done`; team + cascade fields
 * go through the goals-workspace weekly actions; %-done + archive reuse the
 * legacy weekly engine.
 */

import type { GoalTableActions, GoalTableActionRes } from "@/components/goals/board/goal-table-view";
import {
  updateWeeklyCascadeFields,
  setWeeklyTitle,
  setWeeklyTeamInvolved,
} from "@/app/(app)/goals/weekly/actions";
import { setWeeklyGoalPct, archiveWeeklyGoal } from "@/app/(app)/weekly-goals/actions";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const WEEKLY_TABLE_ACTIONS: GoalTableActions = {
  async editGoal(input) {
    const id = input.id;
    // Goal title → target_done.
    if ("title" in input && typeof input.title === "string") {
      return setWeeklyTitle({ id, title: input.title });
    }
    // Team members (weekly stores employeeId/name; weights aren't persisted here).
    if ("teamInvolved" in input) {
      const team = (input.teamInvolved as Array<{ employeeId?: string; name?: string }> | null) ?? [];
      return setWeeklyTeamInvolved({
        id,
        members: team.map((m) => ({ employeeId: m.employeeId, name: m.name })),
      });
    }
    // Additive cascade fields: area / measure / target / actual / team-dependency.
    const fields: Record<string, unknown> = {};
    if ("area" in input) fields.area = (input.area as string | null) ?? null;
    if ("uom" in input) fields.uom = (input.uom as string | null) ?? null;
    if ("targetQty" in input) fields.targetQty = toNum(input.targetQty);
    if ("actualQty" in input) fields.actualQty = toNum(input.actualQty);
    if ("teamDependencyPct" in input) fields.teamDependencyPct = (input.teamDependencyPct as number | null) ?? null;
    if (Object.keys(fields).length > 0) {
      return updateWeeklyCascadeFields({ id, ...fields } as Parameters<typeof updateWeeklyCascadeFields>[0]);
    }
    // notes / category / shareWithTeam aren't part of the weekly engine — no-op.
    return { ok: true } as GoalTableActionRes;
  },
  setGoalPctDone(input) {
    return setWeeklyGoalPct({ id: input.id, pctDone: input.pctDone });
  },
  archiveGoal(input) {
    return archiveWeeklyGoal({ id: input.id, archived: true });
  },
  async bulkArchiveGoals(input) {
    for (const id of input.ids) {
      const res = await archiveWeeklyGoal({ id, archived: true });
      if (!res.ok) return res;
    }
    return { ok: true } as GoalTableActionRes;
  },
};
