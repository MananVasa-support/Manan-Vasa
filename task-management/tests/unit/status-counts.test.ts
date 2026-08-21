import { describe, it, expect } from "vitest";
import {
  computeKpiTotals,
} from "@/lib/transforms/status-counts";
import { fixtureTasks } from "../fixtures/tasks";

describe("computeKpiTotals", () => {
  it("breaks Pending umbrella into pending (initiated+follow_up), notStarted, needHelp", () => {
    const totals = computeKpiTotals(fixtureTasks);
    expect(totals).toEqual({
      total: 16,
      pending: 2,       // 1 initiated + 1 follow_up
      notStarted: 0,    // fixture has none currently
      needHelp: 1,
      done: 10,         // 8 done + 2 approved
      notApproved: 1,
    });
  });
});

