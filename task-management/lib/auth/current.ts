import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 * Looks up by Firebase UID.  Used inside Server Components / Server Actions.
 *
 * This is the single most-used query in the app — the root layout and every
 * authed request resolve it. It is React-`cache()`d, so the lookup runs at most
 * ONCE per request and the healthy result is reused everywhere. We load it
 * DIRECTLY (no timeout/retry wrapper): a slow read just takes a little longer
 * and completes — wrapping it in a hard timeout turned slow-but-fine reads into
 * thrown errors under load, which surfaced as "We hit a snag" / failed actions.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const claims = await readSession();
  if (!claims) return null;
  const row = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, claims.uid),
  });
  return row ?? null;
});

/**
 * Like getCurrentEmployee but redirects to /login if absent or deactivated.
 * Throws via redirect (Next renders the redirect on the server).
 */
export async function requireUser(): Promise<Employee> {
  const e = await getCurrentEmployee();
  if (!e || !e.isActive) redirect("/login" as Route);
  return e;
}

/**
 * Like requireUser but additionally throws 403 if not admin.
 * Throws an Error so Next renders error.tsx.
 */
export async function requireAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!e.isAdmin) throw new Error("Forbidden");
  return e;
}

/**
 * Like requireUser but additionally throws 403 unless the signed-in employee is
 * a super-admin (the `SUPER_ADMIN_EMAILS` allow-list). Used to gate the
 * Weekly-Goals review/approve/archive flow — those writes are super-admins only.
 */
export async function requireSuperAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!isSuperAdmin(e.email)) throw new Error("Forbidden");
  return e;
}

/**
 * Mandatory weekly-goals fill gate (design §11), defense-in-depth for mutating
 * server actions: a user with un-filled current-week goals assigned to them is
 * blocked from POSTing actions until they fill them (the authed layout performs
 * the primary redirect). Applies to EVERYONE — admins and super-admins included.
 *
 * The actual EXISTS check lives in the query layer (`hasUnfilledWeekGoals`,
 * added by the weekly-goals query-layer work); we import it lazily so this guard
 * file has no hard build-time dependency on that module landing first. If the
 * gate module isn't present yet the guard fails open (no-op) rather than break
 * unrelated actions.
 *
 * @param me the already-resolved current employee (callers pass requireUser()'s result).
 * @returns the same employee, for ergonomic chaining; throws "Fill your weekly goals" when gated.
 */
export async function requireWeeklyGoalsFilled(me: Employee): Promise<Employee> {
  let gated = false;
  try {
    const mod = (await import("@/lib/queries/weekly-goals")) as {
      hasUnfilledWeekGoals?: (employeeId: string) => Promise<boolean>;
    };
    if (typeof mod.hasUnfilledWeekGoals === "function") {
      gated = await mod.hasUnfilledWeekGoals(me.id);
    }
  } catch {
    // Gate module not available yet → fail open (no-op).
    gated = false;
  }
  if (gated) throw new Error("Fill your weekly goals to continue");
  return me;
}
