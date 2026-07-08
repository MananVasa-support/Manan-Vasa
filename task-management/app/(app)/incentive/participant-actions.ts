"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveEntries, incentiveParticipants, incentiveProjects } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  getSplitView,
  type IncentiveParticipantRow,
  type IncentiveSplitView,
} from "@/lib/queries/incentive-participants";
import { splitOverflowError } from "@/lib/incentive/split-cap";

/**
 * WS-4 Phase B3 — server actions for the N-participant incentive split editor.
 * Adds / edits / removes `incentive_participants` rows attached to an incentive
 * ENTRY (permanent) XOR PROJECT, each carrying that person's own booked / accrued
 * / paid share. The hard invariant enforced on every write:
 *
 *     Σ participants[basis]  ≤  parent.owed[basis]      for basis ∈ {booked, accrued, paid}
 *
 * i.e. a split can never allocate more than the parent incentive is owed on any
 * basis. Because `getIncentivePaidByPerson` (the FROZEN PAID producer) already
 * lets participant rows REPLACE the parent's own legs, keeping this invariant
 * means the split can never inflate the PAID number PMS/salary read.
 *
 * KILL-SWITCH: `INCENTIVE_SPLIT_OFF=1` makes every mutating action a no-op error
 * (reads/editor still render). Number-changing behaviour (participant rows feeding
 * the PAID producer) only exists once rows are written, so the switch fully
 * neutralises this slice. Fail-open convention: unset/anything-but-"1" = ON.
 */

const KILL = process.env.INCENTIVE_SPLIT_OFF === "1";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const money = z.number().finite().min(0).max(1_000_000_000);
const money2 = (n: number): string => n.toFixed(2);

const dateStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .nullable()
  .optional();

/** Which parent a participant hangs off — exactly one of entryId / projectId. */
const ParentRef = z
  .object({
    parentKind: z.enum(["entry", "project"]),
    parentId: z.string().uuid(),
  })
  .strict();

const ParticipantShape = {
  empName: z.string().trim().min(1, "Participant name is required").max(160),
  employeeId: z.string().uuid().nullable().optional(),
  bookedAmt: money.default(0),
  accruedAmt: money.default(0),
  paidAmt: money.default(0),
  paidDate: dateStr,
  note: z.string().trim().max(2000).nullable().optional(),
};

const AddSchema = z.object({ ...ParentRef.shape, ...ParticipantShape }).strict();
const EditSchema = z.object({ id: z.string().uuid(), ...ParticipantShape }).strict();
const RemoveSchema = z.object({ id: z.string().uuid() }).strict();

export type IncentiveParticipantInput = z.input<typeof AddSchema>;

function killed<T = unknown>(): ActionResult<T> {
  return { ok: false, error: "The incentive split editor is disabled (INCENTIVE_SPLIT_OFF)." };
}

/**
 * Resolve a parent's owed caps + its current participant rows, EXCLUDING one
 * participant id (so an edit compares against its siblings, not its old self).
 */
async function loadCaps(
  parent: { kind: "entry" | "project"; id: string },
  excludeId: string | null,
): Promise<{ view: IncentiveSplitView; others: IncentiveParticipantRow[] } | null> {
  const view = await getSplitView(parent.kind, parent.id);
  if (!view) return null;
  const others = excludeId
    ? view.participants.filter((p) => p.id !== excludeId)
    : view.participants;
  return { view, others };
}

/** Verify Σ(others + incoming) ≤ owed on every basis; returns an error message or null. */
function overflowError(
  owed: { booked: number; accrued: number; paid: number },
  others: IncentiveParticipantRow[],
  incoming: { bookedAmt: number; accruedAmt: number; paidAmt: number },
): string | null {
  return splitOverflowError(owed, others, incoming);
}

/** Read a parent's period_month so a new participant mirrors it (period contract). */
async function parentPeriodMonth(
  kind: "entry" | "project",
  id: string,
): Promise<string | null> {
  if (kind === "entry") {
    const [e] = await db
      .select({ periodMonth: incentiveEntries.periodMonth })
      .from(incentiveEntries)
      .where(eq(incentiveEntries.id, id));
    return e?.periodMonth ?? null;
  }
  const [pr] = await db
    .select({ periodMonth: incentiveProjects.periodMonth })
    .from(incentiveProjects)
    .where(eq(incentiveProjects.id, id));
  return pr?.periodMonth ?? null;
}

