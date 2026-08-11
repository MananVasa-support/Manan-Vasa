import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { hrFormSubmissions } from "./schema";
import { hrSectionLabel } from "./registry";
import { canViewHrSubmission } from "./access";
import { formatDate } from "@/lib/format";
import type { FormPdfInput } from "./pdf";

/**
 * Load one submission AND authorise it in a single call.
 *
 * The PDF route and the email route both need exactly this — fetch the row,
 * check the caller may see it, shape it for rendering. Splitting those three
 * steps across two routes is how one of them eventually ships without the
 * middle one. Returning a discriminated result keeps the check impossible to
 * forget: there is no way to reach `data` without having passed `allowed`.
 */
export type LoadResult =
  | { ok: true; data: FormPdfInput & { id: string; employeeEmail: string | null; employeeName: string } }
  | { ok: false; status: 404 | 403 };

export async function loadAuthorisedSubmission(id: string): Promise<LoadResult> {
  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      responses: hrFormSubmissions.responses,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
      employeeId: hrFormSubmissions.employeeId,
      employeeName: employees.name,
      employeeEmail: employees.email,
    })
    .from(hrFormSubmissions)
    .innerJoin(employees, eq(hrFormSubmissions.employeeId, employees.id))
    .where(eq(hrFormSubmissions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, status: 404 };

  const access = await canViewHrSubmission(row.employeeId);
  // 404 rather than 403: confirming that someone else's submission exists is
  // itself a leak, and the caller has no legitimate use for the distinction.
  if (!access.allowed) return { ok: false, status: 404 };

  return {
    ok: true,
    data: {
      id: row.id,
      formName: row.formName,
      sectionLabel: hrSectionLabel(row.section),
      employeeName: row.employeeName,
      employeeEmail: row.employeeEmail,
      submittedOn: row.submittedAt ? formatDate(row.submittedAt) : formatDate(row.updatedAt),
      status: row.status,
      responses: row.responses ?? [],
    },
  };
}

/** `Exit Interview — Jane Doe.pdf`, with characters a Content-Disposition
 *  header (or a filesystem) would choke on stripped out. */
export function submissionFilename(formName: string, employeeName: string): string {
  const safe = `${formName} - ${employeeName}`.replace(/[^\w\s.-]+/g, "").trim();
  return `${safe || "filled-form"}.pdf`;
}
