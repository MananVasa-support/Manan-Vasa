/**
 * Client-SAFE DCC helpers (no DB import) — shared by the fill UI, the dashboard,
 * and the import script. Weekday bitmask: bit0=Mon … bit6=Sun.
 */

export const DCC_STATUSES = ["Done", "Not done", "NA", "Pending"] as const;
export type DccStatus = (typeof DCC_STATUSES)[number];

const DAY_TOKENS: Array<[RegExp, number]> = [
  [/\bmon\b/i, 0],
  [/\btue\b/i, 1],
  [/\bwed\b/i, 2],
  [/\b(thu|thr|thur|thurs)\b/i, 3],
  [/\bfri\b/i, 4],
  [/\bsat\b/i, 5],
  [/\bsun\b/i, 6],
];

/** Parse a sheet frequency string ("Daily", "Wed & Sat", "Every Sat") → weekday
 *  bitmask. "Daily" → Mon-Sat. No recognizable day → null (always show). */
export function parseFrequencyToMask(freq: string | null | undefined): number | null {
  const f = (freq ?? "").toLowerCase().trim();
  if (!f) return null;
  if (/\bdaily\b/.test(f) || f === "every day") return 0b111111; // Mon-Sat
  let mask = 0;
  for (const [re, bit] of DAY_TOKENS) if (re.test(f)) mask |= 1 << bit;
  return mask || null;
}

/** JS Date → weekday bit (0=Mon..6=Sun). */
export function weekdayBit(d: Date): number {
  const g = d.getDay(); // 0=Sun..6=Sat
  return g === 0 ? 6 : g - 1;
}

/** Is an item with this weekday mask due on the given date? null/0 mask = always. */
export function isDueOn(weekdays: number | null | undefined, d: Date): boolean {
  if (weekdays == null || weekdays === 0) return true;
  return (weekdays & (1 << weekdayBit(d))) !== 0;
}

/** Tone for a DCC status chip/cell. */
export function dccStatusTone(status: string | null | undefined): { bg: string; fg: string; dot: string } {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "done")
    return { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)", dot: "var(--color-green)" };
  if (s === "not done")
    return { bg: "color-mix(in srgb, var(--color-altus-red) 13%, transparent)", fg: "var(--color-altus-red-deep)", dot: "var(--color-altus-red)" };
  if (s === "pending")
    return { bg: "color-mix(in srgb, var(--color-amber, #f59e0b) 20%, transparent)", fg: "var(--color-amber-deep, #b45309)", dot: "var(--color-amber, #f59e0b)" };
  if (s === "na" || s === "not applicable")
    return { bg: "var(--color-surface-track, #eef2f7)", fg: "var(--color-ink-subtle)", dot: "var(--color-ink-subtle)" };
  return { bg: "transparent", fg: "var(--color-ink-subtle)", dot: "var(--color-hairline-strong)" };
}

/** Local YYYY-MM-DD (no UTC shift). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Human label for a weekday mask. */
export function maskLabel(mask: number | null | undefined): string {
  if (mask == null || mask === 0) return "Any";
  if (mask === 0b111111) return "Daily";
  const days: string[] = [];
  for (let b = 0; b < 7; b++) if (mask & (1 << b)) days.push(WEEKDAY_LABELS[b]!);
  return days.join(" · ");
}
