"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadManagerDrilldown,
  type ManagerDrilldown,
} from "@/lib/queries/manager-drilldown";

const InputSchema = z.object({
  managerId: z.string().uuid(),
  windowDays: z.union([z.literal(3), z.literal(7)]),
});

/**
 * ON-DEMAND manager workload drill-down (§4.3). Fired ONLY when the modal opens
 * — never on dashboard load, so it never touches the load path. Permission:
 * admin → any manager; otherwise a manager may open only their OWN drill-down.
 * Fail-open: any error degrades to `{ error }`; the modal shows an error state
 * rather than crashing the dashboard.
 */
export async function getManagerDrilldown(
  managerId: string,
  windowDays: 3 | 7,
): Promise<ManagerDrilldown | { error: string }> {
  try {
    const me = await requireUser();

    // Read-bucket rate limit — on-demand, but still guard against a hammered
    // modal re-opening in a loop.
    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = InputSchema.safeParse({ managerId, windowDays });
    if (!parsed.success) return { error: "Invalid input" };

    // PERMISSION GATE: admin sees any; a manager sees only their own card.
    if (!me.isAdmin && parsed.data.managerId !== me.id) {
      return { error: "forbidden" };
    }

    return await loadManagerDrilldown(parsed.data.managerId, parsed.data.windowDays);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load drill-down" };
  }
}
