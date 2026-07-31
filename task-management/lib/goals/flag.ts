/**
 * Kill-switches for the Goals Cascade program.
 *
 * ⚠️ 2026-07-27 EMERGENCY: ALL daily-flow GATES are FORCE-DISABLED in code
 * (return false regardless of env) because active gates were blocking people
 * from clocking in/out (logging attendance). To restore a gate later, put back
 * its `process.env.X === "true"` check. The punch-path env gates
 * (DCC_GATE_OFF / PUNCH_PLAN_GATE_OFF / MANAGER_GATES_OFF) are likewise
 * force-disabled in app/(app)/attendance/actions.ts and the mobile punch route.
 *
 * TWO polarities, by design (design §10, locked decision 1):
 *  - The **cascade module** itself ships ENABLED behind `GOALS_CASCADE_OFF`
 *    (set it to `'true'` to 404 the whole `/goals` surface) — mirrors the house
 *    convention (MONTHLY_EVENTS_OFF / DCC_GATE_OFF). NOT a login/attendance gate,
 *    left untouched.
 *  - Every **daily-flow GATE** ships DISABLED (default OFF) — now hard-off.
 *
 * Read straight off process.env — no I/O, safe to import anywhere.
 */

/** The cascade module (all of `/goals`). Default ENABLED. NOT a gate. */
export function goalsCascadeEnabled(): boolean {
  return process.env.GOALS_CASCADE_OFF !== "true";
}

/** Saturday commit gate (punch-out blocked until the week is committed). FORCE-OFF. */
export function satCommitGateOn(): boolean {
  return false;
}

/** Monday manager-approval gate (attendance mark blocked until approved). FORCE-OFF. */
export function monApproveGateOn(): boolean {
  return false;
}

/** Plan-Your-Day login gate → /goals/plan (role-based minimum). FORCE-OFF. */
export function planGateOn(): boolean {
  return false;
}

/** Compulsory punch-out → missed = Half-Day reconcile (autoout cron). FORCE-OFF. */
export function compulsoryPunchoutOn(): boolean {
  return false;
}

/** The legacy "manager must assign tasks daily" login rule. FORCE-OFF. */
export function managerTaskGateOn(): boolean {
  return false;
}

/** The DCC manager-review login gate ("Review your team"). FORCE-OFF. */
export function dccReviewGateOn(): boolean {
  return false;
}

/**
 * The two remaining COMPULSORY login walls (plan/DCC before you start).
 * FORCE-OFF so nothing blocks login/attendance.
 */
export function loginPlanGateOn(): boolean {
  return false;
}
export function loginDccGateOn(): boolean {
  return false;
}

/** WhatsApp goals-report delivery (media/text send). OFF. NOT a login/attendance gate. */
export function goalsWhatsappOn(): boolean {
  return process.env.GOALS_WHATSAPP_ON === "true";
}

/**
 * Checkout close-out gate (Sir): at clock-OUT you must first close out today's
 * commitments. FORCE-OFF so it never blocks punch-out.
 */
export function checkoutCloseoutGateOn(): boolean {
  return false;
}

/** Auto-spillover at month rollover. OFF. NOT a login/attendance gate. */
export function goalsSpilloverOn(): boolean {
  return process.env.GOALS_SPILLOVER_ON === "true";
}

/** Sunday 9am manager-rollup goals report. OFF. NOT a login/attendance gate. */
export function goalsSundayReportOn(): boolean {
  return process.env.GOALS_SUNDAY_REPORT_ON === "true";
}

/** The Goals cascade BOARD experience (5-page level ladder: Yearly→Daily).
 *  Flag retired (2026-07) — permanently LIVE, no longer gated by GOALS_CANVAS_ON. */
export function goalsCanvasOn(): boolean {
  return true;
}

/** Goal Capture (migration 0173) — natural-language → structured goals via a
 *  free OpenAI-compatible LLM (default OpenRouter). Ships ENABLED behind a
 *  kill-switch, AND requires OPENROUTER_API_KEY to be present (no key → feature
 *  hidden, never crashes). NOT a login/attendance gate. */
export function goalCaptureEnabled(): boolean {
  return process.env.GOAL_CAPTURE_OFF !== "true" && !!process.env.OPENROUTER_API_KEY;
}

/** Voice capture for Goal Capture — needs a Whisper key (OpenAI or free Groq).
 *  Gated separately so text capture works without any transcription provider. */
export function voiceCaptureEnabled(): boolean {
  return goalCaptureEnabled() && !!process.env.WHISPER_API_KEY;
}
