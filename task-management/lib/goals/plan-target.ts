import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { goalScopeFor, canManageGoalFor } from "@/lib/weekly-goals/hierarchy";

/**
 * WHOSE DAY AM I PLANNING? — the single choke point for Plan My Day's
 * "plan for someone else" (Sir: "I should be able to give goals over the next 7
 * days to whichever employee I choose, and the same with managers").
 *
 * Authority reuses the EXISTING goals hierarchy rather than inventing a second
 * one, so who you may plan for and who you may set goals for can never drift:
 *   · admins  → anyone
 *   · managers → themselves + their downline (getDownlineIds)
 *   · everyone else → only themselves
 *
 * SECURITY NOTE: every mutating plan action must call `resolvePlanTarget` and
 * write to the id it returns — never to a raw `forEmployeeId` off the wire. An
 * unauthorised (or unknown) target silently falls back to the caller's OWN id,
 * so a crafted request can only ever plan your own day, never someone else's.
 */
export interface PlanTarget {
  /** The employee whose plan is being read/written. */
  employeeId: string;
  /** Their display name (for the header + toasts). */
  name: string;
  /** True when planning for someone OTHER than yourself. */
  isDelegated: boolean;
  /** Everyone the caller may plan for, for the picker. Empty when it's just them. */
  roster: { id: string; name: string }[];
}

export async function resolvePlanTarget(
  me: { id: string; name: string; isAdmin: boolean },
  forEmployeeId?: string | null,
): Promise<PlanTarget> {
  const scope = await goalScopeFor({ id: me.id, isAdmin: me.isAdmin });

  const requested = (forEmployeeId ?? "").trim();
  // The fallback-to-self is the security boundary — see the note above.
  const employeeId =
    requested && requested !== me.id && canManageGoalFor(scope, requested) ? requested : me.id;

  const rows = scope.all
    ? await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.name))
    : scope.ids.length > 0
      ? await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(and(inArray(employees.id, scope.ids), eq(employees.isActive, true)))
          .orderBy(asc(employees.name))
      : [];

  const name = rows.find((r) => r.id === employeeId)?.name ?? me.name;
  return {
    employeeId,
    name,
    isDelegated: employeeId !== me.id,
    // Only worth showing a picker when there is more than just yourself in it.
    roster: rows.length > 1 ? rows : [],
  };
}
