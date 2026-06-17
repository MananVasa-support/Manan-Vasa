import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";
import { withSlowQueryLog } from "./slow-query";

// Cache the postgres client on globalThis so Next.js HMR doesn't leak
// connections on every save. In production this just runs once.
const globalForDb = globalThis as unknown as {
  __pg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pg ??
  postgres(env.DATABASE_URL, {
    // Required for Supabase's pgbouncer (transaction-mode pooler):
    // prepared statements are per-session and break under txn pooling.
    prepare: false,
    // The Postgres instance's REAL ceiling is max_connections=60 (measured),
    // NOT ~200 — Supabase reserves some, leaving ~45 usable. On Vercel each
    // warm function instance holds its own pool, so a high per-instance `max`
    // exhausts the DB under load (e.g. the morning attendance rush): ~4
    // instances × 18 = 72 > 60 → "couldn't get a connection" timeouts. Keep
    // the per-instance pool small so many instances coexist; the dashboard's
    // ~15-20 concurrent reads still parallelise 8-wide (2-3 quick waves). The
    // durable cure for the slow cold scans is indexing those queries, not a
    // bigger pool.
    // INCIDENT 2026-06-17: authed pages (/myday, /kanban, dashboard) were
    // throwing "that didn't go through" under concurrent load — the queries
    // themselves are fast (<200ms on ~800 rows), so this is connection
    // exhaustion: too many Vercel instances each opening connections blow past
    // the DB's 60 ceiling, and the overflow connect attempts hit connect_timeout
    // and throw. With Fluid Compute reusing instances, a small per-instance pool
    // keeps total connections under 60 (queries just queue a touch instead of
    // failing). max 8→4: even ~12 warm instances (48) stay under the ceiling.
    // THE durable fix is raising Supabase's connection limit (compute size /
    // pooler settings) — pool tuning alone can't fully square Fluid concurrency
    // against a 60-conn DB.
    max: 4,
    // Release idle connections fast so a burst from one route doesn't park
    // reservations another instance then can't get. (Was 60s.)
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pg = client;
}

// Phase 0.1 — opt-in slow-query logger. Enable in any environment by
// setting SLOW_QUERY_MS (e.g. "300"). Disabled by default so production
// stays quiet until we deliberately turn it on. NODE_ENV=development
// auto-enables at 300ms so local clicks immediately surface hotspots.
const slowEnvVar = process.env.SLOW_QUERY_MS;
const slowMs = slowEnvVar
  ? Number(slowEnvVar)
  : process.env.NODE_ENV === "development"
    ? 300
    : NaN;
const tracedClient = Number.isFinite(slowMs) ? withSlowQueryLog(client, slowMs) : client;

export const db = drizzle(tracedClient, { schema });
export * from "@/db/schema";
export type { Employee, NewEmployee, Task, NewTask } from "@/db/schema";
