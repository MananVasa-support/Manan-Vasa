/**
 * Firm-name tokens — so every HR letter, agreement and policy re-brands to the
 * SELECTED paying entity instead of a hardcoded "Altus Corp".
 *
 * Author document text with these tokens; the renderer resolves them against the
 * issuing entity chosen in the toolbar:
 *
 *   {firm}       → entity.displayName   e.g. "Altus Corp", "The Perfect Blend (Khushboo Shah)"
 *   {firmLegal}  → entity.legalName     the full legal name for formal contexts
 *
 * PURE + CLIENT-SAFE (imports only the entity registry). Applied at the same
 * render points as the pronoun engine — wrap it around applyPronouns() so a
 * document is resolved for BOTH gender and firm in one pass. Load-neutral.
 */

import { getEntity, type Entity, type EntityId } from "@/lib/hr/entities";

/** Resolve `{firm}` / `{firmLegal}` in `text` against the issuing entity. */
export function applyFirm(
  text: string,
  entity: EntityId | Entity | string | null | undefined,
): string {
  if (!text || text.indexOf("{") === -1) return text;
  const e = getEntity(entity ?? null);
  return text.replace(/\{firmLegal\}/g, e.legalName).replace(/\{firm\}/g, e.displayName);
}

export default applyFirm;
