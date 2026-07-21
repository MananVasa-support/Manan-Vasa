import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { isSuperAdmin, SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment } from "@/lib/workspaces";

/**
 * HR Support access — the role fork + the grievance wall live here.
 *
 * Two roles inside the HR help desk:
 *   - EMPLOYEE (everyone): raises tickets, sees ONLY their own thread.
 *   - HR HANDLER (super-admins, admins, and the "HR" department): works the
 *     queue — sees every NON-confidential ticket, can reply/assign/status.
 *
 * The grievance wall is a SEPARATE, harder rule (see visibleTicketsFilter in
 * lib/queries/hr-support.ts): a confidential ticket's read set is requester +
 * CURRENT assignee + super-admins ONLY — NOT all HR, NOT every admin, NEVER the
 * manager downline. This is the single choke point; do not fork it.
 */

/** The HR department name that grants handler status (word-matched). */
export const HR_DEPARTMENT = "HR";

/**
 * Is this employee an HR handler (queue worker)? Super-admins + admins always
 * are; otherwise membership of the "HR" department. One small indexed lookup —
 * called on the HR desk entry path, not the hot dashboard path.
 */
export async function isHrHandler(me: Employee): Promise<boolean> {
  if (isSuperAdmin(me.email)) return true;
  if (me.isAdmin) return true;
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return matchesDepartment(departments, HR_DEPARTMENT);
}

/** The employee ids of the super-admin allow-list (grievance fallback owners). */
export async function superAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id, email: employees.email })
    .from(employees)
    .where(
      inArray(
        employees.email,
        SUPER_ADMIN_EMAILS as unknown as string[],
      ),
    );
  return rows
    .filter((r) => isSuperAdmin(r.email))
    .map((r) => r.id);
}
