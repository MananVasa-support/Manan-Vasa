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

/**
 * Checkout close-out gate (Sir): at clock-OUT you must first close out today's
 * commitments (mark done / 0-100%), THEN DCC, THEN attendance. Sits just above
 * the existing punch-out DCC block. OFF by default; fail-open on any DB hiccup.
 */
export function checkoutCloseoutGateOn(): boolean {
  return process.env.CHECKOUT_CLOSEOUT_GATE_ON === "true";
}

/** Auto-spillover: at month rollover, clone <100% month goals into the next month
 *  (balance % carried, `clonedFromId` set → renders red). OFF by default. */
export function goalsSpilloverOn(): boolean {
  return process.env.GOALS_SPILLOVER_ON === "true";
}

/** Sunday 9am manager-rollup goals report to Manan (WhatsApp + email). OFF. */
export function goalsSundayReportOn(): boolean {
  return process.env.GOALS_SUNDAY_REPORT_ON === "true";
}

/** The zoom-canvas Goals experience (Planning-OS redesign Phase 0/1). Default OFF;
 *  set GOALS_CANVAS_ON='true' to render CascadeCanvas instead of CascadeWorkspace. */
export function goalsCanvasOn(): boolean {
  return process.env.GOALS_CANVAS_ON === "true";
}
