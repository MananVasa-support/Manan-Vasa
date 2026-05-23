import { count, eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { getUnreadCount } from "@/lib/queries/notifications";

export async function getNavCounts(args?: {
  userId?: string;
  isAdmin?: boolean;
  inboxSince?: Date | undefined;
}): Promise<{
  activeTasks: number;
  archivedTasks: number;
  inboxUnread: number;
}> {
  const [activeRow, archivedRow, inboxUnread] = await Promise.all([
    db
      .select({ n: count() })
      .from(tasks)
      .where(eq(tasks.archived, false)),
    db
      .select({ n: count() })
      .from(tasks)
      .where(eq(tasks.archived, true)),
    // M2.3: count comes from per-row read_at (NULL = unread).  The
    // last_inbox_visit_at stamp still lives on employees (we don't drop
    // it) but is no longer the source of truth for the badge.
    args?.userId
      ? getUnreadCount(args.userId)
      : Promise.resolve(0),
  ]);
  return {
    activeTasks: Number(activeRow[0]?.n ?? 0),
    archivedTasks: Number(archivedRow[0]?.n ?? 0),
    inboxUnread,
  };
}
