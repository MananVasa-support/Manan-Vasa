/**
 * Official company email derivation — the single source of truth for turning a
 * new joiner's name into their `firstname.lastname@<domain>` company address.
 *
 * PURE + CLIENT-SAFE (no db / server imports) so the HR control panel can PREVIEW
 * the address before provisioning, and the server provisioning action can derive
 * the exact same value. The domain is a one-line constant below — change it here
 * and every derived address follows.
 *
 * Rules (mirrors the spec):
 *   - lowercase, diacritics stripped, spaces/punctuation removed.
 *   - two-or-more words  → first word + "." + LAST word  (middle names dropped).
 *   - single word        → just that word (no trailing dot).
 *   - empty / unnamed    → "employee" (never emits a broken "@domain").
 *   - collisions         → append the smallest integer suffix that is free,
 *                          given a set of already-taken local parts / emails.
 */

/** The company email domain. One-line change propagates everywhere. */
export const COMPANY_EMAIL_DOMAIN = "altuscorp.com";

/** Strip diacritics and keep only [a-z0-9], lower-cased. */
function slug(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** The local part (before the @) for a name — no domain, no collision handling. */
export function officialLocalPart(name: string): string {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .map(slug)
    .filter(Boolean);
  if (parts.length === 0) return "employee";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

/** Normalise a collision set to a set of lower-cased LOCAL parts (accepts full
 *  emails too — anything after "@" is dropped). */
function takenLocalParts(taken?: Iterable<string>): Set<string> {
  const out = new Set<string>();
  if (!taken) return out;
  for (const raw of taken) {
    if (!raw) continue;
    const local = raw.toString().trim().toLowerCase().split("@")[0];
    if (local) out.add(local);
  }
  return out;
}

/**
 * Derive `firstname.lastname@<domain>` for a name. When `taken` is supplied
 * (existing official emails / local parts), a numeric suffix is appended until
 * the local part is unique — e.g. `asha.rao`, then `asha.rao2`, `asha.rao3`.
 */
export function deriveOfficialEmail(
  name: string,
  taken?: Iterable<string>,
): string {
  const base = officialLocalPart(name);
  const used = takenLocalParts(taken);

  let local = base;
  if (used.has(local)) {
    let n = 2;
    while (used.has(`${base}${n}`)) n += 1;
    local = `${base}${n}`;
  }
  return `${local}@${COMPANY_EMAIL_DOMAIN}`;
}

export default deriveOfficialEmail;
