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

// Who may change a task's DOER lives in lib/auth/doer-permission.ts, not here.
// It briefly lived in this file as a Manan-only email test; the rule is now
// "every manager, plus Manan and Om", which needs the org chart and so cannot
// be a pure email check. The old helper was removed rather than left in place,
// because an exported `canChangeDoer` still implementing the narrower rule is
// exactly the kind of thing a future caller imports by name and trusts.
