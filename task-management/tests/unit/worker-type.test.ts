import { describe, it, expect } from "vitest";
import { payBasisFor, gradingModeFor, asWorkerType } from "@/lib/attendance/worker-type";

describe("worker-type resolver", () => {
  it("maps pay basis", () => {
    expect(payBasisFor("full_time")).toBe("monthly_ctc");
    expect(payBasisFor("afternoon_shift")).toBe("monthly_ctc");
    expect(payBasisFor("part_time")).toBe("hourly");
    expect(payBasisFor("project_remote")).toBe("fixed_fee");
  });
  it("maps grading mode", () => {
    expect(gradingModeFor("full_time")).toBe("day");
    expect(gradingModeFor("afternoon_shift")).toBe("day");
    expect(gradingModeFor("part_time")).toBe("hours");
    expect(gradingModeFor("project_remote")).toBe("session");
  });
  it("narrows untrusted strings, defaulting to full_time", () => {
    expect(asWorkerType("part_time")).toBe("part_time");
    expect(asWorkerType("garbage")).toBe("full_time");
    expect(asWorkerType(null)).toBe("full_time");
  });
});
