import { describe, it, expect } from "vitest";
import {
  DEFAULT_WMS_FILTER,
  STATUS_GROUP,
  applyWmsFilter,
  isFilterActive,
  matchesDue,
  matchesStatus,
  shiftYmd,
  sortByAttention,
  weekBoundsYmd,
  type WmsFilter,
} from "@/components/goals/plan/filters";
import type { SourceItem } from "@/components/goals/plan/types";
import type { TaskPriority, TaskStatus } from "@/db/enums";

const TODAY = "2026-08-11"; // a Tuesday

function task(over: Partial<SourceItem> & { id: string }): SourceItem {
  return {
    kind: "task",
    title: `Task ${over.id}`,
    subtitle: null,
    meta: null,
    added: false,
    ...over,
  };
}

function filter(over: Partial<WmsFilter> = {}): WmsFilter {
  return { ...DEFAULT_WMS_FILTER, ...over };
}

describe("shiftYmd", () => {
  it("moves forward and backward by whole days", () => {
    expect(shiftYmd(TODAY, 1)).toBe("2026-08-12");
    expect(shiftYmd(TODAY, -1)).toBe("2026-08-10");
    expect(shiftYmd(TODAY, 0)).toBe(TODAY);
  });

  it("rolls over month and year boundaries", () => {
    expect(shiftYmd("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftYmd("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(shiftYmd("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("weekBoundsYmd", () => {
  it("returns Monday→Sunday for a midweek day", () => {
    expect(weekBoundsYmd(TODAY)).toEqual({ start: "2026-08-10", end: "2026-08-16" });
  });

  it("keeps Monday as its own week start", () => {
    expect(weekBoundsYmd("2026-08-10")).toEqual({ start: "2026-08-10", end: "2026-08-16" });
  });

  it("treats Sunday as the END of the week, not the start", () => {
    // The trap: getUTCDay() is 0 on Sunday, so a naive `dow - 1` would jump a
    // week forward. Sunday must resolve to the Monday six days BEHIND it.
    expect(weekBoundsYmd("2026-08-16")).toEqual({ start: "2026-08-10", end: "2026-08-16" });
  });
});

describe("matchesDue", () => {
  const overdue = task({ id: "a", dueYmd: "2026-08-09" });
  const dueToday = task({ id: "b", dueYmd: TODAY });
  const tomorrow = task({ id: "c", dueYmd: "2026-08-12" });
  const nextWeek = task({ id: "d", dueYmd: "2026-08-20" });
  const undated = task({ id: "e", dueYmd: null });

  it("passes everything on 'all', including undated work", () => {
    for (const t of [overdue, dueToday, tomorrow, nextWeek, undated]) {
      expect(matchesDue(t, filter({ due: "all" }), TODAY)).toBe(true);
    }
  });

  it("selects overdue strictly before today", () => {
    const f = filter({ due: "overdue" });
    expect(matchesDue(overdue, f, TODAY)).toBe(true);
    expect(matchesDue(dueToday, f, TODAY)).toBe(false);
    expect(matchesDue(undated, f, TODAY)).toBe(false);
  });

  it("selects today and tomorrow exactly", () => {
    expect(matchesDue(dueToday, filter({ due: "today" }), TODAY)).toBe(true);
    expect(matchesDue(tomorrow, filter({ due: "today" }), TODAY)).toBe(false);
    expect(matchesDue(tomorrow, filter({ due: "tomorrow" }), TODAY)).toBe(true);
    expect(matchesDue(dueToday, filter({ due: "tomorrow" }), TODAY)).toBe(false);
  });

  it("'this week' spans the whole Mon-Sun week, including days already past", () => {
    const f = filter({ due: "week" });
    expect(matchesDue(task({ id: "mon", dueYmd: "2026-08-10" }), f, TODAY)).toBe(true);
    expect(matchesDue(dueToday, f, TODAY)).toBe(true);
    expect(matchesDue(task({ id: "sun", dueYmd: "2026-08-16" }), f, TODAY)).toBe(true);
    expect(matchesDue(nextWeek, f, TODAY)).toBe(false);
    expect(matchesDue(task({ id: "prev", dueYmd: "2026-08-09" }), f, TODAY)).toBe(false);
  });

  it("honours custom bounds, treating each side as optional", () => {
    expect(matchesDue(nextWeek, filter({ due: "custom", from: "2026-08-18", to: "2026-08-22" }), TODAY)).toBe(true);
    expect(matchesDue(nextWeek, filter({ due: "custom", from: "2026-08-21", to: "" }), TODAY)).toBe(false);
    expect(matchesDue(nextWeek, filter({ due: "custom", from: "", to: "2026-08-31" }), TODAY)).toBe(true);
    // An undated task can never satisfy a date range.
    expect(matchesDue(undated, filter({ due: "custom", from: "", to: "" }), TODAY)).toBe(false);
  });
});

describe("matchesStatus", () => {
  it("groups the real task statuses into the four buckets", () => {
    expect(matchesStatus(task({ id: "a", status: "not_started" }), "open")).toBe(true);
    expect(matchesStatus(task({ id: "b", status: "initiated" }), "in_progress")).toBe(true);
    expect(matchesStatus(task({ id: "c", status: "on_hold" }), "blocked")).toBe(true);
    expect(matchesStatus(task({ id: "d", status: "need_info" }), "blocked")).toBe(true);
    expect(matchesStatus(task({ id: "e", status: "done" }), "completed")).toBe(true);
  });

  it("does not leak a status across buckets", () => {
    expect(matchesStatus(task({ id: "a", status: "not_started" }), "in_progress")).toBe(false);
    expect(matchesStatus(task({ id: "b", status: "done" }), "open")).toBe(false);
  });

  it("keeps the buckets disjoint", () => {
    const seen = new Set<TaskStatus>();
    for (const group of Object.values(STATUS_GROUP)) {
      for (const s of group) {
        expect(seen.has(s)).toBe(false);
        seen.add(s);
      }
    }
  });

  it("passes everything on 'all', and drops status-less rows otherwise", () => {
    const noStatus = task({ id: "x" });
    expect(matchesStatus(noStatus, "all")).toBe(true);
    expect(matchesStatus(noStatus, "open")).toBe(false);
  });
});

describe("applyWmsFilter", () => {
  const items = [
    task({ id: "a", dueYmd: "2026-08-09", priority: "imp_urgent", status: "not_started" }),
    task({ id: "b", dueYmd: TODAY, priority: "not_imp_not_urgent", status: "initiated" }),
    task({ id: "c", dueYmd: "2026-08-09", priority: "imp_urgent", status: "on_hold" }),
  ];

  it("ANDs the three dimensions together", () => {
    const got = applyWmsFilter(items, filter({ due: "overdue", priority: "imp_urgent", status: "open" }), TODAY);
    expect(got.map((i) => i.id)).toEqual(["a"]);
  });

  it("returns everything untouched with the default filter", () => {
    expect(applyWmsFilter(items, DEFAULT_WMS_FILTER, TODAY)).toHaveLength(3);
  });
});

describe("isFilterActive", () => {
  it("is false only for the pristine filter", () => {
    expect(isFilterActive(DEFAULT_WMS_FILTER)).toBe(false);
    expect(isFilterActive(filter({ due: "overdue" }))).toBe(true);
    expect(isFilterActive(filter({ priority: "imp_urgent" }))).toBe(true);
    expect(isFilterActive(filter({ status: "blocked" }))).toBe(true);
  });
});

describe("sortByAttention", () => {
  it("ranks overdue, then due today, then by priority", () => {
    const items = [
      task({ id: "normal-later", dueYmd: "2026-09-01", priority: "not_imp_not_urgent" }),
      task({ id: "critical-later", dueYmd: "2026-09-01", priority: "imp_urgent" }),
      task({ id: "today", dueYmd: TODAY, priority: "not_imp_not_urgent" }),
      task({ id: "overdue", dueYmd: "2026-08-01", priority: "not_imp_not_urgent" }),
    ];
    expect(sortByAttention(items, TODAY).map((i) => i.id)).toEqual([
      "overdue",
      "today",
      "critical-later",
      "normal-later",
    ]);
  });

  it("beats due date with priority once past the overdue/today buckets", () => {
    const items = [
      task({ id: "sooner-normal", dueYmd: "2026-08-12", priority: "not_imp_not_urgent" }),
      task({ id: "later-critical", dueYmd: "2026-08-30", priority: "imp_urgent" }),
    ];
    expect(sortByAttention(items, TODAY).map((i) => i.id)).toEqual(["later-critical", "sooner-normal"]);
  });

  it("sinks undated work below everything dated, even when it is Critical", () => {
    // The regression this guards: priority is compared before the date
    // tiebreaker, so without a dedicated undated bucket a Critical task with no
    // due date outranks every dated task and leads the list.
    const items = [
      task({ id: "undated", dueYmd: null, priority: "imp_urgent" }),
      task({ id: "dated", dueYmd: "2026-09-01", priority: "not_imp_not_urgent" }),
    ];
    expect(sortByAttention(items, TODAY).map((i) => i.id)).toEqual(["dated", "undated"]);
  });

  it("does not mutate the input array", () => {
    const items = [task({ id: "a", dueYmd: "2026-09-01" }), task({ id: "b", dueYmd: "2026-08-01" })];
    const before = items.map((i) => i.id);
    sortByAttention(items, TODAY);
    expect(items.map((i) => i.id)).toEqual(before);
  });

  it("orders every priority rank correctly within one bucket", () => {
    const prios: TaskPriority[] = ["not_imp_not_urgent", "not_imp_urgent", "imp_not_urgent", "imp_urgent"];
    const items = prios.map((p) => task({ id: p, dueYmd: "2026-09-01", priority: p }));
    expect(sortByAttention(items, TODAY).map((i) => i.id)).toEqual([
      "imp_urgent",
      "imp_not_urgent",
      "not_imp_urgent",
      "not_imp_not_urgent",
    ]);
  });
});
