import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/* The two reads countPlannedWork makes, in order:
 *   1. daily_checklist rows for the day  -> [{ taskId }]
 *   2. count of open assigned tasks      -> [{ n }]
 * Each is `db.select(...).from(...).where(...)`, so the chain is stubbed and
 * the awaited value is taken from a queue.                                   */
const { queue, whereCalls } = vi.hoisted(() => ({
  queue: [] as unknown[][],
  whereCalls: [] as unknown[][],
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          whereCalls.push(args);
          return Promise.resolve(queue.shift() ?? []);
        },
      }),
    }),
  },
  dailyChecklist: {}, dailyPlanDay: {}, goals: {}, weeklyGoals: {},
  weeklyGoalActuals: {}, tasks: { id: "tasks.id" }, employees: {},
}));

vi.mock("@/db/schema", () => ({
  dailyChecklist: { taskId: "dc.task_id", employeeId: "dc.emp", planDate: "dc.date" },
  dailyPlanDay: {}, goals: {}, weeklyGoals: {}, weeklyGoalActuals: {},
  tasks: { id: "t.id", doerId: "t.doer", archived: "t.archived", status: "t.status", createdAt: "t.created" },
  employees: {},
}));

const notInArrayMock = vi.fn((_col: unknown, vals: unknown[]) => ({ __notIn: vals }));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ __and: a.filter(Boolean) }),
  asc: () => ({}), desc: () => ({}), eq: () => ({}), lt: () => ({}),
  isNull: () => ({}), inArray: () => ({}),
  notInArray: (c: unknown, v: unknown[]) => notInArrayMock(c, v),
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.raw.join("?"), v }),
    { raw: (s: string) => ({ __raw: s }) },
  ),
}));

vi.mock("@/lib/tasks/effective-due", () => ({
  effectiveDueAtSql: () => ({ __raw: "effective_due" }),
  pickEffectiveDue: () => null,
}));
vi.mock("@/lib/weekly-goals/week", () => ({
  istYmd: () => "2026-08-18",
  currentWeekStart: () => "2026-08-17",
}));

const { countPlannedWork } = await import("@/lib/queries/daily-checklist");

beforeEach(() => {
  queue.length = 0;
  whereCalls.length = 0;
  notInArrayMock.mockClear();
});

describe("countPlannedWork — what the clock-in gate measures", () => {
  it("does NOT double-count a task that is both assigned and pulled onto the plan", async () => {
    // 3 checklist rows, all of them pulled tasks. The DB excludes those 3 from
    // the assigned count (notInArray), so it returns 0 more.
    queue.push([{ taskId: "t1" }, { taskId: "t2" }, { taskId: "t3" }], [{ n: 0 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(3);
  });

  it("asks the database to exclude pulled tasks when any were pulled", async () => {
    queue.push([{ taskId: "t1" }, { taskId: "t2" }], [{ n: 0 }]);
    await countPlannedWork("emp-1", "2026-08-18");
    expect(notInArrayMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock.mock.calls[0]?.[1]).toEqual(["t1", "t2"]);
  });

  it("omits the exclusion entirely when nothing was pulled (empty NOT IN is invalid SQL)", async () => {
    queue.push([{ taskId: null }, { taskId: null }], [{ n: 4 }]);
    const n = await countPlannedWork("emp-1", "2026-08-18");
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(n).toBe(6); // 2 typed commitments + 4 assigned
  });

  it("counts assigned work on its own — someone who planned nothing but has tasks due", async () => {
    queue.push([], [{ n: 5 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(5);
  });

  it("returns 0 for an empty day", async () => {
    queue.push([], [{ n: 0 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(0);
  });
});