// --- add -------------------------------------------------------------------

/** Add one participant row to an entry XOR project. Admin-only, cap-enforced. */
export async function addIncentiveParticipant(
  input: IncentiveParticipantInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  if (KILL) return killed();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const caps = await loadCaps({ kind: v.parentKind, id: v.parentId }, null);
  if (!caps) return { ok: false, error: "Parent incentive not found." };

  const err = overflowError(caps.view.parent.owed, caps.others, {
    bookedAmt: v.bookedAmt,
    accruedAmt: v.accruedAmt,
    paidAmt: v.paidAmt,
  });
  if (err) return { ok: false, error: err };

  const periodMonth = await parentPeriodMonth(v.parentKind, v.parentId);

  const [row] = await db
    .insert(incentiveParticipants)
    .values({
      entryId: v.parentKind === "entry" ? v.parentId : null,
      projectId: v.parentKind === "project" ? v.parentId : null,
      periodMonth,
      empName: v.empName,
      employeeId: v.employeeId ?? null,
      bookedAmt: money2(v.bookedAmt),
      accruedAmt: money2(v.accruedAmt),
      paidAmt: money2(v.paidAmt),
      paidDate: v.paidDate ?? null,
      note: v.note ?? null,
    })
    .returning({ id: incentiveParticipants.id });

  revalidatePath("/incentive");
  return { ok: true, id: row!.id };
}

// --- edit ------------------------------------------------------------------

/** Edit one participant row's shares. Admin-only, cap-enforced vs its siblings. */
export async function updateIncentiveParticipant(
  input: z.input<typeof EditSchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (KILL) return killed();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  // Resolve which parent this row hangs off, then cap-check against siblings.
  const [existing] = await db
    .select({
      entryId: incentiveParticipants.entryId,
      projectId: incentiveParticipants.projectId,
    })
    .from(incentiveParticipants)
    .where(eq(incentiveParticipants.id, v.id));
  if (!existing) return { ok: false, error: "Participant not found." };

  const parent = existing.entryId
    ? ({ kind: "entry", id: existing.entryId } as const)
    : existing.projectId
      ? ({ kind: "project", id: existing.projectId } as const)
      : null;
  if (!parent) return { ok: false, error: "Participant is not attached to a parent." };

  const caps = await loadCaps(parent, v.id);
  if (!caps) return { ok: false, error: "Parent incentive not found." };

  const err = overflowError(caps.view.parent.owed, caps.others, {
    bookedAmt: v.bookedAmt,
    accruedAmt: v.accruedAmt,
    paidAmt: v.paidAmt,
  });
  if (err) return { ok: false, error: err };

  await db
    .update(incentiveParticipants)
    .set({
      empName: v.empName,
      employeeId: v.employeeId ?? null,
      bookedAmt: money2(v.bookedAmt),
      accruedAmt: money2(v.accruedAmt),
      paidAmt: money2(v.paidAmt),
      paidDate: v.paidDate ?? null,
      note: v.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(incentiveParticipants.id, v.id));

  revalidatePath("/incentive");
  return { ok: true };
}

// --- remove ----------------------------------------------------------------

/** Remove one participant row. Admin-only. */
export async function removeIncentiveParticipant(
  input: z.input<typeof RemoveSchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (KILL) return killed();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  await db.delete(incentiveParticipants).where(eq(incentiveParticipants.id, parsed.data.id));
  revalidatePath("/incentive");
  return { ok: true };
}

// --- read (admin; drives the editor dialog) --------------------------------

/**
 * Fetch the full split view for a parent (owed caps + current participants +
 * live totals). Admin-only. Returns ok:false when the parent id is unknown.
 */
export async function getIncentiveSplit(
  input: { parentKind: "entry" | "project"; parentId: string },
): Promise<ActionResult<{ view: IncentiveSplitView; killed: boolean }>> {
  await requireAdmin();

  const parsed = ParentRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid parent" };

  const view = await getSplitView(parsed.data.parentKind, parsed.data.parentId);
  if (!view) return { ok: false, error: "Parent incentive not found." };
  return { ok: true, view, killed: KILL };
}

/** Whether the split editor is disabled (for the UI to show a banner). */
export async function isIncentiveSplitOff(): Promise<boolean> {
  await requireAdmin();
  return KILL;
}
