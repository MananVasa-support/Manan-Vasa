/**
 * Appraisal module kill-switch. Mirrors the house convention
 * (MONTHLY_EVENTS_OFF / DOSSIER_OFF / HR_SUPPORT_OFF): read straight off
 * process.env, default ENABLED, killable in prod without a deploy.
 *
 * Set `APPRAISAL_OFF=true` in the Vercel env to disable — /appraisal then
 * redirects to the live /pms page (the OLD behaviour stands: /pms, /pms/review
 * and /pms/signals keep working exactly as before; they are never removed,
 * only de-linked from the nav while the flag is on).
 */
import { redirect } from "next/navigation";
import type { Route } from "next";

export function appraisalEnabled(): boolean {
  return process.env.APPRAISAL_OFF !== "true";
}

/**
 * Page guard — when Appraisal is off, bounce to the live /pms roster so the
 * new surface is unreachable. Call at the top of every /appraisal page +
 * server action entry point.
 */
export function requireAppraisal(): void {
  if (!appraisalEnabled()) redirect("/pms" as Route);
}
