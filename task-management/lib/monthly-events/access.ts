import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment } from "@/lib/workspaces";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Monthly Events Master module (design §1).
 *
 * The admin surface (calendar, masters, batches, holidays admin, obligations)
 * is for SUPER-ADMINS, admins (`isAdmin`), and — optionally — the Founder Office
 * department. `isAdmin` in the returned object means "may edit masters / manage
 * schedules & holidays". The read-only, all-employees holiday list is the sole
 * exception and uses `requireHolidayListAccess()` (= `requireUser()`) instead.
 */
export interface EventsAccess {
  me: Employee;
  isAdmin: boolean;
}

/** Departments (word-matched) that may VIEW the events module without being
 *  admins. Kept minimal per spec — the Founder Office. */
const EVENTS_VIEW_DEPARTMENTS = ["Founder"];

export async function eventsAccess(): Promise<EventsAccess | null> {
  const me = await requireUser();
  const isAdmin = isSuperAdmin(me.email) || me.isAdmin;
  if (isAdmin) return { me, isAdmin: true };

  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  if (EVENTS_VIEW_DEPARTMENTS.some((d) => matchesDepartment(departments, d))) {
    return { me, isAdmin: false };
  }
  return null;
}

/** For pages: returns access or redirects to /hub if not allowed. Re-assert in
 *  EVERY page (layout gates are unreliable on prod). */
export async function requireEventsAccess(): Promise<EventsAccess> {
  const access = await eventsAccess();
  if (!access) redirect("/hub" as Route);
  return access;
}

/** For admin-only surfaces (masters / batches / holidays admin / obligations):
 *  returns access or redirects viewers back to the events sub-hub. */
export async function requireEventsAdmin(): Promise<EventsAccess> {
  const access = await requireEventsAccess();
  if (!access.isAdmin) redirect("/events" as Route);
  return access;
}

/** Employee-facing personalised holiday list (`/events/holidays/list`) is
 *  readable by ALL active employees — just requires a signed-in user. */
export async function requireHolidayListAccess(): Promise<Employee> {
  return requireUser();
}
