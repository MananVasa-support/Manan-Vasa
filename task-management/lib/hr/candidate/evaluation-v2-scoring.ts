/**
 * CANDIDATE EVALUATION v2 — the PURE, CLIENT-SAFE scoring core.
 *
 * Micro-average per section → macro weight → weighted overall, with:
 *  · renormalization over APPLICABLE (gate) + RATED sections,
 *  · "Can't Say" items excluded from averages,
 *  · G's nested sub-weights (Problem-Solving / Ability-to-Execute),
 *  · Eligibility as a hard pass/fail GATE (any "No" without an exception = deal-breaker),
 *  · X-Factor (K) and Overall (N) reported SEPARATELY, never blended in.
 *
 * No server imports. Both the client screens and the server report use this.
 * Spec: docs/superpowers/specs/2026-07-27-candidate-evaluation-v2-design.md
 */

import {
  RATING_SECTIONS,
  DEFAULT_SECTION_WEIGHTS,
  ELIGIBILITY_ITEM_IDS,
  sectionItemIds,
  type EvalSection,
  type EvalItem,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";

/** sectionId → relative weight. Partial maps fall back to the default weight. */
export type WeightProfile = Record<string, number>;

/** The weight for a section, from the profile or its default. */
export function weightOf(sectionId: string, profile?: WeightProfile | null): number {
  const w = profile?.[sectionId];
  if (typeof w === "number" && Number.isFinite(w) && w >= 0) return w;
  return DEFAULT_SECTION_WEIGHTS[sectionId] ?? 0;
}

/** A section is applicable unless it's gated (M by L=sell) and the gate is not "yes". */
export function isSectionApplicable(section: EvalSection, inst: EvaluationInstance): boolean {
  if (!section.gatedBy) return true;
  if (section.gatedBy === "sell") return inst.sellResponsibility === true;
  return true;
}

function ratedAvg(items: EvalItem[], inst: EvaluationInstance): { avg: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const it of items) {
    if (inst.cantSay.includes(it.id)) continue;
    const v = inst.ratings[it.id];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  return { avg: count ? sum / count : 0, count };
}

/**
 * A section's micro average (0..10), or null when nothing in it is rated.
 * Sections with sub-group weights (G) blend by those weights; others are a flat
 * average over their rated items.
 */
export function sectionMicro(section: EvalSection, inst: EvaluationInstance): number | null {
  const anyWeighted = section.groups.some((grp) => (grp.weight ?? 0) > 0);
  if (anyWeighted) {
    let num = 0;
    let den = 0;
    for (const grp of section.groups) {
      const w = grp.weight ?? 0;
      if (w <= 0) continue;
      const { avg, count } = ratedAvg(grp.items, inst);
      if (count === 0) continue;
      num += avg * w;
      den += w;
    }
    return den > 0 ? num / den : null;
  }
  const { avg, count } = ratedAvg(
    section.groups.flatMap((grp) => grp.items),
    inst,
  );
  return count > 0 ? avg : null;
}

export interface SectionScore {
  sectionId: string;
  code: string;
  title: string;
  /** 0..10 micro, or null if unrated. */
  micro: number | null;
  /** the applied macro weight (Y in "X / Y"). */
  weight: number;
  /** weighted section points (X in "X / Y"). */
  x: number;
  applicable: boolean;
}

export function sectionScore(
  section: EvalSection,
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
): SectionScore {
  const micro = sectionMicro(section, inst);
  const weight = weightOf(section.id, profile);
  const x = micro === null ? 0 : Math.round((micro / 10) * weight);
  return {
    sectionId: section.id,
    code: section.code,
    title: section.title,
    micro,
    weight,
    x,
    applicable: isSectionApplicable(section, inst),
  };
}

/** All weighted section scores (rating sections), in definition order. */
export function allSectionScores(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
): SectionScore[] {
  return RATING_SECTIONS.map((s) => sectionScore(s, inst, profile));
}

export interface OverallScore {
  /** 0..10 weighted average over applicable + rated + weighted sections, or null. */
  avg: number | null;
  /** 0..100 convenience (avg × 10). */
  pct: number | null;
  ratedSections: number;
  applicableSections: number;
}

/**
 * The weighted overall (0..10). Applicable sections exclude a gated-off M; rated
 * sections exclude fully-unrated ones; the weights renormalize over what remains,
 * so a partly-filled form still yields a sane number.
 */
export function overallScore(
  inst: EvaluationInstance,
  profile?: WeightProfile | null,
): OverallScore {
  let num = 0;
  let den = 0;
  let rated = 0;
  let applicable = 0;
  for (const s of RATING_SECTIONS) {
    if (!isSectionApplicable(s, inst)) continue;
    applicable += 1;
    const micro = sectionMicro(s, inst);
    if (micro === null) continue;
    const w = weightOf(s.id, profile);
    if (w <= 0) continue;
    num += micro * w;
    den += w;
    rated += 1;
  }
  const avg = den > 0 ? num / den : null;
  return { avg, pct: avg === null ? null : Math.round(avg * 10), ratedSections: rated, applicableSections: applicable };
}

export interface EligibilityVerdict {
  answered: number;
  total: number;
  /** item ids answered "No". */
  noItems: string[];
  /** whether a section-level Exceptions note was recorded. */
  hasException: boolean;
  /** any un-excepted "No" → the candidate is a deal-breaker. */
  dealbreaker: boolean;
}

export function eligibilityVerdict(inst: EvaluationInstance): EligibilityVerdict {
  const noItems = ELIGIBILITY_ITEM_IDS.filter((id) => inst.passfail[id] === "no");
  const answered = ELIGIBILITY_ITEM_IDS.filter((id) => Boolean(inst.passfail[id])).length;
  const hasException = (inst.sectionNotes["eligibility"] ?? "").trim().length > 0;
  return {
    answered,
    total: ELIGIBILITY_ITEM_IDS.length,
    noItems,
    hasException,
    dealbreaker: noItems.length > 0 && !hasException,
  };
}

/** Progress across the rating items of the APPLICABLE sections (rated or Can't-Say). */
export function ratingProgress(inst: EvaluationInstance): { rated: number; total: number } {
  const items = RATING_SECTIONS.filter((s) => isSectionApplicable(s, inst)).flatMap(sectionItemIds);
  const rated = items.filter((id) => id in inst.ratings || inst.cantSay.includes(id)).length;
  return { rated, total: items.length };
}
