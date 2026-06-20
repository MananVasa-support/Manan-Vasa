import { describe, it, expect } from "vitest";
import { computeInitiatorScorecard, type InitiatorEmployee, type InitiatedTask } from "@/lib/transforms/initiator-scorecard";

// Org: Manan (founder, no mgr). Jeevan & Rohan are managers (report to nobody yet).
// Pratik & Purvi report to Jeevan. Hardik reports to Rohan.
const emps: InitiatorEmployee[] = [
  { id: "manan", name: "Manan Vasa", managerId: null, email: "manan@unleashed.in" },
  { id: "jeevan", name: "Jeevan", managerId: null, email: "jeevan@x.in" },
  { id: "rohan", name: "Rohan", managerId: null, email: "rohan@x.in" },
  { id: "pratik", name: "Pratik", managerId: "jeevan", email: "pratik@x.in" },
  { id: "purvi", name: "Purvi", managerId: "jeevan", email: "purvi@x.in" },
  { id: "hardik", name: "Hardik", managerId: "rohan", email: "hardik@x.in" },
];
const isFounder = (e: string | null) => e === "manan@unleashed.in";

describe("computeInitiatorScorecard", () => {
  it("classifies into reports / counterparts / founder; KPI uses reports only", () => {
    const tasks: InitiatedTask[] = [
      { initiatorId: "jeevan", doerId: "pratik" }, // direct report
      { initiatorId: "jeevan", doerId: "pratik" }, // direct report
      { initiatorId: "jeevan", doerId: "purvi" },  // direct report
      { initiatorId: "jeevan", doerId: "rohan" },  // counterpart (another mgr)
      { initiatorId: "jeevan", doerId: "hardik" }, // counterpart (other team)
      { initiatorId: "jeevan", doerId: "manan" },  // founder
    ];
    const cards = computeInitiatorScorecard(tasks, emps, 3, isFounder); // 3 working days
    const jeevan = cards.find((c) => c.managerId === "jeevan")!;
    expect(jeevan.directReports).toBe(2);
    expect(jeevan.totalInitiated).toBe(6);
    expect(jeevan.toDirectReports).toBe(3);
    expect(jeevan.toCounterparts).toBe(2);
    expect(jeevan.toFounderMgmt).toBe(1);
    expect(jeevan.target).toBe(2 * 3 * 3);      // reports × 3 × workingDays = 18
    expect(jeevan.actual).toBe(3);
    expect(jeevan.attainmentPct).toBe(Math.round((3 / 18) * 100));
    const pratik = jeevan.perReport.find((r) => r.employeeId === "pratik")!;
    expect(pratik.given).toBe(2);
    expect(pratik.goal).toBe(3 * 3); // 3 × workingDays = 9
    expect(pratik.hit).toBe(false);
  });
  it("only people with ≥1 direct report are managers; founder excluded even with reports? (Manan has none here)", () => {
    const cards = computeInitiatorScorecard([], emps, 3, isFounder);
    expect(cards.map((c) => c.managerId).sort()).toEqual(["jeevan", "rohan"]);
  });
});
