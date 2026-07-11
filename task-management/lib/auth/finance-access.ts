import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import type { Employee } from "@/db/schema";

/**
 * Finance-viewer access — the Salary module and the Attendance report are open
 * to admins/super-admins AND to the "Accounts" department (assigned in the Admin
 * panel), so the accounts team can read pay + attendance to do their job.
 * Write actions inside those pages (mark paid, edit notes) stay super-admin-only
 * via their own `isSuperAdmin` gate.
 */
export async function isFinanceViewer(me: Employee): Promise<boolean> {
  if (me.isAdmin || isSuperAdmin(me.email)) return true;
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}

/** Page guard: returns the signed-in employee, or redirects to /hub. */
export async function requireFinanceAccess(): Promise<Employee> {
  const me = await requireUser();
  if (await isFinanceViewer(me)) return me;
  redirect("/hub");
}
