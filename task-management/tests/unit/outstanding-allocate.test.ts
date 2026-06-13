import { describe, it, expect } from "vitest";
import { allocatePayments } from "@/lib/outstanding/allocate";
import type { StoredInstallment } from "@/lib/outstanding/types";

const inst = (over: Partial<StoredInstallment>): StoredInstallment => ({
  id: "i", contractId: "c1", clientName: "A", periodIndex: 0,
  dueDate: "2025-09-01", amount: 25000, ...over,
});

describe("allocatePayments", () => {
  it("no collections → full balance, overdue/not_due by today", () => {
    const out = allocatePayments(
      [inst({ id: "i1", dueDate: "2025-09-01" }), inst({ id: "i2", dueDate: "2027-01-01" })],
      [], "2026-06-13",
    );
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(byId.i1!.balance).toBe(25000);
    expect(byId.i1!.state).toBe("overdue");
    expect(byId.i1!.daysOverdue).toBeGreaterThan(0);
    expect(byId.i2!.state).toBe("not_due");
    expect(byId.i2!.daysOverdue).toBe(0);
  });
  it("payment clears oldest first, advances status", () => {
    const out = allocatePayments(
      [inst({ id: "i1", dueDate: "2025-09-01" }), inst({ id: "i2", dueDate: "2025-10-01" })],
      [{ id: "p1", clientName: "A", contractId: null, amount: 30000, collectedAt: "2025-10-05" }],
      "2026-06-13",
    );
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(byId.i1!.balance).toBe(0);
    expect(byId.i1!.state).toBe("paid");
    expect(byId.i2!.balance).toBe(20000);
    expect(byId.i2!.paid).toBe(5000);
  });
  it("payments stay within their own client", () => {
    const out = allocatePayments(
      [inst({ id: "a1", clientName: "A" }), inst({ id: "b1", clientName: "B" })],
      [{ id: "p1", clientName: "B", contractId: null, amount: 25000, collectedAt: "2025-09-02" }],
      "2026-06-13",
    );
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(byId.a1!.balance).toBe(25000);
    expect(byId.b1!.balance).toBe(0);
  });
  it("payment exactly equal to one installment clears it, leaves the next untouched", () => {
    const out = allocatePayments(
      [inst({ id: "i1", dueDate: "2025-09-01" }), inst({ id: "i2", dueDate: "2025-10-01" })],
      [{ id: "p", clientName: "A", contractId: null, amount: 25000, collectedAt: "2025-10-01" }],
      "2026-06-13",
    );
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(byId.i1!.state).toBe("paid");
    expect(byId.i2!.paid).toBe(0);
    expect(byId.i2!.balance).toBe(25000);
  });
  it("overpay leaves no negative balance (pool surplus is dropped)", () => {
    const out = allocatePayments(
      [inst({ id: "i1" }), inst({ id: "i2", dueDate: "2025-10-01" })],
      [{ id: "p", clientName: "A", contractId: null, amount: 999999, collectedAt: "2025-10-01" }],
      "2026-06-13",
    );
    for (const r of out) {
      expect(r.balance).toBe(0);
      expect(r.state).toBe("paid");
    }
  });
  it("installment due exactly today is not_due (daysOverdue 0), not overdue", () => {
    const out = allocatePayments([inst({ id: "i1", dueDate: "2026-06-13" })], [], "2026-06-13");
    expect(out[0]!.daysOverdue).toBe(0);
    expect(out[0]!.state).toBe("not_due");
  });
});
