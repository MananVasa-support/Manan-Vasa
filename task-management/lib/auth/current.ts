import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { withRetry } from "@/lib/db/with-timeout";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 * Looks up by Firebase UID.  Used inside Server Components / Server Actions.
 *
 * This is the SINGLE most load-bearing query in the app: it runs in the ROOT
 * layout (app/layout.tsx) on every request — and there is NO error boundary
 * above the root layout, so a throw here renders the whole-app "We hit a snag"
 * screen (root app/error.tsx), wiping the chrome. A stale pooled connection
 * (e.g. right after a Supabase pooler restart) is exactly such a throw.
 *
 * So we RETRY on a fresh connection. Because this is React-cache()d, the retry
 * runs at most once per request and the healthy result is then reused by the
 * (app) layout's requireUser() and the page — fixing the root layout AND every
 * downstream auth check in one place, with no risk of caching a poisoned
 * (rejected) promise on a transient blip. A short first timeout (auth is a
 * sub-ms indexed lookup) catches a stale hit fast, then one retry with headroom.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const claims = await readSession();
  if (!claims) return null;
  const row = await withRetry(
    () =>
      db.query.employees.findFirst({
        where: eq(employees.firebaseUid, claims.uid),
      }),
    { attempts: 2, timeoutMs: [4000, 8000], label: "current-employee" },
  );
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
