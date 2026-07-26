"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { exitRecords } from "@/lib/hr/exit/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const KINDS = ["interview", "handover"] as const;

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  kind: z.enum(KINDS),
  // The whole form payload. Cap the serialized size defensively (jsonb),
  // and keep it a plain object.
  data: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Create-or-update an exit record for an employee + form kind. Re-saving the
 * same record (by id) keeps one row; a first save creates it. Rate-limited and
 * HR-gated.
 */
export async function saveExitRecord(input: z.input<typeof SaveSchema>): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("hr");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  const v = parsed.data;

  // Guard against absurd payloads (keeps a rogue client from writing megabytes).
  if (JSON.stringify(v.data).length > 200_000) return { ok: false, error: "Form is too large to save." };

  try {
    if (v.id) {
      await db
        .update(exitRecords)
        .set({ data: v.data as Record<string, unknown>, employeeId: v.employeeId, kind: v.kind, updatedAt: new Date() })
        .where(eq(exitRecords.id, v.id));
      revalidatePath("/hr/exit");
      return { ok: true, id: v.id };
    }
    const [row] = await db
      .insert(exitRecords)
      .values({ employeeId: v.employeeId, kind: v.kind, data: v.data as Record<string, unknown>, createdById: me.id })
      .returning({ id: exitRecords.id });
    if (!row) return { ok: false, error: "Could not save the form." };
    revalidatePath("/hr/exit");
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export interface ExitRecordState {
  id: string;
  employeeId: string | null;
  kind: (typeof KINDS)[number];
  data: Record<string, unknown>;
  updatedAt: Date;
}

/**
 * Latest saved record for an employee + kind (so re-opening the form resumes
 * exactly where it was left). Returns null when nothing is saved yet.
 */
export async function getExitRecord(
  employeeId: string,
  kind: (typeof KINDS)[number],
): Promise<ExitRecordState | null> {
  await requireWorkspace("hr");
  if (!z.string().uuid().safeParse(employeeId).success) return null;
  if (!(KINDS as readonly string[]).includes(kind)) return null;
  const [r] = await db
    .select({
      id: exitRecords.id,
      employeeId: exitRecords.employeeId,
      kind: exitRecords.kind,
      data: exitRecords.data,
      updatedAt: exitRecords.updatedAt,
    })
    .from(exitRecords)
    .where(and(eq(exitRecords.employeeId, employeeId), eq(exitRecords.kind, kind)))
    .orderBy(desc(exitRecords.updatedAt))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employeeId,
    kind: r.kind as (typeof KINDS)[number],
    data: (r.data ?? {}) as Record<string, unknown>,
    updatedAt: r.updatedAt,
  };
}

export interface ExitRecordRow {
  id: string;
  employeeId: string | null;
  employeeName: string;
  kind: (typeof KINDS)[number];
  updatedAt: Date;
}

/** Recent exit submissions (both kinds) for the workspace history list. */
export async function listExitRecords(): Promise<ExitRecordRow[]> {
  await requireWorkspace("hr");
  const rows = await db
    .select({
      id: exitRecords.id,
      employeeId: exitRecords.employeeId,
      kind: exitRecords.kind,
      updatedAt: exitRecords.updatedAt,
      employeeName: employees.name,
    })
    .from(exitRecords)
    .leftJoin(employees, eq(exitRecords.employeeId, employees.id))
    .orderBy(desc(exitRecords.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName ?? "—",
    kind: r.kind as (typeof KINDS)[number],
    updatedAt: r.updatedAt,
  }));
}
