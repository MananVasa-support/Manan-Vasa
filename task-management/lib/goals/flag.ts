/**
 * Kill-switches for the Goals Cascade program.
 *
 * TWO polarities, by design (design §10, locked decision 1):
 *  - The **cascade module** itself ships ENABLED behind `GOALS_CASCADE_OFF`
 *    (set it to `'true'` to 404 the whole `/goals` surface) — mirrors the house
 *    convention (MONTHLY_EVENTS_OFF / DCC_GATE_OFF).
 *  - Every **daily-flow GATE** ships DISABLED (default OFF). Each returns `false`
 *    unless its `*_ON` env var is exactly `'true'`. Hetesh browser-verifies each
 *    gate, then flips it on. This keeps the load-bearing login/punch flow untouched
 *    until proven safe.
 *
 * Read straight off process.env — no I/O, safe to import anywhere.
 */

/** The cascade module (all of `/goals`). Default ENABLED. */
export function goalsCascadeEnabled(): boolean {
  return process.env.GOALS_CASCADE_OFF !== "true";
}

/** Saturday commit gate (punch-out blocked until the week is committed). OFF. */
export function satCommitGateOn(): boolean {
  return process.env.SAT_COMMIT_GATE_ON === "true";
}

/** Monday manager-approval gate (attendance mark blocked until approved). OFF. */
export function monApproveGateOn(): boolean {
  return process.env.MON_APPROVE_GATE_ON === "true";
}

/** Plan-Your-Day login gate → /goals/plan (role-based minimum). OFF. */
export function planGateOn(): boolean {
  return process.env.PLAN_GATE_ON === "true";
}

/** Compulsory punch-out → missed = Half-Day reconcile (autoout cron). OFF. */
export function compulsoryPunchoutOn(): boolean {
  return process.env.COMPULSORY_PUNCHOUT_ON === "true";
}

/** The legacy "manager must assign tasks daily" login rule. OFF = rule removed. */
export function managerTaskGateOn(): boolean {
  return process.env.MANAGER_TASK_GATE_ON === "true";
}

/** The DCC manager-review login gate ("Review your team"). OFF = removed. */
export function dccReviewGateOn(): boolean {
  return process.env.DCC_REVIEW_GATE_ON === "true";
}

/**
 * The two remaining COMPULSORY login walls, now made removable per Sir. Both
 * DEFAULT OFF (the ritual is gone at login); flip the env var to restore.
 *   • Plan / Daily-Checklist gate — "commit ≥5 items to plan your day".
 *   • Own-DCC gate — "fill your DCC before you start".
 * Kept independent of the punch-path `DCC_GATE_OFF` (which still guards clock-out)
 * so removing the LOGIN wall never weakens the punch-out DCC check.
 */
export function loginPlanGateOn(): boolean {
  return process.env.LOGIN_PLAN_GATE_ON === "true";
}
export function loginDccGateOn(): boolean {
  return process.env.LOGIN_DCC_GATE_ON === "true";
}

/** WhatsApp goals-report delivery (media/text send). OFF. */
export function goalsWhatsappOn(): boolean {
  return process.env.GOALS_WHATSAPP_ON === "true";
}
