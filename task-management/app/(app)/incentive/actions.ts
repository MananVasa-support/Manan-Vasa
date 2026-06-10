"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveRequests } from "@/db/schema";
import { INCENTIVE_TYPES } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { validateIncentiveDetails } from "@/lib/incentive-fields";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const CreateSchema = z
  .object({
    type: z.enum(INCENTIVE_TYPES),
    details: z.record(z.string(), z.string()),
  })
  .strict();

/** File a new incentive request (any signed-in employee, for themselves). */
export async function createIncentiveRequest(input: {
  type: (typeof INCENTIVE_TYPES)[number];
  details: Record<string, string>;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const validated = validateIncentiveDetails(parsed.data.type, parsed.data.details);
  if (!validated.ok) return validated;

  let inserted;
  try {
    [inserted] = await db
      .insert(incentiveRequests)
      .values({
        employeeId: me.id,
        type: parsed.data.type,
        details: validated.details,
      })
      .returning({ id: incentiveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/incentive");
  return { ok: true, id: inserted.id };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    verdict: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Admin verdict on a pending request. Re-deciding an already-decided
 *  request is allowed (corrections) — the latest verdict wins. */
export async function decideIncentiveRequest(input: {
  id: string;
  verdict: "approved" | "rejected";
  note?: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.incentiveRequests.findFirst({
    where: eq(incentiveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Request not found" };

  try {
    await db
      .update(incentiveRequests)
      .set({
        status: parsed.data.verdict,
        decidedById: me.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ? parsed.data.note : null,
        updatedAt: new Date(),
      })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/incentive");
  return { ok: true };
}
