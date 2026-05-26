import { count } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, tasks } from "@/lib/db";
import { getUnreadCount } from "@/lib/queries/notifications";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Active + archived task totals are global counters that change only
 * when a task is created, archived, or restored — all paths that already
 * call `revalidateTag(CACHE_TAGS.tasks)`. Folding both into a single
 * GROUP BY removes one DB round-trip on every page render (the header
 * renders site-wide). The 60s `revalidate` is a safety net only.
 */
const fetchTaskTotals = unstable_cache(
  async (): Promise<{ activeTasks: number; archivedTasks: number }> => {
    const rows = await db
      .select({ archived: tasks.archived, n: count() })
      .from(tasks)
      .groupBy(tasks.archived);
    let active = 0;
    let archived = 0;
    for (const r of rows) {
      if (r.archived) archived = Number(r.n);
      else active = Number(r.n);
    }
    return { activeTasks: active, archivedTasks: archived };
  },
  ["nav-task-totals"],
  { tags: [CACHE_TAGS.tasks], revalidate: 60 },
);

export async function getNavCounts(args?: {
  userId?: string;
  isAdmin?: boolean;
  inboxSince?: Date | undefined;
}): Promise<{
  activeTasks: number;
  archivedTasks: number;
  inboxUnread: number;
}> {
  // Unread count is per-user — kept out of the shared cache. The two
  // task totals are now one cache lookup that hits Postgres at most
  // once per minute (or until a task mutation invalidates the tag).
  const [totals, inboxUnread] = await Promise.all([
    fetchTaskTotals(),
    args?.userId ? getUnreadCount(args.userId) : Promise.resolve(0),
  ]);
  return { ...totals, inboxUnread };
}
