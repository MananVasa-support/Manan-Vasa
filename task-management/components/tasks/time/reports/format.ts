/**
 * Client-safe formatting helpers for the Time Intelligence reports. Times reuse
 * `formatMinutesLabel` / `formatDuration` from lib/tasks/time/types (also
 * client-safe); this module adds the date + percentage + priority helpers the
 * report tables need. IST throughout (the org's reporting timezone).
 */
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";

const IST = "Asia/Kolkata";

/** "03 Aug 2026" — a date, IST. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "03 Aug 2026, 4:12 PM" — a date + time, IST. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "03 Aug 2026" from a bare YYYY-MM-DD (already IST — no parsing to UTC). */
export function fmtDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    weekday: "short",
  });
}

/** A 0..1 ratio as a rounded whole-percent string. */
export function pct(ratio: number): string {
  return `${Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)}%`;
}

export function priorityLabel(p: TaskPriority): string {
  return PRIORITY_LABELS[p] ?? p;
}
