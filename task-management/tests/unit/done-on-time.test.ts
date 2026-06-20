import { describe, it, expect } from "vitest";
import { computeDoneOnTime, type DoneOnTimeTask } from "@/lib/transforms/done-on-time";

const names = new Map([["u1", "Alice"]]);
function task(p: Partial<DoneOnTimeTask>): DoneOnTimeTask {
  return { status: "done", archived: false, completedAt: null, dueAt: null, originalDueAt: null, doerId: "u1", ...p };
}

describe("computeDoneOnTime", () => {
  it("a task late vs ORIGINAL but on-time vs REVISED flips between bases", () => {
    // original due 2026-06-10, revised due 2026-06-20, completed 2026-06-15
    const t = task({ originalDueAt: "2026-06-10", dueAt: "2026-06-20", completedAt: "2026-06-15" });
    const r = computeDoneOnTime([t], names);
    expect(r.original.late).toBe(1);   // 15 > 10 → late
    expect(r.original.onTime).toBe(0);
    expect(r.revised.onTime).toBe(1);  // 15 <= 20 → on time
    expect(r.revised.late).toBe(0);
  });
  it("buckets signed days into the histogram (revised basis here)", () => {
    const t = task({ originalDueAt: "2026-06-20", dueAt: "2026-06-20", completedAt: "2026-06-24" }); // 4 late
    const r = computeDoneOnTime([t], names);
    const band = r.revised.histogram.find((b) => b.id === "l4_5");
    expect(band?.count).toBe(1);
    expect(r.revised.histogram).toHaveLength(12); // all bands always present
  });
  it("ignores non-done / archived; counts undated separately", () => {
    const r = computeDoneOnTime(
      [task({ status: "initiated" }), task({ archived: true }), task({ completedAt: null, dueAt: "2026-06-20" })],
      names,
    );
    expect(r.original.total).toBe(1);    // only the done, non-archived one
    expect(r.original.undated).toBe(1);
    expect(r.original.dated).toBe(0);
  });
});
