/**
 * Phase B — the consumer registry. Every projection / command consumer the
 * relay drives is listed here. Each has its own independent cursor, so adding a
 * new consumer (or a new engine's projection) is a one-line registration — it
 * begins at seq 0 and catches up from the full history on its next run (Law 4).
 */
import type { Consumer } from "./relay";
import { taskMetricsConsumer } from "@/lib/projections/task-metrics";
import { commandDispatcherConsumer } from "@/lib/commands/dispatcher";

export const CONSUMERS: Consumer[] = [
  // Pure projection — no external effects, runs by default.
  taskMetricsConsumer,
  // Command channel — gated by COMMANDS_VIA_LEDGER (no-op until enabled, Law 8).
  commandDispatcherConsumer,
];
