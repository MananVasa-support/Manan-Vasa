/**
 * Super-admins are the only people allowed to change an employee's admin
 * status (promote normal→admin, demote admin→normal, or create an admin).
 * Every other admin keeps all other capabilities. This list is the single
 * source of truth; the server guards in the employees actions enforce it and
 * the UI hides the admin toggle for non-super-admins.
 */
export const SUPER_ADMIN_EMAILS = [
  "heteshvichare.altuscorp@gmail.com",
  "manan@unleashed.in",
] as const;

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(
    email.trim().toLowerCase() as (typeof SUPER_ADMIN_EMAILS)[number],
  );
}

/**
 * Manan Vasa — the ONLY person who may change a task's DOER.
 *
 * Deliberately NOT `isSuperAdmin`, which also covers Hetesh, and not
 * `isAdmin`, which covers every admin. Who a task belongs to is an allocation
 * decision reserved to one person, so this is a named individual and reads as
 * one. If that ever needs to become a role, it should become a role explicitly
 * rather than by quietly widening this.
 *
 * Everything else about a task stays editable by whoever could edit it before —
 * this narrows the doer field alone.
 */
export const DOER_OWNER_EMAIL = "manan@unleashed.in";

export function canChangeDoer(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === DOER_OWNER_EMAIL;
}
