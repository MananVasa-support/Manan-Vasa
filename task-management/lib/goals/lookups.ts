import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goalLookups } from "@/db/schema";

/**
 * Goal composer dropdown options for Area + Measure. A fixed BASE set lives here
 * in code; admins can add MORE (persisted in `goal_lookups`, migration 0148),
 * which merge in after the base ones. `listGoalLookups` returns the merged,
 * deduped lists the board loader hands to the composer + edit drawer.
 */

export type GoalLookupKind = "area" | "measure" | "type";

/** Base Area options (order matters — shown first). */
export const BASE_AREAS = ["Revenue", "Health", "Strategy", "Self", "Family"] as const;

/** Base Measure options (unit of measure → stored on goals.uom). */
export const BASE_MEASURES = ["Rs.", "Seats", "Nos.", "Yes/No", "NA"] as const;

/** Base Type options (→ stored on goals.category, a free-text column). */
export const BASE_TYPES = ["Goal", "Target", "Milestone", "Operational"] as const;

function baseFor(kind: GoalLookupKind): readonly string[] {
  return kind === "area" ? BASE_AREAS : kind === "measure" ? BASE_MEASURES : BASE_TYPES;
}

/** Case-insensitive de-dupe that keeps the FIRST spelling seen (base wins). */
function mergeUnique(base: readonly string[], extra: string[]): string[] {
  const seen = new Set(base.map((v) => v.toLowerCase()));
  const out = [...base];
  for (const v of extra) {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
}

export interface GoalLookupOptions {
  areas: string[];
  measures: string[];
  types: string[];
  /** Values that are admin-added (deletable) — base options are NOT here. */
  custom: { areas: string[]; measures: string[]; types: string[] };
}

/** Base options + active admin-added extras, merged. ONE indexed select. */
export async function listGoalLookups(): Promise<GoalLookupOptions> {
  const rows = await db
    .select({ kind: goalLookups.kind, value: goalLookups.value })
    .from(goalLookups)
    .where(eq(goalLookups.active, true))
    .orderBy(asc(goalLookups.sortOrder), asc(goalLookups.value));

  const customAreas = rows.filter((r) => r.kind === "area").map((r) => r.value);
  const customMeasures = rows.filter((r) => r.kind === "measure").map((r) => r.value);
  const customTypes = rows.filter((r) => r.kind === "type").map((r) => r.value);

  return {
    areas: mergeUnique(BASE_AREAS, customAreas),
    measures: mergeUnique(BASE_MEASURES, customMeasures),
    types: mergeUnique(BASE_TYPES, customTypes),
    custom: { areas: customAreas, measures: customMeasures, types: customTypes },
  };
}

/** True when `value` is a BASE option for `kind` (base options can't be deleted). */
export function isBaseGoalLookup(kind: GoalLookupKind, value: string): boolean {
  return baseFor(kind).some((b) => b.toLowerCase() === value.trim().toLowerCase());
}

/** True when `value` is already an option (base or custom) for `kind`. */
export async function goalLookupExists(kind: GoalLookupKind, value: string): Promise<boolean> {
  if (isBaseGoalLookup(kind, value)) return true;
  const [hit] = await db
    .select({ id: goalLookups.id })
    .from(goalLookups)
    .where(and(eq(goalLookups.kind, kind), eq(goalLookups.value, value.trim())))
    .limit(1);
  return !!hit;
}
