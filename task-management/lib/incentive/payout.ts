/**
 * WS-4 #7 — Unified incentive payout: PURE transaction math.
 *
 * This module holds the *side-effect-free* core of paying accrued incentives
 * from the same surface as salary. The DB-writing server action
 * (`app/(app)/salary/incentive-payout/actions.ts`) resolves the outstanding
 * incentive sources for a person+month, hands them to `planPayout()` here, and
 * only then writes rows — so all the arithmetic (which the vitest exercises) is
 * testable without a database.
 *
 * Money contract (house style): numeric(14,2) rupees, Drizzle returns strings —
 * callers parse with Number() before handing values in. Everything here works in
 * plain numbers and rounds to 2 dp at the boundary via `round2`.
 *
 * 3-status model (WS-4 #2): a source's PAYABLE pool is its **accrued** amount
 * (client paid in full). We only ever pay out what has accrued and is not yet
 * paid: `outstanding = max(0, accrued − paid)`. Booked (partial client payment)
 * is never paid to the employee.
 *
 * Idempotency (per source, per run/month): each source carries how much is
 * already `paid`. Re-running the payout for the same run pays the *remaining*
 * outstanding only. A source already paid up to its accrued pool contributes 0,
 * so a second identical run is a no-op — no double payment.
 */

/** Half-a-paisa tolerance so float noise near a cap never over/under-pays. */
export const PAYOUT_EPS = 0.005;

/** Round to 2 decimal places (paise), guarding against float dust. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Which ledger a payable source lives on — mirrors incentive_payout_events.source. */
export type PayoutSourceKind = "entry" | "project" | "participant";

/**
 * One payable incentive source for a person in a month, as resolved from the
 * ledger. `accrued` is the full-payment pool; `paid` is what's already been paid
 * out for this source. Projects are split into two rows upstream (emp leg +
 * intern leg) so each leg is an independent source with its own accrued/paid.
 */
export interface PayoutSource {
  kind: PayoutSourceKind;
  /** The parent row id (entry / project / participant). */
  sourceId: string;
  /** For a project source, which leg — so the writer stamps the right columns. */
  leg?: "emp" | "intern";
  employeeId: string | null;
  empName: string | null;
  /** period_month date "YYYY-MM-01" this source belongs to. */
  periodMonth: string | null;
  /** Full-payment pool for this source (numeric parsed). */
  accrued: number;
  /** Amount already paid out for this source (numeric parsed). */
  paid: number;
}

/** A single line the writer must persist: pay `amount` more on `source`. */
export interface PayoutLine {
  source: PayoutSource;
  /** Outstanding to pay now = round2(max(0, accrued − paid)). Always > 0. */
  amount: number;
  /** The new cumulative paid figure to stamp (round2(paid + amount)). */
  newPaidTotal: number;
}

export interface PayoutPlan {
  lines: PayoutLine[];
  /** Σ amount across all lines — the total that hits salary_payments/events. */
  totalToPay: number;
  /** Count of sources that had nothing outstanding (already fully paid). */
  skipped: number;
}

/**
 * Given the resolved payable sources for a person+month, compute exactly what to
 * pay now. Pure. Sources with no outstanding accrued balance are skipped (this
 * is what makes the payout idempotent per source). Amounts are rounded to paise.
 *
 * @param sources resolved outstanding sources (already filtered to one person or
 *   one run scope by the caller; this function does not filter by identity).
 */
export function planPayout(sources: readonly PayoutSource[]): PayoutPlan {
  const lines: PayoutLine[] = [];
  let totalToPay = 0;
  let skipped = 0;

  for (const s of sources) {
    const outstanding = round2(Math.max(0, s.accrued - s.paid));
    if (outstanding <= PAYOUT_EPS) {
      skipped += 1;
      continue;
    }
    const newPaidTotal = round2(s.paid + outstanding);
    lines.push({ source: s, amount: outstanding, newPaidTotal });
    totalToPay = round2(totalToPay + outstanding);
  }

  return { lines, totalToPay, skipped };
}

/**
 * Sum the outstanding (accrued − paid, clamped at 0) across sources WITHOUT
 * building the full plan — used by the run surface to show "₹X accrued unpaid"
 * next to a person before the admin commits the payout.
 */
export function outstandingTotal(sources: readonly PayoutSource[]): number {
  let total = 0;
  for (const s of sources) {
    total = round2(total + Math.max(0, s.accrued - s.paid));
  }
  return total;
}
