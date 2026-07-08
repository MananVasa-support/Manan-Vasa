/**
 * WS-4 Phase B3 — pure cap-enforcement for the N-participant incentive split.
 * Kept framework-free (no server-only, no db) so it is unit-testable and reusable
 * by both the server actions and any future validators. The single invariant:
 *
 *     Σ participants[basis]  ≤  parent.owed[basis]   for basis ∈ {booked, accrued, paid}
 */

export type SplitBasis = "booked" | "accrued" | "paid";

export interface SplitShares {
  bookedAmt: number;
  accruedAmt: number;
  paidAmt: number;
}

export interface SplitOwed {
  booked: number;
  accrued: number;
  paid: number;
}

/** Half-a-paisa tolerance so float rounding never falsely trips the cap. */
export const SPLIT_EPS = 0.005;

const LABEL: Record<SplitBasis, string> = {
  booked: "Booked",
  accrued: "Accrued",
  paid: "Paid",
};

/**
 * Returns a human error message when adding `incoming` to `others` would exceed
 * `owed` on ANY basis, else null. `others` are the sibling participant shares
 * (the edited row itself must be excluded by the caller).
 */
export function splitOverflowError(
  owed: SplitOwed,
  others: SplitShares[],
  incoming: SplitShares,
): string | null {
  const sum = { booked: incoming.bookedAmt, accrued: incoming.accruedAmt, paid: incoming.paidAmt };
  for (const o of others) {
    sum.booked += o.bookedAmt;
    sum.accrued += o.accruedAmt;
    sum.paid += o.paidAmt;
  }
  const bases: SplitBasis[] = ["booked", "accrued", "paid"];
  for (const b of bases) {
    const total = sum[b];
    const cap = owed[b];
    if (total - cap > SPLIT_EPS) {
      return `${LABEL[b]} split (₹${total.toFixed(2)}) exceeds the incentive's ${b} owed (₹${cap.toFixed(2)}).`;
    }
  }
  return null;
}
