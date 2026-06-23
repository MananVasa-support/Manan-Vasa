import "server-only";
import { redirect } from "next/navigation";
import type { Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canAccessWorkspace, type WorkspaceId } from "@/lib/workspaces";

/**
 * The inputs `canAccessWorkspace` needs, derived from an employee row. Single
 * source of truth — replaces the object that was hand-built in the (app) layout,
 * the hub, and the /ws route.
 */
export function accessFor(me: Employee) {
  return {
    department: me.department,
    isAdmin: me.isAdmin,
    isSuperAdmin: isSuperAdmin(me.email),
  };
}

/**
 * Require workspace access at the DATA layer — route handlers, server actions
 * and pages inside a restricted room (e.g. Sales). The (app) layout gate does
 * NOT run for route handlers or server actions, so each data surface must guard
 * itself or the room is only cosmetically restricted. Bounces to the hub if the
 * signed-in user can't enter. Returns the employee for chaining.
 */
export async function requireWorkspace(ws: WorkspaceId): Promise<Employee> {
  const me = await requireUser();
  if (!canAccessWorkspace(ws, accessFor(me))) {
    redirect("/hub");
  }
  return me;
}

/**
 * Like {@link requireWorkspace} but also requires admin — for management ops
 * inside a room (editing contracts, imports, write-offs in Sales). Super-admins
 * always pass. Throws "Forbidden" for a room member who isn't an admin.
 */
export async function requireWorkspaceAdmin(ws: WorkspaceId): Promise<Employee> {
  const me = await requireWorkspace(ws);
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    throw new Error("Forbidden");
  }
  return me;
}
