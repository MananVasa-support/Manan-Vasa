import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import { DEPARTMENTS, type Department } from "@/db/enums";

/**
 * Resolve the toolbar's Team filter to a concrete set of employee ids.
 *
 * Two shapes, both arriving as the `team` URL param:
 *   • "mine"        — the viewer PLUS everyone below them in the org chart, at
 *                     any depth. Not just direct reports: a manager asking for
 *                     "my team" means the whole branch, and stopping at depth 1
 *                     would silently hide the work of anyone reporting to a lead.
 *   • a department  — everyone in that department, via the same membership join
 *                     the existing `dept` filter uses, so the two agree.
 *
 * Returns `null` when the value is unrecognised or the viewer is unknown —
 * callers treat that as "no team scoping" rather than "match nothing", so a
 * stale bookmark degrades to the unfiltered list instead of an empty screen.
 */
export async function resolveTeamScope(
  team: string | null,
  viewerId: string | null,
): Promise<string[] | null> {
  if (!team) return null;

  if (team === "mine") {
    if (!viewerId) return null;
    return descendantsIncluding(viewerId);
  }

  if ((DEPARTMENTS as readonly string[]).includes(team)) {
    const ids = await employeeIdsInDepartments([team as Department]);
    // An empty department is a real answer — return the empty array so the
    // caller shows "no tasks", not the whole org.
    return ids;
  }

  return null;
}

/**
 * `rootId` plus every active employee beneath it, at any depth.
 *
 * One scan of the active org, then an in-memory walk: the tree is a few dozen
 * rows, and a recursive CTE for that is more machinery than the problem needs.
 * The `seen` guard makes a cyclic manager_id terminate — nothing in the schema
 * forbids A→B→A, and a cycle here would otherwise hang the request.
 */
async function descendantsIncluding(rootId: string): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id, managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.isActive, true));

  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.managerId) continue;
    const list = childrenOf.get(r.managerId) ?? [];
    list.push(r.id);
    childrenOf.set(r.managerId, list);
  }

  const out = new Set<string>([rootId]);
  const queue = [...(childrenOf.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return [...out];
}
