const numberFmt = new Intl.NumberFormat("en-IN");

export function formatCount(n: number): string {
  return numberFmt.format(n);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

export function formatDelta(n: number): string {
  if (n > 0) return `↑ ${n}`;
  if (n < 0) return `↓ ${Math.abs(n)}`;
  return `→ 0`;
}

import type { TaskStatus, StatusColorToken } from "@/db/enums";

// M5.1 — client-side fallback maps for status labels + colors. Server
// Components should call `getStatusDisplayMap()` (lib/queries/status-display.ts)
// instead so admin renames flow through. These exist for purely-client surfaces
// and as a safety net if a DB read fails.
export const STATUS_LABELS_FALLBACK: Record<TaskStatus, string> = {
  not_started:  "Not Started",
  initiated:    "Initiated",
  follow_up:    "Follow Up",         // legacy — kept for already-imported rows
  need_help:    "Need Help",
  need_info:    "Need Info",         // Tier-3 NEW
  follow_up_1:  "Follow Up 1",       // Tier-3 NEW
  follow_up_2:  "Follow Up 2",       // Tier-3 NEW
  follow_up_3:  "Follow Up 3",       // Tier-3 NEW
  done:         "Done",
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

export const STATUS_TONES_FALLBACK: Record<TaskStatus, StatusColorToken> = {
  not_started:  "amber",
  initiated:    "amber",
  follow_up:    "amber",
  need_help:    "red",
  need_info:    "blue",              // Tier-3 NEW — "I need info" is a softer block
  follow_up_1:  "amber",             // Tier-3 NEW
  follow_up_2:  "amber",             // Tier-3 NEW
  follow_up_3:  "red",               // Tier-3 NEW — getting urgent
  done:         "green",
  approved:     "green",
  not_approved: "red",
  cancelled:    "rose",
  transferred:  "purple",
};
