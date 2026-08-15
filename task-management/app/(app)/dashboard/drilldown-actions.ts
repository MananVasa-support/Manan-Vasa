"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadManagerDrilldown,
  type ManagerDrilldown,
} from "@/lib/queries/manager-drilldown";
import {
  loadPunctualityDrilldown,
  type PunctualityDrilldown,
} from "@/lib/queries/punctuality-drilldown";
import { parseFilters } from "@/lib/filters";

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

const PunctualityInput = z.object({
  basis: z.enum(["original", "revised"]),
  bucket: z.enum(["onTime", "late"]),
  /** The dashboard's own querystring, so the list is scoped exactly like the
   *  gauge it was opened from. */
  search: z.string().max(4000),
});

/**
 * ON-DEMAND delivered-tasks drill-down behind the on-time gauge's legend.
 * Same contract as `getManagerDrilldown`: fired only when the panel opens, so
 * the dashboard load path never pays for it, and it fails open to `{ error }`.
 *
 * The caller passes its current querystring rather than a pre-parsed filter
 * object — re-parsing it server-side with the same `parseFilters` the page uses
 * is what guarantees the list and the gauge agree. No permission gate beyond
 * "signed in": this returns exactly the tasks already aggregated into the gauge
 * the user is looking at.
 */
export async function getPunctualityDrilldown(
  basis: "original" | "revised",
  bucket: "onTime" | "late",
  search: string,
): Promise<PunctualityDrilldown | { error: string }> {
  try {
    const me = await requireUser();
    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = PunctualityInput.safeParse({ basis, bucket, search });
    if (!parsed.success) return { error: "Invalid input" };

    const sp = Object.fromEntries(new URLSearchParams(parsed.data.search).entries());
    return await loadPunctualityDrilldown(parseFilters(sp), parsed.data.basis, parsed.data.bucket);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load drill-down" };
  }
}
