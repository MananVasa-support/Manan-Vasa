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
    // We connect to the Supabase TRANSACTION pooler (Supavisor, port 6543), not
    // Postgres directly. Supavisor accepts many CLIENT connections but multiplexes
    // them onto a small SERVER pool — and on the Free plan that server pool is
    // only ≈15 slots. THAT 15-slot ceiling, not the 200-client limit, is the
    // binding constraint (confirmed by perf forensics 2026-06-20).
    //
    // INCIDENT 2026-06-17 (recurring): after a pooler bounce, warm Vercel
    // instances keep handing out dead connections. A query on a dead socket
    // neither resolves nor throws → authed pages stuck on "Loading…". The 18s
    // app timeout (lib/db/with-timeout.ts) then ABANDONS the query, which leaves
    // a `Client/ClientRead` orphan holding one of the ~15 server slots for ~2min.
    // A few orphans starve the pool → the next load can't get a healthy
    // connection → cascade. The forensics caught this live (render/stall/render).
    //
    // WHY max IS LOWERED 10→5: with max:10, just TWO warm instances can demand
    // 20 connections against the 15-slot pooler — guaranteeing starvation the
    // moment any orphan appears. The dashboard's ~12 queries are sub-millisecond,
    // so serializing them through 5 connections costs single-digit ms — a trivial
    // price for never oversubscribing the pooler. Pair this with raising the
    // Supabase pooler "Pool Size" (Database → Connection pooling) above 15.
    //   • max 10→5            — cannot oversubscribe the pooler; caps how many
    //                           connections one instance can orphan in a cascade.
    //   • max_lifetime 10m→5m — recycle so a connection orphaned by a pooler
    //                           bounce is dropped, not handed out dead later.
    //   • idle_timeout 10s    — idle conns close fast (anti-stale).
    // The DURABLE anti-hang layer is withRetry() in lib/db/with-timeout.ts: a
    // stale hit becomes a fast retry on a FRESH connection instead of an error
    // card. (postgres-js leaves the timed-out query's connection reserved, so the
    // retry deterministically picks a different/new connection.)
    //
    // NOTE on query timeouts: Supavisor silently ignores startup GUCs, so we do
    // NOT pass `connection: { statement_timeout }` (verified no-op). A role-level
    // statement_timeout (set via SQL) is the server-side backstop — see
    // docs/PERF_FORENSICS.md §8.
    max: 5,
    idle_timeout: 10,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    // Tag our connections so they're identifiable in pg_stat_activity when
    // diagnosing pooler slot usage (the orphan hunt in the forensics).
    connection: { application_name: "altus-wms" },
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
