import { describe, it, expect } from "vitest";
import {
  CreateContractSchema,
  CreateCollectionSchema,
} from "@/lib/validators/outstanding";

describe("CreateContractSchema", () => {
  const valid = {
    clientName: "Acme Corp",
    cycle: "subscription" as const,
    baseAmount: 10000,
    gstRate: 18,
    startDate: "2026-01-01",
    pdcReceived: false,
  };

  it("accepts a minimal valid contract", () => {
    expect(CreateContractSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional periods/endDate/comments", () => {
    const r = CreateContractSchema.safeParse({
      ...valid,
      periods: 12,
      endDate: "2026-12-01",
      comments: "first invoice pending",
      contactPhone: "+91 99999 99999",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid GST rate", () => {
    expect(CreateContractSchema.safeParse({ ...valid, gstRate: 17 }).success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(CreateContractSchema.safeParse({ ...valid, baseAmount: 0 }).success).toBe(false);
  });

  it("rejects a malformed start date", () => {
    expect(CreateContractSchema.safeParse({ ...valid, startDate: "2026/01/01" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown cycle", () => {
    expect(
      CreateContractSchema.safeParse({ ...valid, cycle: "weekly" as never }).success,
    ).toBe(false);
  });

  it("rejects unknown extra keys (strict)", () => {
    expect(
      CreateContractSchema.safeParse({ ...valid, surprise: true } as never).success,
    ).toBe(false);
  });

  it("rejects periods out of range", () => {
    expect(CreateContractSchema.safeParse({ ...valid, periods: 0 }).success).toBe(false);
    expect(CreateContractSchema.safeParse({ ...valid, periods: 601 }).success).toBe(false);
  });
});

describe("CreateCollectionSchema", () => {
  const valid = {
    clientName: "Acme Corp",
    amount: 5000,
    paymentModeId: "11111111-1111-4111-8111-111111111111",
    responsibleId: "22222222-2222-4222-8222-222222222222",
  };

  it("accepts a minimal valid collection", () => {
    expect(CreateCollectionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional contractId/collectedAt/comments", () => {
    const r = CreateCollectionSchema.safeParse({
      ...valid,
      contractId: "33333333-3333-4333-8333-333333333333",
      collectedAt: "2026-06-01",
      comments: "UPI received",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing payment mode", () => {
    const { paymentModeId, ...rest } = valid;
    void paymentModeId;
    expect(CreateCollectionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-uuid responsible id", () => {
    expect(
      CreateCollectionSchema.safeParse({ ...valid, responsibleId: "nope" }).success,
    ).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(CreateCollectionSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });
});
