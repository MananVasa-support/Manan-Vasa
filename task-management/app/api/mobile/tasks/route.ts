import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { PENDING_STATUSES, type TaskStatus } from "@/db/enums";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { nextStatusesFor, type ActorRole } from "@/lib/auth/status-transitions";
import { getStatusDisplayMap } from "@/lib/queries/status-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

const PENDING = new Set<TaskStatus>(PENDING_STATUSES);

/**
 * GET /api/mobile/tasks — the signed-in user's tasks (as doer, non-archived).
 * Pending tasks first (soonest due), then completed/closed (most recent first).
 * Each task carries `allowedTransitions` (the valid next statuses for THIS
 * user, straight from the permission matrix) so the app shows only legal moves,
 * and `updatedAt` for the optimistic-lock on the status-update call. The
 * `statusDisplay` map (label + colour token per status) lets the app render
 * pills without hard-coding labels.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const role: ActorRole = me.isAdmin ? "admin" : "doer";

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      subject: tasks.subject,
      client: tasks.client,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.doerId, me.id), eq(tasks.archived, false)))
    .limit(1000);

  // Pending first (soonest due), then everything else (most recently touched).
  rows.sort((a, b) => {
    const ap = PENDING.has(a.status);
    const bp = PENDING.has(b.status);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap) return a.dueAt.getTime() - b.dueAt.getTime();
    return (b.completedAt ?? b.updatedAt).getTime() - (a.completedAt ?? a.updatedAt).getTime();
  });

  const statusDisplay = await getStatusDisplayMap();

  return NextResponse.json(
    {
      statusDisplay,
      tasks: rows.map((t) => ({
        id: t.id,
        taskNo: t.taskNo,
        title: t.title,
        subject: t.subject,
        client: t.client,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        allowedTransitions: nextStatusesFor(t.status, role),
      })),
    },
    { headers: MOBILE_CORS },
  );
}
