import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, employees, type Broadcast, type BroadcastRecipient } from "@/db/schema";
import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
  BroadcastRecipientStatus,
} from "@/db/enums";
import { requireHrStaff } from "@/lib/hr/access";

/**
 * Enterprise Communications (ECOS, migration 0179) — read model.
 *
 * Author-facing queries (`listBroadcasts`, `getBroadcastWithStats`) are
 * HR-gated (super-admins + the HR department). Employee-facing queries take an
 * explicit `employeeId` and are NOT gated here — the calling page/action owns
 * the "this is me" check.
 */

export interface BroadcastListItem {
  id: string;
  title: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  status: BroadcastStatus;
  recipientCount: number;
  readCount: number;
  ackCount: number;
  publishedAt: Date | null;
  authorName: string | null;
}

/** Author/admin dashboard list — every broadcast with live read/ack rollups. */
export async function listBroadcasts(): Promise<BroadcastListItem[]> {
  await requireHrStaff();

  const rows = await db
    .select({
      id: broadcasts.id,
      title: broadcasts.title,
      category: broadcasts.category,
      priority: broadcasts.priority,
      status: broadcasts.status,
      recipientCount: broadcasts.recipientCount,
      publishedAt: broadcasts.publishedAt,
      createdAt: broadcasts.createdAt,
      authorName: employees.name,
    })
    .from(broadcasts)
    .leftJoin(employees, eq(broadcasts.authorId, employees.id))
    .orderBy(desc(broadcasts.createdAt));

  // Live read/ack rollups per broadcast (FILTER-aggregate in one grouped pass).
  const counts = await db
    .select({
      broadcastId: broadcastRecipients.broadcastId,
      readCount: sql<number>`count(*) filter (where ${broadcastRecipients.status} <> 'pending')`,
      ackCount: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'acknowledged')`,
    })
    .from(broadcastRecipients)
    .groupBy(broadcastRecipients.broadcastId);

  const byId = new Map<string, { readCount: number; ackCount: number }>();
  for (const c of counts) {
    byId.set(c.broadcastId, {
      readCount: Number(c.readCount) || 0,
      ackCount: Number(c.ackCount) || 0,
    });
  }

  return rows.map((r) => {
    const c = byId.get(r.id);
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      priority: r.priority,
      status: r.status,
      recipientCount: r.recipientCount,
      readCount: c?.readCount ?? 0,
      ackCount: c?.ackCount ?? 0,
      publishedAt: r.publishedAt,
      authorName: r.authorName,
    };
  });
}

export interface BroadcastStats {
  total: number;
  read: number;
  acknowledged: number;
  pending: number;
}

export interface BroadcastRecipientRow {
  employeeId: string;
  name: string;
  status: BroadcastRecipientStatus;
  readAt: Date | null;
  acknowledgedAt: Date | null;
}

/** Full author view of one broadcast: the row, delivery stats, per-recipient list. */
export async function getBroadcastWithStats(id: string): Promise<{
  broadcast: Broadcast;
  stats: BroadcastStats;
  recipients: BroadcastRecipientRow[];
} | null> {
  await requireHrStaff();

  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, id),
  });
  if (!broadcast) return null;

  const recips = await db
    .select({
      employeeId: broadcastRecipients.employeeId,
      name: employees.name,
      status: broadcastRecipients.status,
      readAt: broadcastRecipients.readAt,
      acknowledgedAt: broadcastRecipients.acknowledgedAt,
    })
    .from(broadcastRecipients)
    .innerJoin(employees, eq(employees.id, broadcastRecipients.employeeId))
    .where(eq(broadcastRecipients.broadcastId, id))
    .orderBy(employees.name);

  const stats: BroadcastStats = {
    total: recips.length,
    read: 0,
    acknowledged: 0,
    pending: 0,
  };
  for (const r of recips) {
    if (r.status === "acknowledged") stats.acknowledged += 1;
    else if (r.status === "read") stats.read += 1;
    else stats.pending += 1;
  }

  return { broadcast, stats, recipients: recips };
}

/** Employee-facing single-broadcast read: the broadcast + THIS employee's receipt. */
export async function getBroadcastForEmployee(
  broadcastId: string,
  employeeId: string,
): Promise<{ broadcast: Broadcast; receipt: BroadcastRecipient | null } | null> {
  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, broadcastId),
  });
  if (!broadcast) return null;

  const receipt = await db.query.broadcastRecipients.findFirst({
    where: and(
      eq(broadcastRecipients.broadcastId, broadcastId),
      eq(broadcastRecipients.employeeId, employeeId),
    ),
  });

  return { broadcast, receipt: receipt ?? null };
}

/** The employee's own broadcast inbox — everything delivered to them, newest first. */
export async function listMyBroadcasts(
  employeeId: string,
): Promise<{ broadcast: Broadcast; receipt: BroadcastRecipient }[]> {
  const rows = await db
    .select({
      broadcast: broadcasts,
      receipt: broadcastRecipients,
    })
    .from(broadcastRecipients)
    .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(eq(broadcastRecipients.employeeId, employeeId))
    .orderBy(
      desc(sql`coalesce(${broadcasts.publishedAt}, ${broadcastRecipients.createdAt})`),
    );

  return rows.map((r) => ({ broadcast: r.broadcast, receipt: r.receipt }));
}

/**
 * The app-lock gate query — the OLDEST published, lock-requiring broadcast this
 * employee has NOT yet acknowledged, or null. FAIL-OPEN: any error returns null
 * so a broken read can never freeze a user out of the app.
 */
export async function pendingLockBroadcastForEmployee(
  employeeId: string,
): Promise<Broadcast | null> {
  try {
    const rows = await db
      .select({ broadcast: broadcasts })
      .from(broadcastRecipients)
      .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
      .where(
        and(
          eq(broadcastRecipients.employeeId, employeeId),
          eq(broadcasts.requireLock, true),
          eq(broadcasts.status, "published"),
          ne(broadcastRecipients.status, "acknowledged"),
        ),
      )
      .orderBy(sql`${broadcasts.publishedAt} asc nulls last`)
      .limit(1);
    return rows[0]?.broadcast ?? null;
  } catch {
    // Fail-open — the app-lock gate must never hard-block on a read error.
    return null;
  }
}
