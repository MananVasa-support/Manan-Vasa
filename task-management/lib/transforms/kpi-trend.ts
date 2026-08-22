import type { TrendPoint, TrendWindows } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Rows the trend reads. Kept structural so both the dashboard scan (which
 *  drops the big text columns) and tests can supply them. */
export interface TrendInput {
  createdAt: Date;
  completedAt?: Date | null;
}

function startOfUTCDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `2026-08-15` — the key the tooltip formats and the series is indexed by. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A dense day-by-day series ending TODAY, oldest first.
 *
 * Dense matters: the sparkline plots by index, so a sparse series (days with no
 * activity omitted) would silently compress a quiet week into a straight line
 * and put the wrong date under the reader's cursor.
 *
 * `created` buckets on `created_at`, `completed` on `completed_at` — a task
 * created on the 3rd and finished on the 9th contributes to both, on different
 * days. That is the point of the pair: one line is intake, the other is
 * throughput, and the gap between them is the backlog moving.
 */
export function computeTrendSeries(
  tasks: TrendInput[],
  now: Date,
  days: number,
): TrendPoint[] {
  const today = startOfUTCDay(now);
  const first = today - (days - 1) * MS_PER_DAY;

  const points: TrendPoint[] = [];
  const index = new Map<string, TrendPoint>();
  for (let i = 0; i < days; i++) {
    const ms = first + i * MS_PER_DAY;
    const point: TrendPoint = { date: isoDay(ms), created: 0, completed: 0 };
    points.push(point);
    index.set(point.date, point);
  }

  for (const t of tasks) {
    const created = index.get(isoDay(startOfUTCDay(t.createdAt)));
    if (created) created.created += 1;
    if (t.completedAt) {
      const done = index.get(isoDay(startOfUTCDay(t.completedAt)));
      if (done) done.completed += 1;
    }
  }

  return points;
}

/**
 * The badge on each card: current 7-day volume vs the 7 days before it.
 *
 *   changePct = (current − previous) / previous × 100
 *
 * `changePct` is null when the previous window is 0 — there is no percentage
 * change from nothing, and rendering the "+100%" that a naive guard produces
 * makes one task look like a doubling. The card falls back to the absolute
 * delta in that case.
 *
 * WHY THIS REPLACED THE OLD DELTA: the card used to show
 * `kpi.current − kpi.previous`, where `current` was the task count over the
 * WHOLE active date filter (31 days by default) and `previous` was a 7-day
 * count. Subtracting one from the other compares two different windows, which
 * is how a steady week produced a "▲ 323 vs last week".
 */
export function computeTrendWindows(
  points: TrendPoint[],
  windowDays = 7,
  metric: "created" | "completed" = "created",
): TrendWindows {
  const at = (i: number) => (i >= 0 && i < points.length ? points[i]![metric] : 0);
  const end = points.length;

  let current = 0;
  for (let i = end - windowDays; i < end; i++) current += at(i);

  let previous = 0;
  for (let i = end - 2 * windowDays; i < end - windowDays; i++) previous += at(i);

  return {
    windowDays,
    current,
    previous,
    changePct:
      previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
  };
}
