import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Accounts module: SUPER-ADMINS ONLY. The module holds
 * highly sensitive financial + credential data (CA Handover), so it is locked
 * to super-admins — admins and managers no longer qualify. Everyone else is
 * bounced to the hub.
 */
export interface AccountsAccess {
  me: Employee;
  isAdmin: boolean;
  canViewCaHandover: boolean;
}

export async function accountsAccess(): Promise<AccountsAccess | null> {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return null;
  // Everyone who passes is a super-admin → full rights, including CA Handover.
  return { me, isAdmin: true, canViewCaHandover: true };
}

/** For pages: returns access or redirects to /hub if not allowed. */
export async function requireAccountsAccess(): Promise<AccountsAccess> {
  const access = await accountsAccess();
  if (!access) redirect("/hub");
  return access;
}
