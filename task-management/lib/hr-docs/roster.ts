import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, designations } from "@/db/schema";
import { formatMergeDate } from "@/lib/hr-docs/merge";
import type { HrDocEmployee } from "@/components/hr-docs/compose-dialog";

/**
 * Active roster with the fields the merge engine + letter preview need
 * (designation joined, reporting-manager name resolved). Shared by the Document
 * Hub and every per-letter station in the HR lifecycle stages.
 */
export async function loadHrRoster(): Promise<HrDocEmployee[]> {
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
