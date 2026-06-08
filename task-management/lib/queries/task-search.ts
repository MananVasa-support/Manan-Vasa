import { eq, or, desc, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, employees, tasks } from "@/lib/db";
import type { TaskStatus } from "@/db/enums";

// Kept in its own module (no next/cache imports) so server actions can import
// the search without pulling in the unstable_cache-wrapped list queries.

export interface TaskSearchResult {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  subject: string | null;
  status: TaskStatus;
  doerName: string | null;
  archived: boolean;
}

/**
 * App-wide task search for the header command palette (sir's changes #12).
 * Matches the query against task title / client / subject / doer name
 * (case-insensitive substring) and, when the query is a number, the friendly
 * task number. Freshest matches first, capped small for a snappy palette.
 */
export async function searchTasks(rawQuery: string): Promise<TaskSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const doerEmp = alias(employees, "doer_emp");

  // A bare number (optionally "#1042") also matches the friendly task number.
  const numeric = q.replace(/^#/, "");
  const asNumber = /^\d+$/.test(numeric) ? Number(numeric) : null;

  const matchers = [
    ilike(tasks.title, like),
    ilike(tasks.client, like),
    ilike(tasks.subject, like),
    ilike(doerEmp.name, like),
  ];
  if (asNumber != null) matchers.push(eq(tasks.taskNo, asNumber));

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
      archived: tasks.archived,
      doerName: doerEmp.name,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .where(or(...matchers))
    .orderBy(desc(tasks.createdAt))
    .limit(20);

  return rows.map((r) => ({ ...r, doerName: r.doerName ?? null }));
}
