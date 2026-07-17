"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { goals, weeklyGoals } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  loadWritableGoalRow,
  goalScopeFor,
  canManageGoalFor,
} from "@/lib/goals/scope";
import { setAdopted, generateChildren } from "@/lib/goals/cascade";
import { cloneForward, moveTo } from "@/lib/goals/carry";
import { quarterKeyOfMonthKey, fyStartYearOfMonthKey, fyStartYearOfKey } from "@/lib/goals/types";
import { GOAL_PERIODS } from "@/db/enums";

/* ------------------------------------------------------------------ */
/* Result shape + shared helpers                                       */
/* ------------------------------------------------------------------ */

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateGoals(...periodKeys: (string | null | undefined)[]) {
  revalidatePath("/goals/cascade");
  revalidatePath("/goals/review");
  for (const k of periodKeys) if (k) revalidatePath(`/goals/cascade/${k}`);
}

/** numeric(14,2) inputs arrive as number | string | "" — normalise to a 2-dp
 *  string or null so drizzle writes the money columns cleanly. */
function money(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** Next Sr. No. within an (employee, period, key) bucket. */
async function nextGoalPosition(
  employeeId: string,
  period: string,
  periodKey: string,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${goals.position}), 0)::int` })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.period, period),
        eq(goals.periodKey, periodKey),
      ),
    );
  return (row?.max ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Validators (Zod v4)                                                 */
/* ------------------------------------------------------------------ */

const MoneyIn = z.union([z.number(), z.string()]).nullish();
const TeamIn = z
  .array(z.object({ employeeId: z.string().optional(), name: z.string().optional() }))
  .max(40)
  .nullish();

const CATEGORY = z.enum(["target", "milestone", "operational", "goal"]);

const GoalFields = {
  area: z.string().max(160).nullish(),
  title: z.string().min(1, "Goal is required").max(400),
  category: CATEGORY.optional(),
  uom: z.string().max(80).nullish(),
  targetQty: MoneyIn,
  targetAmount: MoneyIn,
  actualQty: MoneyIn,
  actualAmount: MoneyIn,
  notes: z.string().max(4000).nullish(),
  teamInvolved: TeamIn,
  teamDependencyPct: z.number().int().min(0).max(100).nullish(),
  weight: z.number().int().min(0).max(1000).optional(),
};

const CreateGoalSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.enum(GOAL_PERIODS),
  periodKey: z.string().min(4).max(16),
  ...GoalFields,
});

const AddChildSchema = z.object({
  parentId: z.string().uuid(),
  /** The exact child bucket (quarter/month key) the extra child belongs to. */
  periodKey: z.string().min(4).max(16),
  ...GoalFields,
});

const EditGoalSchema = z.object({
  id: z.string().uuid(),
  ...GoalFields,
  title: GoalFields.title.optional(),
});

const SetPctSchema = z.object({
  id: z.string().uuid(),
  pctDone: z.number().int().min(0).max(100),
});

const AdoptSchema = z.object({ id: z.string().uuid(), adopted: z.boolean() });
const IdSchema = z.object({ id: z.string().uuid() });
const CarrySchema = z.object({
  id: z.string().uuid(),
  targetPeriodKey: z.string().min(4).max(16),
  retainProgress: z.boolean().optional(),
});

type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
type AddChildInput = z.infer<typeof AddChildSchema>;
type EditGoalInput = z.infer<typeof EditGoalSchema>;

/* ------------------------------------------------------------------ */
/* Create — standalone at any level (parent_goal_id = null)            */
/* ------------------------------------------------------------------ */

export async function createGoal(
  input: CreateGoalInput,
): Promise<ActionResult<{ id: string }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!canManageGoalFor(scope, d.employeeId)) {
    return { ok: false, error: "You can't add goals for that person" };
  }

  const position = await nextGoalPosition(d.employeeId, d.period, d.periodKey);
  const [row] = await db
    .insert(goals)
    .values({
      employeeId: d.employeeId,
      period: d.period,
      periodKey: d.periodKey,
      parentGoalId: null,
      position,
      area: d.area ?? null,
      title: d.title,
      uom: d.uom ?? null,
      targetQty: money(d.targetQty),
      targetAmount: money(d.targetAmount),
      actualQty: money(d.actualQty),
      actualAmount: money(d.actualAmount),
      notes: d.notes ?? null,
      teamInvolved: d.teamInvolved ?? null,
      teamDependencyPct: d.teamDependencyPct ?? null,
      weight: d.weight ?? 100,
      adopted: true,
      source: "manual",
      category: d.category ?? "goal",
      createdById: me.id,
      updatedById: me.id,
    })
    .returning({ id: goals.id });

  revalidateGoals(d.periodKey);
  return { ok: true, id: row!.id };
}

/* ------------------------------------------------------------------ */
/* Set a goal's category tag + its involved team (Kanban marking)      */
/* ------------------------------------------------------------------ */

export async function setGoalCategory(
  input: { id: string; category: z.infer<typeof CATEGORY> },
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid(), category: CATEGORY }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  await db
    .update(goals)
    .set({ category: parsed.data.category, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, parsed.data.id));
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}

export async function setGoalTeam(
  input: { id: string; team: Array<{ employeeId?: string; name?: string }> },
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z
    .object({
      id: z.string().uuid(),
      team: z.array(z.object({ employeeId: z.string().uuid().optional(), name: z.string().max(120).optional() })).max(40),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  await db
    .update(goals)
    .set({ teamInvolved: parsed.data.team, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, parsed.data.id));
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Add a child under a parent (§11b-G "+ Add child goal")              */
/* year → quarter child, quarter → month child. Month → week children  */
/* are generated via `generateGoalChildren` (they live on weekly_goals).*/
/* ------------------------------------------------------------------ */

export async function addChildGoal(
  input: AddChildInput,
): Promise<ActionResult<{ id: string }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddChildSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.parentId, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;
  const parent = loaded.row;

  const childPeriod =
    parent.period === "year" ? "quarter" : parent.period === "quarter" ? "month" : null;
  if (!childPeriod) {
    return {
      ok: false,
      error: "Add weekly goals from the month view — use “Generate weekly rows”.",
    };
  }

  const position = await nextGoalPosition(parent.employeeId, childPeriod, d.periodKey);
  const [row] = await db
    .insert(goals)
    .values({
      employeeId: parent.employeeId,
      period: childPeriod,
      periodKey: d.periodKey,
      parentGoalId: parent.id,
      position,
      area: d.area ?? parent.area,
      title: d.title,
      uom: d.uom ?? parent.uom,
      targetQty: money(d.targetQty),
      targetAmount: money(d.targetAmount),
      notes: d.notes ?? null,
      teamInvolved: d.teamInvolved ?? null,
      teamDependencyPct: d.teamDependencyPct ?? null,
      weight: d.weight ?? 100,
      adopted: true,
      source: "manual",
      createdById: me.id,
      updatedById: me.id,
    })
    .returning({ id: goals.id });

  revalidateGoals(d.periodKey, parent.periodKey);
  return { ok: true, id: row!.id };
}

/* ------------------------------------------------------------------ */
/* Edit fields                                                          */
/* ------------------------------------------------------------------ */

export async function editGoal(input: EditGoalInput): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EditGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const loaded = await loadWritableGoalRow(d.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  if (d.title !== undefined) patch.title = d.title;
  if (d.area !== undefined) patch.area = d.area ?? null;
  if (d.uom !== undefined) patch.uom = d.uom ?? null;
  if (d.targetQty !== undefined) patch.targetQty = money(d.targetQty);
  if (d.targetAmount !== undefined) patch.targetAmount = money(d.targetAmount);
  if (d.actualQty !== undefined) patch.actualQty = money(d.actualQty);
  if (d.actualAmount !== undefined) patch.actualAmount = money(d.actualAmount);
  if (d.notes !== undefined) patch.notes = d.notes ?? null;
  if (d.teamInvolved !== undefined) patch.teamInvolved = d.teamInvolved ?? null;
  if (d.teamDependencyPct !== undefined) patch.teamDependencyPct = d.teamDependencyPct ?? null;
  if (d.weight !== undefined) patch.weight = d.weight;

  await db.update(goals).set(patch).where(eq(goals.id, d.id));
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Self-rating (owner sets pct_done)                                   */
/* ------------------------------------------------------------------ */

export async function setGoalPctDone(
  input: z.infer<typeof SetPctSchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SetPctSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const pct = parsed.data.pctDone;
  await db
    .update(goals)
    .set({
      pctDone: pct,
      status: pct >= 100 ? "done" : pct > 0 ? "initiated" : "not_started",
      updatedById: me.id,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, parsed.data.id));
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Adopt / cross-out (cascade-drop the subtree)                        */
/* ------------------------------------------------------------------ */

export async function setGoalAdopted(
  input: z.infer<typeof AdoptSchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AdoptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  await setAdopted(parsed.data.id, parsed.data.adopted);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Generate cascade children (÷ prepopulate, idempotent)               */
/* ------------------------------------------------------------------ */

export async function generateGoalChildren(
  input: z.infer<typeof IdSchema>,
): Promise<ActionResult<{ created: number; childLevel: string | null }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const res = await generateChildren(parsed.data.id);
  revalidateGoals(loaded.row.periodKey);
  return { ok: true, created: res.created, childLevel: res.childLevel };
}

/* ------------------------------------------------------------------ */
/* Move-unfinished-forward — clone (default) or move (destructive)     */
/* ------------------------------------------------------------------ */

export async function cloneGoalForward(
  input: z.infer<typeof CarrySchema>,
): Promise<ActionResult<{ id: string }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CarrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const res = await cloneForward(parsed.data.id, parsed.data.targetPeriodKey, {
    retainProgress: parsed.data.retainProgress === true,
    actorId: me.id,
  });
  if (!res.ok) return res;
  revalidateGoals(loaded.row.periodKey, parsed.data.targetPeriodKey);
  return { ok: true, id: res.id };
}

export async function moveGoalForward(
  input: z.infer<typeof CarrySchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CarrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  const res = await moveTo(parsed.data.id, parsed.data.targetPeriodKey, me.id);
  if (!res.ok) return res;
  revalidateGoals(loaded.row.periodKey, parsed.data.targetPeriodKey);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Archive (soft-delete — the row is preserved)                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Weekly leaf — move a weekly goal to another week (kanban, item 19)  */
/* ------------------------------------------------------------------ */

const MoveWeeklySchema = z.object({
  id: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid week"),
});

export async function moveWeeklyToWeek(
  input: z.infer<typeof MoveWeeklySchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveWeeklySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const [w] = await db
    .select({ id: weeklyGoals.id, employeeId: weeklyGoals.employeeId })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, parsed.data.id))
    .limit(1);
  if (!w) return { ok: false, error: "Weekly goal not found." };
  const scope = await goalScopeFor({ id: me.id, isAdmin });
  if (!(w.employeeId === me.id || canManageGoalFor(scope, w.employeeId))) {
    return { ok: false, error: "That goal isn't yours to move." };
  }

  await db
    .update(weeklyGoals)
    .set({ weekStart: parsed.data.weekStart, updatedAt: new Date() })
    .where(eq(weeklyGoals.id, parsed.data.id));
  revalidatePath("/goals/cascade");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Promote a card UP a level (combined "Levels" board, Sir) — weekly →  */
/* month/quarter/year, or a month/quarter goal → a higher level. The    */
/* card "travels along": it changes level to the OWNING ancestor period.*/
/* ------------------------------------------------------------------ */

const LEVEL_RANK = { year: 0, quarter: 1, month: 2 } as const;
type PromoteLevel = keyof typeof LEVEL_RANK;

const PromoteSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["goal", "weekly"]),
  level: z.enum(["year", "quarter", "month"]),
});

/** The target period key at `level` that OWNS a source month key. */
function ownerKey(monthKey: string, level: PromoteLevel): string {
  if (level === "month") return monthKey;
  if (level === "quarter") return quarterKeyOfMonthKey(monthKey);
  return String(fyStartYearOfMonthKey(monthKey));
}

export async function promoteToLevel(
  input: z.infer<typeof PromoteSchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = PromoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, kind, level } = parsed.data;

  try {
    if (kind === "weekly") {
      // Weekly leaf → a goal at the target level (promote up, then remove the leaf).
      const [w] = await db
        .select({
          id: weeklyGoals.id,
          employeeId: weeklyGoals.employeeId,
          weekStart: weeklyGoals.weekStart,
          subject: weeklyGoals.subject,
          targetDone: weeklyGoals.targetDone,
          client: weeklyGoals.client,
          area: weeklyGoals.area,
          uom: weeklyGoals.uom,
          pctDone: weeklyGoals.pctDone,
          weight: weeklyGoals.weight,
        })
        .from(weeklyGoals)
        .where(eq(weeklyGoals.id, id))
        .limit(1);
      if (!w) return { ok: false, error: "Weekly goal not found." };
      const scope = await goalScopeFor({ id: me.id, isAdmin });
      if (!(w.employeeId === me.id || canManageGoalFor(scope, w.employeeId))) {
        return { ok: false, error: "That goal isn't yours." };
      }
      const targetKey = ownerKey(w.weekStart.slice(0, 7), level);
      const position = await nextGoalPosition(w.employeeId, level, targetKey);
      await db.insert(goals).values({
        employeeId: w.employeeId,
        period: level,
        periodKey: targetKey,
        parentGoalId: null,
        position,
        area: w.area,
        title: w.targetDone?.trim() || w.subject?.trim() || w.client?.trim() || "Goal",
        uom: w.uom,
        pctDone: w.pctDone,
        weight: w.weight,
        source: "manual",
        category: "goal",
        createdById: me.id,
        updatedById: me.id,
      });
      await db.update(weeklyGoals).set({ archived: true, updatedAt: new Date() }).where(eq(weeklyGoals.id, id));
      revalidateGoals(targetKey);
      return { ok: true };
    }

    // A cascade goal → a HIGHER level (year/quarter/month). No-op / reject if the
    // target isn't strictly higher (demote is ambiguous — a year owns 12 months).
    const loaded = await loadWritableGoalRow(id, { id: me.id, isAdmin });
    if (!loaded.ok) return loaded;
    const row = loaded.row;
    const srcRank = LEVEL_RANK[row.period as PromoteLevel] ?? 2;
    if (LEVEL_RANK[level] >= srcRank) {
      return { ok: false, error: "Drop a card onto a HIGHER level to promote it." };
    }
    const monthKeyForOwner =
      row.period === "month"
        ? row.periodKey
        : row.period === "quarter"
          ? `${fyStartYearOfKey(row.periodKey)}-04` // any month of that FY resolves the year
          : `${row.periodKey}-04`;
    const targetKey =
      level === "year"
        ? String(fyStartYearOfMonthKey(monthKeyForOwner))
        : level === "quarter"
          ? quarterKeyOfMonthKey(monthKeyForOwner)
          : row.periodKey;
    await db
      .update(goals)
      .set({ period: level, periodKey: targetKey, parentGoalId: null, source: "manual", updatedById: me.id, updatedAt: new Date() })
      .where(eq(goals.id, id));
    revalidateGoals(row.periodKey, targetKey);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveGoal(
  input: z.infer<typeof IdSchema>,
): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const loaded = await loadWritableGoalRow(parsed.data.id, { id: me.id, isAdmin });
  if (!loaded.ok) return loaded;

  await db
    .update(goals)
    .set({ archived: true, updatedById: me.id, updatedAt: new Date() })
    .where(eq(goals.id, parsed.data.id));
  revalidateGoals(loaded.row.periodKey);
  return { ok: true };
}
