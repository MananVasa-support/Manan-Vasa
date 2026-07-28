/**
 * KPI Management notification kill-switch — INVERTED from the usual `*_OFF`
 * convention: notifications are OPT-IN and default OFF. The KPI Management
 * module itself is always available to HR staff; only the *live email send* is
 * gated. Mirrors the opt-in flags already in the house (INCENTIVE_PAYOUT,
 * COMMANDS_VIA_LEDGER): read straight off process.env, default off.
 *
 * When OFF (the default), the notify engine still COMPOSES every message and
 * records the history row — it just logs a "would notify" line instead of
 * dispatching. Set `KPI_NOTIFICATIONS_ON=true` in the env to actually send.
 */
export function kpiNotificationsOn(): boolean {
  return process.env.KPI_NOTIFICATIONS_ON === "true";
}

/** The env var name, surfaced for logs / admin copy. */
export const KPI_NOTIFICATIONS_FLAG = "KPI_NOTIFICATIONS_ON";
