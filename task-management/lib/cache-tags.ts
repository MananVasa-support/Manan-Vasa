/**
 * Canonical cache-tag names for `unstable_cache` reads and the matching
 * `revalidateTag` calls in server actions. Centralising them so a typo
 * can't desync read-side cache key from write-side invalidation —
 * everything imports the same string constants.
 */
export const CACHE_TAGS = {
  /** Anything that reads the `tasks` table (board counts, nav badges, etc.). */
  tasks: "tasks",
  /** The active employee roster (slim picker payload). */
  employees: "employees",
  /** Distinct subjects pulled from tasks + the subjects admin table. */
  subjects: "subjects",
  /** Admin-managed status label/color overrides. */
  statusSettings: "status-settings",
  /** Client roster used by the task "Client Name" picker. */
  clients: "clients",
  /** Project tree nodes (Project / Milestone / Result / Action / Sub-Action). */
  projectNodes: "project-nodes",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
