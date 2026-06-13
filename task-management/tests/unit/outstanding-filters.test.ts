import { describe, it, expect } from "vitest";
import {
  parseOutstandingFilters,
  applyOutstandingFilters,
  type OutstandingFilters,
} from "@/lib/outstanding/filters";

describe("parseOutstandingFilters", () => {
  it("reads comma-separated params into the right arrays, empty for unset", () => {
    const f = parseOutstandingFilters({
      emp: "a,b",
      status: "overdue",
      month: "2026-01",
      entity: "Cash",
    });
    expect(f.employees).toEqual(["a", "b"]);
    expect(f.statuses).toEqual(["overdue"]);
    expect(f.months).toEqual(["2026-01"]);
    expect(f.entities).toEqual(["Cash"]);
    expect(f.years).toEqual([]);
    expect(f.cycles).toEqual([]);
    expect(f.modes).toEqual([]);
  });
});

describe("applyOutstandingFilters", () => {
  const f = (over: Partial<OutstandingFilters> = {}): OutstandingFilters => ({
    employees: [], entities: [], months: [], years: [],
    cycles: [], modes: [], statuses: [], ...over,
  });

  it("drops rows that don't match the status filter", () => {
    const rows = [
      { dueDate: "2026-01-15", state: "overdue" },
      { dueDate: "2026-01-15", state: "not_due" },
    ];
    const out = applyOutstandingFilters(rows, f({ statuses: ["overdue"] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("overdue");
  });

  it("filters by month on dueDate slice", () => {
    const rows = [
      { dueDate: "2026-01-15", state: "overdue" },
      { dueDate: "2026-02-01", state: "overdue" },
    ];
    const out = applyOutstandingFilters(rows, f({ months: ["2026-01"] }));
    expect(out.map((r) => r.dueDate)).toEqual(["2026-01-15"]);
  });

  it("excludes rows missing/null on a field that has an active filter", () => {
    const rows = [
      { dueDate: "2026-01-01", state: "overdue", responsibleName: "Manan" },
      { dueDate: "2026-01-01", state: "overdue" }, // responsibleName absent
      { dueDate: "2026-01-01", state: "overdue", responsibleName: null },
    ];
    const out = applyOutstandingFilters(rows, f({ employees: ["Manan"] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.responsibleName).toBe("Manan");
  });
});
