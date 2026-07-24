import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, designations } from "@/db/schema";
import { formatMergeDate } from "@/lib/hr-docs/merge";

/** Roster row the letter compose needs (matches LetterCompose's ComposeEmployee). */
export interface HrRosterEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  reportingManager: string;
  joiningDate: string;
}

/**
 * Active roster with the fields the letter compose needs (designation joined,
 * reporting-manager name resolved). Used by the letter stations + letter library.
 */
export async function loadHrRoster(): Promise<HrRosterEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      joinedAt: employees.joinedAt,
      designation: designations.name,
      managerId: employees.managerId,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`);

  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    department: r.department ?? "",
    designation: r.designation ?? "",
    reportingManager: r.managerId ? nameById.get(r.managerId) ?? "" : "",
    joiningDate: formatMergeDate(r.joinedAt),
  }));
}
