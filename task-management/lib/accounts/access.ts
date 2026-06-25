import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManagerWithReports } from "@/lib/manager-gates";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Accounts module: ADMIN or MANAGER (someone with direct
 * reports) only. The CA Handover section is more sensitive — admins/super-admins
 * only. Everyone else is bounced to the hub.
 */
export interface AccountsAccess {
  me: Employee;
  isAdmin: boolean;
  canViewCaHandover: boolean;
}

export async function accountsAccess(): Promise<AccountsAccess | null> {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  const manager = admin || (await isManagerWithReports(me.id));
  if (!manager) return null;
  return { me, isAdmin: admin, canViewCaHandover: admin };
}

/** For pages: returns access or redirects to /hub if not allowed. */
export async function requireAccountsAccess(): Promise<AccountsAccess> {
  const access = await accountsAccess();
  if (!access) redirect("/hub");
  return access;
}
