import { db, employees } from "@/lib/db";
import { asc, eq } from "drizzle-orm";

/**
 * Returns the employee roster ordered by name.
 *
 * Defaults to ACTIVE-ONLY because the vast majority of callers feed
 * pickers (filter bars, assign-doer, reassign) where deactivated
 * employees should not be selectable. Pass `{ includeInactive: true }`
 * for admin/export views that need the full roster including
 * deactivated rows (e.g. the employees CSV export and the
 * /admin/activity + /admin/notifications recipient filters that can
 * filter on a deactivated user's historical events).
 */
export async function listEmployees(
  opts: { includeInactive?: boolean } = {},
) {
  const q = db.select().from(employees);
  return opts.includeInactive
    ? q.orderBy(asc(employees.name))
    : q.where(eq(employees.isActive, true)).orderBy(asc(employees.name));
}
