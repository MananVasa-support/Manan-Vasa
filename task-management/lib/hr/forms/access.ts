import "server-only";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";

/**
 * The ONE authorisation rule for reading a filled form: you may see a submission
 * if it is YOURS, or if you are HR staff.
 *
 * Every read surface calls this — the View page, the PDF route and the email
 * route — because a list-level gate only protects the list. Without it, a
 * non-HR employee who knows (or guesses) a submission id could pull someone
 * else's exit interview straight from `/api/hr/forms/<id>/pdf`, which never
 * renders the list at all.
 *
 * `isHrStaff` (not `isAdmin`) is the right predicate: it covers super-admins AND
 * the HR department, matching `requireHrStaff` on /hr/all-forms. Using `isAdmin`
 * here would lock out the HR team that owns these forms.
 *
 * Returns a verdict rather than redirecting, so each caller can respond in its
 * own idiom — the page 404s (revealing nothing about whether the id exists), the
 * API routes return a status code.
 */
export async function canViewHrSubmission(
  submissionEmployeeId: string,
): Promise<{ allowed: boolean; isHrStaff: boolean; meId: string }> {
  const me = await requireUser();
  const hrStaff = await isHrStaff(me);
  return {
    allowed: hrStaff || me.id === submissionEmployeeId,
    isHrStaff: hrStaff,
    meId: me.id,
  };
}
