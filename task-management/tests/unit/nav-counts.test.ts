import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ n: 1200 }])),
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
