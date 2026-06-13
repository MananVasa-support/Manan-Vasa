import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_CYCLES, OUTSTANDING_CYCLE_LABELS,
  GST_RATES, OUTSTANDING_CONTRACT_STATUS,
  SEED_ENTITIES, SEED_PRODUCTS, SEED_PAYMENT_MODES,
  INSTALLMENT_STATES, OUTSTANDING_OVERDUE_BUCKETS,
} from "@/db/enums";

describe("outstanding enums", () => {
  it("has 3 cycles each with a label", () => {
    expect(OUTSTANDING_CYCLES).toEqual(["subscription", "monthly_bill", "full_payment"]);
    for (const c of OUTSTANDING_CYCLES) expect(OUTSTANDING_CYCLE_LABELS[c]).toBeTruthy();
  });
  it("gst rates are 0/5/12/18/28", () => {
    expect(GST_RATES).toEqual([0, 5, 12, 18, 28]);
  });
  it("contract statuses", () => {
    expect(OUTSTANDING_CONTRACT_STATUS).toEqual(["active", "closed", "written_off"]);
  });
  it("seed rosters non-empty", () => {
    expect(SEED_ENTITIES).toContain("Altus Corp");
    expect(SEED_PRODUCTS).toContain("BSU");
    expect(SEED_PAYMENT_MODES).toContain("Cash");
  });
  it("installment states", () => {
    expect(INSTALLMENT_STATES).toEqual(["not_due", "overdue", "paid"]);
  });
  it("overdue buckets cover 0..Infinity with 7 buckets", () => {
    expect(OUTSTANDING_OVERDUE_BUCKETS).toHaveLength(7);
    expect(OUTSTANDING_OVERDUE_BUCKETS[0]!.min).toBe(0);
    const last = OUTSTANDING_OVERDUE_BUCKETS[OUTSTANDING_OVERDUE_BUCKETS.length - 1]!;
    expect(last.id).toBe("60+");
    expect(last.max).toBe(Infinity);
  });
});
