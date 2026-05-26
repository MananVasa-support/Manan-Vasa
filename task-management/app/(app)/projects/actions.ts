"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectNodes, type Employee, type ProjectNode } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Centralised tag/route invalidation for project-node writes. All three
 * actions below call this so the cached `listProjectNodeOptions` picker
 * payload drops on every change.
 */
function revalidateProjectSurfaces() {
  revalidatePath("/projects");
  updateTag(CACHE_TAGS.projectNodes);
}

/**
 * Phase 3.1 — load a project node + assert the caller is allowed to mutate
 * it (creator or admin). Prevents any authenticated user from renaming or
 * archiving another team-member's project just by guessing the UUID, which
 * the previous `requireUser()`-only check permitted. The `create` path
 * stays open: anyone can start a new project in a small-team setting.
 *
 * Returns a Result-shaped error so the caller can `return` it directly.
 */
async function authorizeProjectNodeMutation(
  id: string,
  me: Employee,
): Promise<{ ok: true; node: ProjectNode } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  const node = await db.query.projectNodes.findFirst({
    where: eq(projectNodes.id, id),
  });
  if (!node) return { ok: false, error: "Project node not found" };
  if (!me.isAdmin && node.createdById !== me.id) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, node };
}

const KIND = z.enum(["project", "milestone", "result", "action", "sub_action"]);
const NameSchema = z.string().trim().min(1, "Name is required").max(160, "Name is too long");

const CreateSchema = z.object({
  name: NameSchema,
  kind: KIND,
  parentId: z.string().uuid().nullable().optional(),
});

// Each kind's required parent kind (null = top-level).
const CHILD_OF: Record<string, string | null> = {
  project: null,
  milestone: "project",
  result: "milestone",
  action: "result",
  sub_action: "action",
};

export async function createProjectNode(
  input: z.input<typeof CreateSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, kind, parentId } = parsed.data;

  // Validate parent kind matches the hierarchy.
  const needsParent = CHILD_OF[kind];
  if (needsParent && !parentId) {
    return { ok: false, error: `A ${kind} needs a parent ${needsParent}.` };
  }
  if (!needsParent && parentId) {
    return { ok: false, error: "A project can't have a parent." };
  }
  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({
      where: eq(projectNodes.id, parentId),
    });
    if (!parent) return { ok: false, error: "Parent not found." };
    if (parent.kind !== needsParent) {
      return { ok: false, error: `A ${kind} must sit under a ${needsParent}.` };
    }
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(projectNodes)
      .values({ name, kind, parentId: parentId ?? null, createdById: me.id })
      .returning({ id: projectNodes.id });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };
  revalidateProjectSurfaces();
  return { ok: true, id: inserted.id };
}

export async function renameProjectNode(
  id: string,
  name: string,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false, error: parsedName.error.issues[0]?.message ?? "Invalid name" };
  }
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  // Belt-and-braces: scope the WHERE to the creator-or-admin so a
  // concurrent ownership transfer between the auth check and this UPDATE
  // can't bypass the gate. `.returning()` then verifies the row was touched.
  const updated = await db
    .update(projectNodes)
    .set({ name: parsedName.data, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) {
    // Should only happen if the row was deleted between auth check and now.
    return { ok: false, error: "Project node not found" };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}

export async function setProjectNodeArchived(
  id: string,
  isArchived: boolean,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeProjectNodeMutation(id, me);
  if (!auth.ok) return auth;
  const updated = await db
    .update(projectNodes)
    .set({ isArchived, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(projectNodes.id, id)
        : and(eq(projectNodes.id, id), eq(projectNodes.createdById, me.id)),
    )
    .returning({ id: projectNodes.id });
  if (updated.length === 0) {
    return { ok: false, error: "Project node not found" };
  }
  revalidateProjectSurfaces();
  return { ok: true };
}
