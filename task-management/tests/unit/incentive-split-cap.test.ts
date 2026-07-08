import { describe, it, expect } from "vitest";
import {
  splitOverflowError,
  SPLIT_EPS,
  type SplitOwed,
  type SplitShares,
} from "@/lib/incentive/split-cap";

const owed: SplitOwed = { booked: 1000, accrued: 800, paid: 600 };
const share = (b: number, a: number, p: number): SplitShares => ({
  bookedAmt: b,
  accruedAmt: a,
  paidAmt: p,
});

describe("splitOverflowError — Σ participants ≤ parent owed", () => {
  it("allows an empty split", () => {
    expect(splitOverflowError(owed, [], share(0, 0, 0))).toBeNull();
  });

  it("allows a split exactly at the cap on every basis", () => {
    const others = [share(600, 500, 400)];
    expect(splitOverflowError(owed, others, share(400, 300, 200))).toBeNull();
  });

  it("rejects when booked total exceeds booked owed", () => {
    const err = splitOverflowError(owed, [share(600, 0, 0)], share(500, 0, 0));
    expect(err).toMatch(/Booked split/);
  });

  it("rejects when accrued total exceeds accrued owed", () => {
    const err = splitOverflowError(owed, [share(0, 500, 0)], share(0, 400, 0));
    expect(err).toMatch(/Accrued split/);
  });

  it("rejects when paid total exceeds paid owed (the PMS-critical basis)", () => {
    const err = splitOverflowError(owed, [share(0, 0, 400)], share(0, 0, 300));
    expect(err).toMatch(/Paid split/);
  });

  it("tolerates float noise within half a paisa", () => {
    // 600 + 400.004 = 1000.004 → within SPLIT_EPS of the 1000 cap.
    expect(SPLIT_EPS).toBeGreaterThan(0);
    expect(splitOverflowError(owed, [share(600, 0, 0)], share(400.004, 0, 0))).toBeNull();
  });

  it("still rejects just beyond the tolerance", () => {
    expect(splitOverflowError(owed, [share(600, 0, 0)], share(400.02, 0, 0))).toMatch(/Booked/);
  });

  it("checks bases independently — one over, others fine", () => {
    // booked ok, accrued over.
    const err = splitOverflowError(owed, [share(100, 700, 100)], share(100, 200, 100));
    expect(err).toMatch(/Accrued/);
  });
});
