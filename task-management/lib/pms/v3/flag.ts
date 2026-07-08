/**
 * PMS v3 (WS-2 "Performance Intelligence rebuild") kill-switch.
 *
 * The WHOLE v3 surface — monthly subjective scoring, incentive grade-bands,
 * Constitution para-by-para scoring — ships DARK behind this flag. Until it is
 * flipped ON, the live v2 score (lib/pms/engines/score.ts + /pms) is the only
 * thing users see and NOTHING about the existing number changes. Every v3 page
 * and server action calls `requirePmsV3()` first, so a stray link or a POST to a
 * v3 action is a no-op in production until Sir verifies and we set PMS_V3=true.
 *
 * Mirrors the existing kill-switch convention (MANAGER_GATES_OFF /
 * PUNCH_PLAN_GATE_OFF / DCC_GATE_OFF): read straight off process.env, default
 * OFF. Set `PMS_V3=true` in the Vercel env to enable.
 */
import { redirect } from "next/navigation";
import type { Route } from "next";

/** True only when the v3 rebuild is explicitly enabled. Default: OFF. */
export function isPmsV3Enabled(): boolean {
  return process.env.PMS_V3 === "true";
}

/**
 * Page guard — when v3 is off, bounce back to the live /pms roster so the dark
 * surface is unreachable in production. Call at the top of every v3 page.
 */
export function requirePmsV3(): void {
  if (!isPmsV3Enabled()) redirect("/pms" as Route);
}
