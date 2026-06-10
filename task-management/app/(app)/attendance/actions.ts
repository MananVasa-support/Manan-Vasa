"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * Record today's check-in or check-out. "Today" is the calendar day in the
 * employee's own timezone. One punch per kind per day — a duplicate returns
 * a friendly error instead of silently rewriting the log.
 */
export async function punchAttendance(input: {
  kind: "in" | "out";
  note?: string;
}): Promise<ActionResult<{ date: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = PunchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const today = localDateString(me.timezone || "Asia/Kolkata");

  try {
    await db.insert(attendanceLogs).values({
      employeeId: me.id,
      logDate: today,
      kind: parsed.data.kind,
      note: parsed.data.note ? parsed.data.note : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("attendance_logs_employee_day_kind_uq")) {
      return {
        ok: false,
        error:
          parsed.data.kind === "in"
            ? "You already checked in today."
            : "You already checked out today.",
      };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/attendance");
  return { ok: true, date: today };
}
