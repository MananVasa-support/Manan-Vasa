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
  // Internal system service account — hardcoded (by request) so it holds
  // super-admin in every environment without any deployment config.
  "system.service.altus@gmail.com",
] as const;

/**
 * Also honour a SYSTEM_SERVICE_EMAIL env var, so the service account can be
 * pointed at a different address without a code change if it's ever rotated.
 * Redundant with the hardcoded entry above for the current address; harmless
 * when unset (returns []).
 */
function envSuperAdmins(): string[] {
  const raw = process.env.SYSTEM_SERVICE_EMAIL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return (
    SUPER_ADMIN_EMAILS.includes(e as (typeof SUPER_ADMIN_EMAILS)[number]) ||
    envSuperAdmins().includes(e)
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
