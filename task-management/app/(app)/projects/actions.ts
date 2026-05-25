"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectNodes } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const KIND = z.enum(["project", "milestone", "result"]);
const NameSchema = z.string().trim().min(1, "Name is required").max(160, "Name is too long");

const CreateSchema = z.object({
  name: NameSchema,
  kind: KIND,
  parentId: z.string().uuid().nullable().optional(),
});

const CHILD_OF: Record<string, "project" | "milestone" | null> = {
  project: null,
  milestone: "project",
  result: "milestone",
};

export async function createProjectNode(
  input: z.input<typeof CreateSchema>,
): Promise<Result<{ id: string }>> {
  const me = await requireUser();
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
  revalidatePath("/projects");
  return { ok: true, id: inserted.id };
}

export async function renameProjectNode(
  id: string,
  name: string,
): Promise<Result> {
  await requireUser();
  const parsedName = NameSchema.safeParse(name);
  if (!parsedName.success) {
    return { ok: false, error: parsedName.error.issues[0]?.message ?? "Invalid name" };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  await db
    .update(projectNodes)
    .set({ name: parsedName.data, updatedAt: new Date() })
    .where(eq(projectNodes.id, id));
  revalidatePath("/projects");
  return { ok: true };
}

export async function setProjectNodeArchived(
  id: string,
  isArchived: boolean,
): Promise<Result> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  await db
    .update(projectNodes)
    .set({ isArchived, updatedAt: new Date() })
    .where(eq(projectNodes.id, id));
  revalidatePath("/projects");
  return { ok: true };
}
