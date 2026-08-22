import type { KpiWithDelta } from "@/lib/types";

export interface TrendBadge {
  arrow: "▲" | "▼" | "→";
  /** What the badge prints — a percentage, or a raw count when there is no
   *  percentage to print. */
  text: string;
  direction: "up" | "down" | "flat";
  /** Long form for the `title` attribute: the two raw window counts, so the
   *  percentage can always be checked against the numbers behind it. */
  title: string;
}

/**
 * The "▲ 32.3% vs last week" badge, from the LAST 7 DAYS against the 7 before.
 *
 * WHAT IT REPLACED. The cards used to print `kpi.current - kpi.previous`, where
 * `current` was the bucket's count across the WHOLE active date filter (31 days
 * by default) and `previous` was a 7-day count. Subtracting one from the other
 * compares two different windows, which is how a perfectly steady fortnight
 * produced a "▲ 323 vs last week". Both numbers here are 7-day volumes off the
 * same series the sparkline draws.
 *
 * NO PERCENTAGE FROM ZERO. When last week was empty there is no percentage
 * change to state — every naive guard ("+100%") makes one new task look like a
 * doubling — so the badge falls back to the raw count of what arrived. Defined
 * once, here, because the card and its detail panel must never disagree.
 */
export function formatTrendPct(kpi: KpiWithDelta): TrendBadge {
  // Coerced, not trusted. The dashboard payload is memoised in Next's Data
  // Cache, which can serve an entry shaped by the PREVIOUS deploy for the
  // length of its TTL — and `window` / `changePct` are new fields. The cache
  // key carries a version for exactly this reason (see loadDashboardData); this
  // is the belt to that brace, so a stale entry renders "→ 0" rather than
  // "▲ undefined%".
  const current = kpi.window ?? 0;
  const previous = kpi.previous ?? 0;
  const changePct = kpi.changePct ?? null;
  const delta = current - previous;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "→";
  const title = `${current} in the last 7 days vs ${previous} in the 7 before`;

  if (changePct == null) {
    // previous === 0. `current` is the whole story: "▲ 4 vs last week".
    return { arrow, text: String(current), direction, title };
  }

  const magnitude = Math.abs(changePct);
  // Whole numbers past 10% — "▲ 47%" reads faster than "▲ 47.4%", and the
  // decimal only earns its place while the movement is small.
  const shown = magnitude >= 10 ? Math.round(magnitude) : magnitude;
  return { arrow, text: `${shown}%`, direction, title };
}
