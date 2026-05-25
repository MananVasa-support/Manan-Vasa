import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjects, tasks, type Subject } from "@/db/schema";

/**
 * Active subject names, locale-sorted. Drives the "Subject" picker on the
 * New Task / Edit Task forms.
 */
export async function listActiveSubjectNames(): Promise<string[]> {
  const rows = await db
    .select({ name: subjects.name })
    .from(subjects)
    .where(eq(subjects.isActive, true))
    .orderBy(asc(subjects.name));
  return rows
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export interface SubjectWithCount extends Subject {
  /** Tasks whose subject matches this row, case-insensitive. */
  taskCount: number;
}

/** Every subject (active + inactive) + a count of tasks filed under it. */
export async function listSubjectsWithCounts(): Promise<SubjectWithCount[]> {
  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      isActive: subjects.isActive,
      sortOrder: subjects.sortOrder,
      createdAt: subjects.createdAt,
      updatedAt: subjects.updatedAt,
      taskCount: sql<number>`count(${tasks.id})::int`,
    })
    .from(subjects)
    .leftJoin(tasks, sql`lower(${tasks.subject}) = lower(${subjects.name})`)
    .groupBy(subjects.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
