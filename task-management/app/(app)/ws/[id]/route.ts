import { NextResponse, type NextRequest } from "next/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_LANDING,
  isWorkspaceId,
  canAccessWorkspace,
} from "@/lib/workspaces";
import { getCurrentEmployee } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * Enter a workspace from the hub.
 *
 * Remembers the chosen room in the `aw` cookie (so the top nav can show ONLY
 * that workspace's modules), then redirects to the workspace's landing page.
 * Unknown ids — or a room the user isn't allowed into (department-restricted,
 * e.g. Sales) — bounce back to the hub. Auth is already enforced upstream by
 * the middleware.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  const me = await getCurrentEmployee();
  const allowed =
    !!me &&
    canAccessWorkspace(id, {
      department: me.department,
      isSuperAdmin: isSuperAdmin(me.email),
    });
  if (!allowed) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  const res = NextResponse.redirect(new URL(WORKSPACE_LANDING[id], req.url));
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days — sticks across sessions
  });
  return res;
}
