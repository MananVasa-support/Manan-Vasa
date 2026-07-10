import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Employee Dossier:
 *  - EVERY signed-in employee can open it and view/download THEIR OWN documents.
 *  - Admins (DB isAdmin OR super-admin email) see and manage EVERYONE's dossier
 *    — upload, edit, archive, browse by type.
 * Uploads/edits are always admin-only; employees are read-only on their file.
 */
export interface DossierAccess {
  me: Employee;
  /** Can see & manage every employee's dossier (not just their own). */
  isAdmin: boolean;
}

/** House kill-switch convention: DOSSIER_OFF === "true" hides the module. */
export function dossierEnabled(): boolean {
  return process.env.DOSSIER_OFF !== "true";
}

export async function dossierAccess(): Promise<DossierAccess> {
  const me = await requireUser();
  return { me, isAdmin: me.isAdmin || isSuperAdmin(me.email) };
}

/** For pages: resolves access or bounces to /hub when the module is off. */
export async function requireDossierAccess(): Promise<DossierAccess> {
  if (!dossierEnabled()) redirect("/hub");
  return dossierAccess();
}

/** True when the caller may view/manage this specific employee's dossier. */
export function canAccessEmployeeDossier(access: DossierAccess, employeeId: string): boolean {
  return access.isAdmin || access.me.id === employeeId;
}
