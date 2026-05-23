import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, tasks, type Client } from "@/db/schema";

/**
 * Active client names, alphabetical (case-insensitive). Drives the
 * "Client Name" picker on the New Task / Edit Task forms.
 */
export async function listActiveClientNames(): Promise<string[]> {
  const rows = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.isActive, true))
    .orderBy(asc(clients.name));
  // Postgres `order by name` is byte-order (uppercase before lowercase);
  // re-sort with a locale-aware collator so "app" and "AA Tech" land where
  // a human expects.
  return rows
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export interface ClientWithCount extends Client {
  /** Tasks whose Client Name (tasks.title) matches this client, case-insensitive. */
  taskCount: number;
}

/**
 * Every client (active + inactive) plus a count of tasks filed under it.
 * Used by the /admin/clients management table. Sorted alphabetically to
 * match how the picker presents them.
 */
export async function listClientsWithCounts(): Promise<ClientWithCount[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      isActive: clients.isActive,
      sortOrder: clients.sortOrder,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      taskCount: sql<number>`count(${tasks.id})::int`,
    })
    .from(clients)
    .leftJoin(tasks, sql`lower(${tasks.title}) = lower(${clients.name})`)
    .groupBy(clients.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
