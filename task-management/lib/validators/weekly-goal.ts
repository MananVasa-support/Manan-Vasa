import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/db/enums";

const uuid = z.string().guid("Must be a UUID");
// week_start is a plain calendar date (Monday). We validate the shape and let
// the server snap it to a Monday defensively.
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a yyyy-mm-dd date");

const pct = z.coerce.number().int().min(0).max(100);
// Weight ∈ [1, 1000]: a goal's share of the weekly weighted-completion score.
const weight = z.coerce.number().int().min(1).max(1000);

/** Shared editable fields for one Weekly Goal row. */
const goalFields = {
  client: z.string().trim().max(160).nullable().optional().default(null),
  subject: z.string().trim().max(160).nullable().optional().default(null),
  priority: z.enum(TASK_PRIORITIES).optional().default("imp_not_urgent"),
  incentive: z.boolean().optional().default(false),
  kpi: z.boolean().optional().default(false),
  targetDone: z.string().trim().max(2000).nullable().optional().default(null),
  explanation: z.string().trim().max(4000).nullable().optional().default(null),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Must be a valid URL")
    .nullable()
    .optional()
    .default(null),
  // Redesign (additive): weighted score share, per-goal target date, plan notes.
  weight: weight.optional().default(100),
  targetDate: ymd.nullable().optional().default(null),
  notes: z.string().trim().max(4000).nullable().optional().default(null),
};

/**
 * Create a single goal. `employeeId` is who the priority belongs to; when a
 * non-admin creates a row it's forced to their own id in the action. The
 * fast-add row submits exactly this shape.
 */
export const CreateWeeklyGoalSchema = z.object({
  employeeId: uuid,
  weekStart: ymd,
  ...goalFields,
});
export type CreateWeeklyGoalInput = z.input<typeof CreateWeeklyGoalSchema>;
export type CreateWeeklyGoalParsed = z.output<typeof CreateWeeklyGoalSchema>;

/** Partial edit of an existing row's content fields (admin or owner). */
export const EditWeeklyGoalSchema = z.object({
  id: uuid,
  client: z.string().trim().max(160).nullable().optional(),
  subject: z.string().trim().max(160).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  incentive: z.boolean().optional(),
  kpi: z.boolean().optional(),
  targetDone: z.string().trim().max(2000).nullable().optional(),
  explanation: z.string().trim().max(4000).nullable().optional(),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Must be a valid URL")
    .nullable()
    .optional(),
  // Redesign (additive): partial edits of the new Planning fields.
  weight: weight.optional(),
  targetDate: ymd.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export type EditWeeklyGoalInput = z.input<typeof EditWeeklyGoalSchema>;
export type EditWeeklyGoalParsed = z.output<typeof EditWeeklyGoalSchema>;

/** Set the "% Done (Actual)" — owner or admin. */
export const SetPctDoneSchema = z.object({
  id: uuid,
  pctDone: pct,
});
export type SetPctDoneInput = z.input<typeof SetPctDoneSchema>;

/** Carry one goal forward into a later week (defaults to the next week). */
export const CarryOverSchema = z.object({
  id: uuid,
  // Optional explicit target Monday; defaults to the source week + 7 days.
  toWeekStart: ymd.optional(),
  // When true, copy the current % done into the new row; otherwise reset to 0.
  keepProgress: z.boolean().optional().default(false),
});
export type CarryOverInput = z.input<typeof CarryOverSchema>;

export const DeleteWeeklyGoalSchema = z.object({ id: uuid });

/**
 * Super-admin review of a goal. Every reviewer field is optional so a panel can
 * patch just one (e.g. only the Status, or only the Accept %). At least one
 * reviewable field must be supplied. `acceptPct` may be cleared with `null`
 * (back to "not yet reviewed"). The action rejects an `acceptPct` write when the
 * goal is already approved (locked) — enforced server-side, not here.
 */
export const ReviewWeeklyGoalSchema = z
  .object({
    id: uuid,
    status: z.enum(TASK_STATUSES).optional(),
    acceptPct: pct.nullable().optional(),
    reviewNotes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.acceptPct !== undefined ||
      v.reviewNotes !== undefined,
    { message: "Provide at least one review field to update" },
  );
export type ReviewWeeklyGoalInput = z.input<typeof ReviewWeeklyGoalSchema>;

/** Super-admin approve / un-approve. `approved=false` reverses the stamp. */
export const ApproveWeeklyGoalSchema = z.object({
  id: uuid,
  approved: z.boolean(),
});
export type ApproveWeeklyGoalInput = z.input<typeof ApproveWeeklyGoalSchema>;

/** Super-admin archive / un-archive (hide from / restore to the active board). */
export const ArchiveWeeklyGoalSchema = z.object({
  id: uuid,
  archived: z.boolean(),
});
export type ArchiveWeeklyGoalInput = z.input<typeof ArchiveWeeklyGoalSchema>;

/**
 * Duplicate a goal into the SAME week (owner or admin). Distinct from
 * carry-over (which targets the next week + sets carriedFromId): a duplicate
 * copies the planning fields into a fresh row with reset progress + review.
 */
export const DuplicateWeeklyGoalSchema = z.object({ id: uuid });
export type DuplicateWeeklyGoalInput = z.input<typeof DuplicateWeeklyGoalSchema>;
