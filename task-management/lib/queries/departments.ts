import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { departments, employees, type Department } from "@/db/schema";

/**
 * Every department, ordered by sort_order then name. Includes inactive
 * rows because the admin page needs to render them; pickers should
 * filter on `.isActive` themselves.
 */
export async function listDepartments(): Promise<Department[]> {
  return db
    .select()
    .from(departments)
    .orderBy(asc(departments.sortOrder), asc(departments.name));
}

/**
 * Departments + employee count. Used by /admin/departments to show
 * "N employees" alongside each row.
 */
export interface DepartmentWithCount extends Department {
  employeeCount: number;
}

export async function listDepartmentsWithCounts(): Promise<DepartmentWithCount[]> {
  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      isActive: departments.isActive,
      sortOrder: departments.sortOrder,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
      employeeCount: sql<number>`count(${employees.id})::int`,
    })
    .from(departments)
    .leftJoin(employees, eq(employees.departmentId, departments.id))
    .groupBy(departments.id)
    .orderBy(asc(departments.sortOrder), asc(departments.name));
  return rows;
}

/**
 * Just active departments, used by employee pickers (invite + edit).
 */
export async function listActiveDepartments(): Promise<Department[]> {
  return db
    .select()
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.sortOrder), asc(departments.name));
}
