"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  managerActivityBoard,
  type ManagerActivityBoard,
} from "@/lib/queries/manager-activity-board";

/** The periods the board can be read over. Kept in sync with the dropdown. */
const InputSchema = z.object({
  windowDays: z.union([z.literal(3), z.literal(7)]),
});

/**
 * ON-DEMAND manager activity board. Same contract as the drill-down actions
 * beside it: fired when the widget mounts or its period changes — never as part
 * of the dashboard payload, so the dashboard load path does not pay for three
 * extra aggregations. Fails open to `{ error }` so the widget shows an error
 * state instead of taking the page down.
 *
 * No per-manager permission gate: this is an org-wide leaderboard of ACTIVITY
 * COUNTS, the same shape of number the initiation scorecards above it already
 * show every signed-in viewer. It exposes no task, goal or commitment content —
 * the titles live behind the per-cell links, which enforce their own scoping.
 */
export async function getManagerActivityBoard(
  windowDays: 3 | 7,
): Promise<ManagerActivityBoard | { error: string }> {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = InputSchema.safeParse({ windowDays });
    if (!parsed.success) return { error: "Invalid input" };

    return await managerActivityBoard(parsed.data.windowDays);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load the activity board",
    };
  }
}
