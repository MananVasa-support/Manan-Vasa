import { describe, it, expect } from "vitest";
import { computeSalary, computeHourlySalary, computeFixedFeeSalary } from "@/lib/salary/compute";

const base = {
  annualCtc: 1_200_000, // ₹12L/yr → ₹1L/mo
  payableDays: 30,
  daysInMonth: 30,
  ptExempt: false,
  tdsMonthly: 0,
  lateMarksInMonth: 0,
  advances: 0,
  pendingBalanceIn: 0,
};

describe("computeSalary", () => {
  it("full month, no deductions → gross = monthly CTC, net = gross - PT", () => {
    const r = computeSalary(base);
    expect(r.monthlyCtc).toBe(100000);
    expect(r.perDay).toBeCloseTo(100000 / 30, 2);
    expect(r.payableDays).toBe(30);
    expect(r.lateDeductionDays).toBe(0);
    expect(r.gross).toBe(100000);
    expect(r.pt).toBe(200);
    expect(r.net).toBe(99800);
  });
  it("PT exemption removes the ₹200", () => {
    expect(computeSalary({ ...base, ptExempt: true }).pt).toBe(0);
    expect(computeSalary({ ...base, ptExempt: true }).net).toBe(100000);
  });
  it("partial attendance scales gross by payable days", () => {
    const r = computeSalary({ ...base, payableDays: 15 });
    expect(r.gross).toBe(50000);
    expect(r.net).toBe(49800);
  });
  it("late deduction: floor(lates/3) * 0.5 days", () => {
    expect(computeSalary({ ...base, lateMarksInMonth: 2 }).lateDeductionDays).toBe(0);
    expect(computeSalary({ ...base, lateMarksInMonth: 3 }).lateDeductionDays).toBe(0.5);
    expect(computeSalary({ ...base, lateMarksInMonth: 6 }).lateDeductionDays).toBe(1.0);
    const r = computeSalary({ ...base, lateMarksInMonth: 3 });
    expect(r.gross).toBeCloseTo((100000 / 30) * (30 - 0.5), 2);
  });
  it("HP days (>1.0 dayValue) can push payable days above daysInMonth", () => {
    const r = computeSalary({ ...base, payableDays: 32 });
    expect(r.gross).toBeCloseTo((100000 / 30) * 32, 2);
  });
  it("tds, advances, pending all flow into net", () => {
    const r = computeSalary({ ...base, tdsMonthly: 1000, advances: 5000, pendingBalanceIn: 2000 });
    expect(r.net).toBe(100000 - 200 - 1000 - 5000 + 2000); // 95800
  });
  it("net can be negative (heavy advances) — caller decides carry-forward", () => {
    expect(computeSalary({ ...base, advances: 200000 }).net).toBeLessThan(0);
  });
  it("zero CTC → all zeros except PT", () => {
    const r = computeSalary({ ...base, annualCtc: 0 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(-200);
  });
  it("rounds money to 2 decimals", () => {
    const r = computeSalary({ ...base, annualCtc: 1_000_000, payableDays: 7, daysInMonth: 31 });
    expect(Number.isInteger(r.gross * 100)).toBe(true);
    expect(Number.isInteger(r.net * 100)).toBe(true);
  });
  it("tags the monthly_ctc basis", () => {
    expect(computeSalary(base).basis).toBe("monthly_ctc");
  });
});

describe("computeHourlySalary (part-time)", () => {
  const h = {
    monthlyPayAtTarget: 3500, weeklyTargetHours: 27, daysInMonth: 31,
    ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
  };
  const target = 27 * (31 / 7); // ≈ 119.57h
  it("target = 27 × days/7; full target → capped at ₹3,500", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: target * 60 });
    expect(r.targetHours).toBeCloseTo(target, 2);
    expect(r.gross).toBe(3500);
    expect(r.basis).toBe("hourly");
  });
  it("half the hours → half the pay", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: (target / 2) * 60 });
    expect(r.gross).toBeCloseTo(1750, 2);
  });
  it("over target is CAPPED at ₹3,500", () => {
    expect(computeHourlySalary({ ...h, workedMinutes: 300 * 60 }).gross).toBe(3500);
  });
  it("zero hours → zero gross", () => {
    expect(computeHourlySalary({ ...h, workedMinutes: 0 }).gross).toBe(0);
  });
  it("deductions flow into net; non-exempt charges PT", () => {
    const r = computeHourlySalary({ ...h, workedMinutes: target * 60, ptExempt: false, tdsMonthly: 100, advances: 200, pendingBalanceIn: 50 });
    expect(r.net).toBe(3500 - 200 - 100 - 200 + 50); // 3050
  });
});

describe("computeFixedFeeSalary (project)", () => {
  it("gross = fee, net = fee − tds − advances + pending, no PT", () => {
    const r = computeFixedFeeSalary({ monthlyFee: 20000, tdsMonthly: 1000, advances: 2000, pendingBalanceIn: 500 });
    expect(r.gross).toBe(20000);
    expect(r.pt).toBe(0);
    expect(r.net).toBe(17500);
    expect(r.basis).toBe("fixed_fee");
    expect(r.fee).toBe(20000);
  });
});
