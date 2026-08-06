import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, employees } from "@/db/schema";

export interface PersonEmployee {
  id: string;
  name: string;
  email: string;
  officialEmail: string | null;
  personalEmail: string | null;
  emailProvisionedAt: Date | null;
  assetsAllocatedAt: Date | null;
  firebaseUid: string | null;
}

const EMP_COLS = {
  id: employees.id,
  name: employees.name,
  email: employees.email,
  officialEmail: employees.officialEmail,
  personalEmail: employees.personalEmail,
  emailProvisionedAt: employees.emailProvisionedAt,
  assetsAllocatedAt: employees.assetsAllocatedAt,
  firebaseUid: employees.firebaseUid,
} as const;

/**
 * Resolve an HR-Record "person id" to an employee. The HR Record list is now
 * EMPLOYEE-driven, so the id is normally an `employees.id` — matched first. A
 * legacy recruitment `candidate_intake.id` still resolves via the candidate's
 * email, so anything that passes a candidate id keeps working unchanged.
 */
export async function resolvePersonEmployee(id: string): Promise<PersonEmployee | null> {
  const [direct] = await db.select(EMP_COLS).from(employees).where(eq(employees.id, id)).limit(1);
  if (direct) return direct;

  const [cand] = await db
    .select({ email: candidateIntake.email })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, id))
    .limit(1);
  const email = (cand?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const [emp] = await db
    .select(EMP_COLS)
    .from(employees)
    .where(eq(sql`lower(${employees.email})`, email))
    .limit(1);
  return emp ?? null;
}
