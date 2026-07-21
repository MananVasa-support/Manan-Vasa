/**
 * HR Support / Ticketing kill-switch. Mirrors the house convention
 * (MONTHLY_EVENTS_OFF / DOSSIER_OFF / DCC_GATE_OFF): read straight off
 * process.env, default ENABLED, killable in prod without a deploy.
 *
 * Set `HR_SUPPORT_OFF=true` in the Vercel env to disable — the /support and
 * /queries ticketing surfaces then fall back to their OLD behaviour (the
 * scaffolded HR-room pages), and every ticket server action no-ops via
 * requireHrSupport().
 */
import { notFound } from "next/navigation";

export function hrSupportEnabled(): boolean {
  return process.env.HR_SUPPORT_OFF !== "true";
}

/**
 * Guard for ticket-only routes/actions (pages that have no pre-module
 * fallback). Call at the top of every ticketing page + server action.
 */
export function requireHrSupport(): void {
  if (!hrSupportEnabled()) notFound();
}
