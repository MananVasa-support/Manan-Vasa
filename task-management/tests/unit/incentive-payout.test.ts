import { describe, it, expect } from "vitest";
import {
  planPayout,
  outstandingTotal,
  round2,
  type PayoutSource,
} from "@/lib/incentive/payout";

function src(partial: Partial<PayoutSource>): PayoutSource {
  return {
    kind: "entry",
    sourceId: "s1",
    employeeId: null,
    empName: "Test Person",
    periodMonth: "2026-06-01",
    accrued: 0,
    paid: 0,
    ...partial,
  };
}

describe("planPayout — unified incentive payout math", () => {
  it("pays the full accrued pool when nothing is paid yet", () => {
    const plan = planPayout([src({ accrued: 5000, paid: 0 })]);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]!.amount).toBe(5000);
    expect(plan.lines[0]!.newPaidTotal).toBe(5000);
    expect(plan.totalToPay).toBe(5000);
    expect(plan.skipped).toBe(0);
  });

  it("pays only the remaining outstanding (accrued − paid)", () => {
    const plan = planPayout([src({ accrued: 5000, paid: 2000 })]);
    expect(plan.lines[0]!.amount).toBe(3000);
    expect(plan.lines[0]!.newPaidTotal).toBe(5000);
    expect(plan.totalToPay).toBe(3000);
  });

  it("is IDEMPOTENT: a fully-paid source pays nothing on re-run", () => {
    const plan = planPayout([src({ accrued: 5000, paid: 5000 })]);
    expect(plan.lines).toHaveLength(0);
    expect(plan.totalToPay).toBe(0);
    expect(plan.skipped).toBe(1);
  });

  it("never pays a NEGATIVE amount when paid > accrued (over-paid legacy row)", () => {
    const plan = planPayout([src({ accrued: 3000, paid: 4000 })]);
    expect(plan.lines).toHaveLength(0);
    expect(plan.totalToPay).toBe(0);
    expect(plan.skipped).toBe(1);
  });

  it("skips zero-accrued sources (booked-only, nothing payable)", () => {
    const plan = planPayout([src({ accrued: 0, paid: 0 })]);
    expect(plan.lines).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it("sums multiple sources (entry + two project legs) into one payout total", () => {
    const plan = planPayout([
      src({ kind: "entry", sourceId: "e1", accrued: 1000, paid: 0 }),
      src({ kind: "project", sourceId: "p1", leg: "emp", accrued: 2000, paid: 500 }),
      src({ kind: "project", sourceId: "p1", leg: "intern", accrued: 800, paid: 800 }), // done
    ]);
    expect(plan.lines).toHaveLength(2);
    expect(plan.totalToPay).toBe(1000 + 1500);
    expect(plan.skipped).toBe(1);
    // the two live lines carry their own leg identity for the writer
    expect(plan.lines.map((l) => l.source.sourceId)).toEqual(["e1", "p1"]);
    expect(plan.lines[1]!.source.leg).toBe("emp");
  });

  it("rounds to paise and tolerates float dust at the cap", () => {
    // 100.005 accrued − 0 paid → rounds to 100.01 (banker-safe round2)
    const plan = planPayout([src({ accrued: 100.005, paid: 0 })]);
    expect(plan.lines[0]!.amount).toBe(round2(100.005));
    // a source paid to within half a paisa of accrued is treated as settled
    const settled = planPayout([src({ accrued: 100, paid: 99.997 })]);
    expect(settled.lines).toHaveLength(0);
    expect(settled.skipped).toBe(1);
  });

  it("running the plan TWICE (simulate re-run) never double-pays", () => {
    const s = src({ accrued: 5000, paid: 0 });
    const first = planPayout([s]);
    expect(first.totalToPay).toBe(5000);
    // apply: the source is now paid up to accrued
    const afterFirst = src({ ...s, paid: first.lines[0]!.newPaidTotal });
    const second = planPayout([afterFirst]);
    expect(second.totalToPay).toBe(0);
    expect(second.lines).toHaveLength(0);
  });
});

describe("outstandingTotal", () => {
  it("clamps each source at 0 and rounds the sum", () => {
    const total = outstandingTotal([
      src({ accrued: 1000, paid: 200 }), // 800
      src({ accrued: 500, paid: 900 }), // 0 (clamped)
      src({ accrued: 250.25, paid: 0.25 }), // 250.00
    ]);
    expect(total).toBe(1050);
  });
});
