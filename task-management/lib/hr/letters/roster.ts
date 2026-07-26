import "server-only";
import { eq, sql, desc } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { employees, designations, candidateIntake } from "@/db/schema";

/** A recipient the letter editor can optionally attach a letter to (for filing +
 *  e-sign). Employee letters resolve their signer from this; candidate letters
 *  need none (the recipient name is a red field on the letter). */
export interface LetterRosterEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
}

/**
 * Active roster (name, email, department, designation) for the optional
 * "attach to employee" picker on the letter page. Query-light + read-only —
 * never touches the dashboard load path.
 */
export async function loadLetterRoster(): Promise<LetterRosterEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    department: r.department ?? "",
    designation: r.designation ?? "",
  }));
}

/** A submitted candidate the letter editor can quick-pick to seed the recipient
 *  name AND resolve gendered pronouns (his/her, Mr./Ms., …) from their intake. */
export interface LetterCandidateOption {
  id: string;
  name: string;
  /** Raw stored gender ("Male" | "Female" | "Prefer not to say" | ""). */
  gender: string;
}

/**
 * Submitted candidate intakes (name + stored gender) for the "Candidate" quick-
 * pick on the letter page. Picking one seeds the recipient-name field and sets
 * the pronoun gender via normalizeGender. Read-only, query-light — never touches
 * the dashboard load path. Reads name/gender from the intake `data` JSON
 * (personal.fullName / personal.gender).
 */
export async function loadLetterCandidates(): Promise<LetterCandidateOption[]> {
  // Every entered candidate (not just submitted ones) so the "Candidate" quick-
  // pick is available whenever there's someone to send a letter to — picking one
  // auto-fills the recipient name + gender (→ Mr./Ms.) from their intake form.
  const rows = await db
    .select({ id: candidateIntake.id, data: candidateIntake.data })
    .from(candidateIntake)
    .orderBy(desc(candidateIntake.updatedAt))
    .limit(300);

  return rows
    .map((r) => {
      const d = (r.data ?? {}) as Record<string, string>;
      return {
        id: r.id,
        name: (d["personal.fullName"] ?? "").trim(),
        gender: (d["personal.gender"] ?? "").trim(),
      };
    })
    .filter((c) => c.name.length > 0);
}

/** Format a date the way letters read: "25 July 2026". */
export function letterDate(d: Date = new Date()): string {
  return format(d, "d MMMM yyyy");
}
