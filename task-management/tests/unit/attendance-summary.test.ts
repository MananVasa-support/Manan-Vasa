import { describe, it, expect } from "vitest";
import { summarize, type SummaryDay } from "@/lib/attendance/summary";
import type { DayCodeResult } from "@/lib/attendance/status";

function day(
  date: string,
  weekKey: string,
  res: Partial<DayCodeResult> & { code: DayCodeResult["code"]; dayValue: number; workedMinutes: number },
  opts: { offDay?: boolean; elapsed?: boolean } = {},
): SummaryDay {
  return {
    date,
    weekKey,
    offDay: opts.offDay ?? false,
    elapsed: opts.elapsed ?? true,
    result: {
      late: false,
      leftEarly: false,
      lateWaived: false,
      ...res,
    } as DayCodeResult,
  };
}

const P = (date: string, wk: string, extra: Partial<DayCodeResult> = {}) =>
  day(date, wk, { code: "P", dayValue: 1, workedMinutes: 540, ...extra });
const HD = (date: string, wk: string, extra: Partial<DayCodeResult> = {}) =>
  day(date, wk, { code: "H/D", dayValue: 0.5, workedMinutes: 300, ...extra });

describe("attendance summarize", () => {
  it("week that hits 54h waives half-days + late/early marks", () => {
    // 6 days × 9h = 54h exactly. One day was late + a half-day on paper.
    const wk = "2026-07-06";
    const days = [
      P("2026-07-06", wk),
      P("2026-07-07", wk, { late: true }), // late but full 9h
      P("2026-07-08", wk),
      P("2026-07-09", wk),
      P("2026-07-10", wk),
      day("2026-07-11", wk, { code: "H/D", dayValue: 0.5, workedMinutes: 540, late: true }), // odd but 9h
    ];
    const s = summarize(days, 1000);
    // 54h reached → everything upgraded to present, no marks, no deduction
    expect(s.workingDays).toBe(6);
    expect(s.presentDays).toBe(6);
    expect(s.lateDays).toBe(0);
    expect(s.halfDays).toBe(0);
    expect(s.salaryReduced).toBe(0);
  });

  it("week under 54h keeps half-days + counts marks; 3 marks = extra half-day", () => {
    const wk = "2026-07-13";
    const days = [
      P("2026-07-13", wk, { late: true }), // late mark 1
      P("2026-07-14", wk, { leftEarly: true }), // early mark 2
      P("2026-07-15", wk, { late: true }), // late mark 3 → +0.5 deduction
      HD("2026-07-16", wk), // half day → 0.5 short
      day("2026-07-17", wk, { code: "A", dayValue: 0, workedMinutes: 0 }), // absent
    ]; // total worked = 540*3 + 300 = 1920 min < 3240 → no waiver
    const s = summarize(days, 1000);
    expect(s.workingDays).toBe(5);
    expect(s.presentDays).toBe(3.5); // 3 full + 1 half + 0 absent
    expect(s.lateDays).toBe(2);
    expect(s.earlyDays).toBe(1);
    expect(s.halfDays).toBe(1);
    expect(s.absentDays).toBe(1);
    expect(s.markDeductionDays).toBe(0.5); // floor((2+1)/3)*0.5
    // deduction = (5 - 3.5) + 0.5 = 2.0 → ₹2000
    expect(s.deductionDays).toBe(2);
    expect(s.salaryReduced).toBe(2000);
  });

  it("ignores off-days and future (non-elapsed) days", () => {
    const wk = "2026-07-13";
    const days = [
      P("2026-07-13", wk),
      day("2026-07-19", wk, { code: "W/O", dayValue: 1, workedMinutes: 0 }, { offDay: true }),
      P("2026-07-20", "2026-07-20", {}), // future
    ];
    days[2]!.elapsed = false;
    const s = summarize(days, 1000);
    expect(s.workingDays).toBe(1);
    expect(s.presentDays).toBe(1);
  });
});
