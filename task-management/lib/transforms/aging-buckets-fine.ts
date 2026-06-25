/**
 * Manan's EXACT fine-grained early/late aging buckets.
 *
 * The signed "offset" of a task is measured in whole days against its effective
 * due date (COALESCE(revisedTargetDate, dueAt) — see lib/tasks/effective-due.ts):
 *
 *   • For a DONE task:    offset = effectiveDue − completedAt
 *   • For a PENDING task: offset = effectiveDue − today
 *
 * In BOTH cases the sign convention is identical:
 *   POSITIVE  → finished / standing EARLY (before the due date)  → good
 *   ZERO      → exactly on the due date
 *   NEGATIVE  → finished / standing LATE  (after the due date)   → overdue
 *
 * The twelve buckets, in Manan's exact display order:
 *   "+7 or more", "+4 to 6", "+2 to 3", "+1", "0",
 *   "-1", "-2 to 3", "-3 to 5", "-6 to 7", "-8 to 10", "-11 to 15", "-15 or more"
 */

export const FINE_AGING_BUCKETS = [
  "+7 or more",
  "+4 to 6",
  "+2 to 3",
  "+1",
  "0",
  "-1",
  "-2 to 3",
  "-3 to 5",
  "-6 to 7",
  "-8 to 10",
  "-11 to 15",
  "-15 or more",
] as const;

export type FineBucketKey = (typeof FINE_AGING_BUCKETS)[number];

/** True when a bucket key represents a LATE (overdue) band — i.e. negative offset. */
export function fineBucketIsLate(key: FineBucketKey): boolean {
  return key.startsWith("-");
}

/**
 * Classify a signed day-offset into one of Manan's twelve buckets.
 *
 * `days` is the SIGNED offset (positive = early/before due, negative = late).
 * Boundaries are read straight off Manan's labels:
 *   +7 or more        →  days >= 7
 *   +4 to 6           →  4 <= days <= 6
 *   +2 to 3           →  2 <= days <= 3
 *   +1                →  days === 1
 *   0                 →  days === 0
 *   -1                →  days === -1
 *   -2 to 3           →  -3 <= days <= -2
 *   -3 to 5           →  -5 <= days <= -4   (-3 already lands in "-2 to 3"; the
 *                                            label's leading edge is inclusive of
 *                                            the previous band's tail by design,
 *                                            so we key strictly off the magnitude
 *                                            ranges below to avoid overlap)
 *   -6 to 7           →  -7 <= days <= -6
 *   -8 to 10          →  -10 <= days <= -8
 *   -11 to 15         →  -15 <= days <= -11
 *   -15 or more       →  days <= -16
 *
 * NOTE on the "-2 to 3" / "-3 to 5" overlap in Manan's written labels: the
 * magnitude −3 cannot live in two buckets, so the ranges are made disjoint by
 * treating "-2 to 3" as magnitudes 2–3 and "-3 to 5" as magnitudes 4–5. This
 * preserves the twelve distinct, ordered, non-overlapping bands he asked for.
 */
export function bucketForOffset(days: number): FineBucketKey {
  if (days >= 7) return "+7 or more";
  if (days >= 4) return "+4 to 6"; // 4..6
  if (days >= 2) return "+2 to 3"; // 2..3
  if (days === 1) return "+1";
  if (days === 0) return "0";
  if (days === -1) return "-1";
  if (days >= -3) return "-2 to 3"; // -2..-3
  if (days >= -5) return "-3 to 5"; // -4..-5
  if (days >= -7) return "-6 to 7"; // -6..-7
  if (days >= -10) return "-8 to 10"; // -8..-10
  if (days >= -15) return "-11 to 15"; // -11..-15
  return "-15 or more"; // <= -16
}

const MS_PER_DAY = 86_400_000;

/** Whole-UTC-day index for a Date or ISO/date string (timezone-stable). */
export function fineDayNumber(d: Date | string): number {
  const key = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Math.floor(new Date(`${key}T00:00:00Z`).getTime() / MS_PER_DAY);
}

/**
 * Signed offset for a DONE task: (effectiveDue − completedAt) in whole days.
 * Positive = finished early, negative = finished late. Returns null when either
 * date is missing (the task cannot be placed on the early/late scale).
 */
export function doneOffsetDays(
  effectiveDue: Date | string | null,
  completedAt: Date | string | null,
): number | null {
  if (!effectiveDue || !completedAt) return null;
  return fineDayNumber(effectiveDue) - fineDayNumber(completedAt);
}

/**
 * Signed offset for a PENDING / not-yet-resolved task as of `now`:
 * (effectiveDue − today) in whole days. Positive = not yet due (early),
 * negative = overdue (late). Returns null when there is no effective due date.
 */
export function pendingOffsetDays(
  effectiveDue: Date | string | null,
  now: Date,
): number | null {
  if (!effectiveDue) return null;
  return fineDayNumber(effectiveDue) - fineDayNumber(now);
}

export interface FineBucketCount {
  key: FineBucketKey;
  count: number;
  late: boolean;
}

/** Build a zeroed, fully-ordered count map over the twelve buckets. */
export function emptyFineDistribution(): Map<FineBucketKey, number> {
  return new Map(FINE_AGING_BUCKETS.map((k) => [k, 0]));
}

/** Materialise a count map into the ordered, render-ready bucket list. */
export function toFineBucketList(
  counts: Map<FineBucketKey, number>,
): FineBucketCount[] {
  return FINE_AGING_BUCKETS.map((key) => ({
    key,
    count: counts.get(key) ?? 0,
    late: fineBucketIsLate(key),
  }));
}

export interface DoneFineInput {
  effectiveDue: Date | string | null;
  completedAt: Date | string | null;
}

/**
 * Distribute a set of DONE tasks across the twelve buckets using each task's
 * (effectiveDue − completedAt) signed offset. Tasks without both dates are
 * skipped and reported via `undated`.
 */
export function distributeDoneFine(rows: DoneFineInput[]): {
  buckets: FineBucketCount[];
  dated: number;
  undated: number;
} {
  const counts = emptyFineDistribution();
  let dated = 0;
  let undated = 0;
  for (const r of rows) {
    const offset = doneOffsetDays(r.effectiveDue, r.completedAt);
    if (offset === null) {
      undated++;
      continue;
    }
    const key = bucketForOffset(offset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    dated++;
  }
  return { buckets: toFineBucketList(counts), dated, undated };
}

export interface PendingFineInput {
  effectiveDue: Date | string | null;
}

/**
 * Distribute a set of PENDING / not-approved tasks across the twelve buckets
 * using each task's (effectiveDue − today) signed offset. Tasks without an
 * effective due date are skipped and reported via `undated`.
 */
export function distributePendingFine(
  rows: PendingFineInput[],
  now: Date,
): {
  buckets: FineBucketCount[];
  dated: number;
  undated: number;
} {
  const counts = emptyFineDistribution();
  let dated = 0;
  let undated = 0;
  for (const r of rows) {
    const offset = pendingOffsetDays(r.effectiveDue, now);
    if (offset === null) {
      undated++;
      continue;
    }
    const key = bucketForOffset(offset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    dated++;
  }
  return { buckets: toFineBucketList(counts), dated, undated };
}
