"use server";

import { revalidatePath } from "next/cache";
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcMaterials, tcWatchProgress, type Employee } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager, type TcLookupOption } from "@/lib/queries/training";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  CreateMaterialSchema,
  UpdateMaterialSchema,
  AddTcLookupSchema,
  DeleteTcLookupSchema,
  type TcLookupKind,
} from "@/lib/validators/training";

const PATH = "/training";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Validated kind → table name (kind is enum-checked first, so this is a fixed
// literal — the sql.raw identifier below is injection-safe).
const TC_LOOKUP_TABLE: Record<TcLookupKind, string> = {
  subject: "tc_subjects",
  service: "tc_services",
};

/** Training authoring/review is for managers (have a downline), admins, supers. */
async function requireTrainingManager(): Promise<Employee> {
  const me = await requireWorkspace("training");
  const allowed = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!allowed) throw new Error("Managers only");
  return me;
}

export async function createMaterial(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(tcMaterials)
      .values({
        subjectId: d.subjectId,
        los: d.los,
        filePath: d.filePath,
        fileName: d.fileName,
        fileType: d.fileType,
        videoUrl: d.videoUrl,
        notes: d.notes,
        version: d.version,
        versionNotes: d.versionNotes,
        createdByIds: d.createdByIds,
        assistedByIds: d.assistedByIds,
        partOfInduction: d.partOfInduction,
        inductionDeptIds: d.partOfInduction ? d.inductionDeptIds : [],
        createdById: me.id,
      })
      .returning({ id: tcMaterials.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateMaterial(input: unknown): Promise<Result<{ id: string }>> {
  await requireTrainingManager();
  const parsed = UpdateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;
  try {
    await db
      .update(tcMaterials)
      .set({
        subjectId: d.subjectId,
        los: d.los,
        filePath: d.filePath,
        fileName: d.fileName,
        fileType: d.fileType,
        videoUrl: d.videoUrl,
        notes: d.notes,
        version: d.version,
        versionNotes: d.versionNotes,
        createdByIds: d.createdByIds,
        assistedByIds: d.assistedByIds,
        partOfInduction: d.partOfInduction,
        inductionDeptIds: d.partOfInduction ? d.inductionDeptIds : [],
        updatedAt: new Date(),
      })
      .where(eq(tcMaterials.id, d.id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${d.id}`);
    return { ok: true, id: d.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Record that the current employee watched a material (idempotent). */
export async function markWatched(materialId: string): Promise<Result> {
  const me = await requireWorkspace("training");
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return { ok: false, error: "Invalid material." };
  try {
    await db
      .insert(tcWatchProgress)
      .values({ materialId, employeeId: me.id })
      .onConflictDoNothing({
        target: [tcWatchProgress.materialId, tcWatchProgress.employeeId],
      });
    revalidatePath(`${PATH}/${materialId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add an option to a managed Training dropdown (subject / service). */
export async function addTcLookup(
  kind: TcLookupKind,
  name: string,
): Promise<Result<{ option: TcLookupOption }>> {
  await requireTrainingManager();
  const parsed = AddTcLookupSchema.safeParse({ kind, name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  }
  const ident = sql.raw(`"${TC_LOOKUP_TABLE[parsed.data.kind]}"`);
  const value = parsed.data.name;
  try {
    const existing = (await db.execute(
      sql`SELECT id, name, is_active FROM ${ident} WHERE lower(name) = lower(${value}) LIMIT 1`,
    )) as unknown as Array<{ id: string; name: string; is_active: boolean }>;
    if (existing[0]) {
      if (!existing[0].is_active) {
        await db.execute(sql`UPDATE ${ident} SET is_active = true, updated_at = now() WHERE id = ${existing[0].id}`);
      }
      revalidatePath(PATH);
      return { ok: true, option: { id: existing[0].id, name: existing[0].name } };
    }
    const inserted = (await db.execute(
      sql`INSERT INTO ${ident} (name) VALUES (${value}) RETURNING id, name`,
    )) as unknown as Array<{ id: string; name: string }>;
    revalidatePath(PATH);
    return { ok: true, option: { id: inserted[0]!.id, name: inserted[0]!.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function softDeleteTcLookup(kind: TcLookupKind, id: string): Promise<Result> {
  await requireTrainingManager();
  const parsed = DeleteTcLookupSchema.safeParse({ kind, id });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const ident = sql.raw(`"${TC_LOOKUP_TABLE[parsed.data.kind]}"`);
  try {
    await db.execute(sql`UPDATE ${ident} SET is_active = false, updated_at = now() WHERE id = ${parsed.data.id}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
