import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcSubjects,
  tcServices,
  tcMaterials,
  tcWatchProgress,
  employees,
  departments,
} from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export interface TcLookupOption {
  id: string;
  name: string;
}

/** Is this employee a manager — i.e. does anyone report to them? Managers (and
 *  admins/super-admins) get Training authoring + review capabilities. */
export async function isManager(employeeId: string): Promise<boolean> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.managerId, employeeId), eq(employees.isActive, true)));
  return (rows[0]?.n ?? 0) > 0;
}

export async function listTcSubjects(): Promise<TcLookupOption[]> {
  return db
    .select({ id: tcSubjects.id, name: tcSubjects.name })
    .from(tcSubjects)
    .where(eq(tcSubjects.isActive, true))
    .orderBy(asc(tcSubjects.sortOrder), asc(tcSubjects.name));
}

export async function listDepartmentOptions(): Promise<{ value: string; label: string }[]> {
  const rows = await db
    .select({ value: departments.id, label: departments.name })
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.name));
  return rows;
}

export async function listTcServices(): Promise<TcLookupOption[]> {
  return db
    .select({ id: tcServices.id, name: tcServices.name })
    .from(tcServices)
    .where(eq(tcServices.isActive, true))
    .orderBy(asc(tcServices.sortOrder), asc(tcServices.name));
}

export interface TcMaterialRow {
  id: string;
  addedOn: string;
  subject: string | null;
  los: string | null;
  fileName: string | null;
  fileType: string | null;
  hasFile: boolean;
  videoUrl: string | null;
  version: string | null;
  partOfInduction: boolean;
  createdByIds: string[];
  watchedByMe: boolean;
}

/** The material library, newest first, with the viewer's watched flag. */
export async function listMaterials(viewerId: string): Promise<TcMaterialRow[]> {
  const rows = await db
    .select({
      id: tcMaterials.id,
      addedOn: tcMaterials.addedOn,
      subject: tcSubjects.name,
      los: tcMaterials.los,
      fileName: tcMaterials.fileName,
      fileType: tcMaterials.fileType,
      filePath: tcMaterials.filePath,
      videoUrl: tcMaterials.videoUrl,
      version: tcMaterials.version,
      partOfInduction: tcMaterials.partOfInduction,
      createdByIds: tcMaterials.createdByIds,
      watchedAt: tcWatchProgress.watchedAt,
    })
    .from(tcMaterials)
    .leftJoin(tcSubjects, eq(tcSubjects.id, tcMaterials.subjectId))
    .leftJoin(
      tcWatchProgress,
      and(
        eq(tcWatchProgress.materialId, tcMaterials.id),
        eq(tcWatchProgress.employeeId, viewerId),
      ),
    )
    .orderBy(desc(tcMaterials.createdAt));

  return rows.map((r) => ({
    id: r.id,
    addedOn: r.addedOn,
    subject: r.subject,
    los: r.los,
    fileName: r.fileName,
    fileType: r.fileType,
    hasFile: !!r.filePath,
    videoUrl: r.videoUrl,
    version: r.version,
    partOfInduction: r.partOfInduction,
    createdByIds: r.createdByIds ?? [],
    watchedByMe: !!r.watchedAt,
  }));
}

export interface TcMaterialDetail {
  id: string;
  addedOn: string;
  subjectId: string | null;
  subject: string | null;
  los: string | null;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null; // fresh signed URL
  videoUrl: string | null;
  notes: string | null;
  version: string | null;
  versionNotes: string | null;
  createdByIds: string[];
  assistedByIds: string[];
  partOfInduction: boolean;
  inductionDeptIds: string[];
  watchedByMe: boolean;
}

/** Full material for the viewer page (incl. a fresh signed URL for the file). */
export async function getMaterial(
  id: string,
  viewerId: string,
): Promise<TcMaterialDetail | null> {
  const [m] = await db
    .select()
    .from(tcMaterials)
    .where(eq(tcMaterials.id, id))
    .limit(1);
  if (!m) return null;

  const [subj] = m.subjectId
    ? await db.select({ name: tcSubjects.name }).from(tcSubjects).where(eq(tcSubjects.id, m.subjectId)).limit(1)
    : [undefined];

  const [watch] = await db
    .select({ at: tcWatchProgress.watchedAt })
    .from(tcWatchProgress)
    .where(and(eq(tcWatchProgress.materialId, id), eq(tcWatchProgress.employeeId, viewerId)))
    .limit(1);

  let fileUrl: string | null = null;
  if (m.filePath) {
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrl(m.filePath, 3600);
      fileUrl = data?.signedUrl ?? null;
    } catch {
      fileUrl = null;
    }
  }

  return {
    id: m.id,
    addedOn: m.addedOn,
    subjectId: m.subjectId,
    subject: subj?.name ?? null,
    los: m.los,
    fileName: m.fileName,
    fileType: m.fileType,
    fileUrl,
    videoUrl: m.videoUrl,
    notes: m.notes,
    version: m.version,
    versionNotes: m.versionNotes,
    createdByIds: m.createdByIds ?? [],
    assistedByIds: m.assistedByIds ?? [],
    partOfInduction: m.partOfInduction,
    inductionDeptIds: m.inductionDeptIds ?? [],
    watchedByMe: !!watch,
  };
}
