import { describe, it, expect, vi } from "vitest";

// `unstable_cache` requires Next's incrementalCache at runtime, which the
// vitest node env doesn't provide. Mock it as a pass-through wrapper so
// `fetchTaskTotals` in nav-counts.ts just invokes the underlying function.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    // The query is now `select({archived, n}).from(tasks).groupBy(tasks.archived)`
    // returning one row per archived value.
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        groupBy: vi.fn(() =>
          Promise.resolve([
            { archived: false, n: 1200 },
            { archived: true, n: 300 },
          ]),
        ),
      })),
    })),
  },
  tasks: { archived: "tasks.archived" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, count: () => ({ as: () => "count_alias" }) };
});

// notifications query is exercised in its own surface; here we stub it so
// getNavCounts stays focused on the tasks counts shape.
vi.mock("@/lib/queries/notifications", () => ({
  getUnreadCount: vi.fn(() => Promise.resolve(0)),
}));

import { getNavCounts } from "@/lib/queries/nav-counts";

describe("getNavCounts", () => {
  it("returns shape { activeTasks, archivedTasks, inboxUnread } as numbers", async () => {
    const result = await getNavCounts();
    expect(typeof result.activeTasks).toBe("number");
    expect(typeof result.archivedTasks).toBe("number");
    expect(typeof result.inboxUnread).toBe("number");
    expect(result.inboxUnread).toBe(0);
  });
});
