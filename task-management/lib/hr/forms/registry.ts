/**
 * The HR forms catalogue — which forms feed the submissions index, what they're
 * called, and which lifecycle stage they belong to.
 *
 * PURE by design: no icons, no `server-only`, no DB. The list surfaces (client)
 * and the recorder (server) both import it, and pulling `lib/hr/lifecycle.ts` in
 * here would drag lucide icon components into client bundles for nothing. The
 * stage KEYS below are the same ones `lib/hr/lifecycle.ts` defines; the labels
 * are duplicated deliberately, and the test in the same folder pins them
 * together so a rename there can't silently desync this.
 *
 * Each entry describes a form that ALREADY EXISTS and already owns its own
 * table. Registering it here does not change how it saves — it only teaches the
 * index what to call it and where to send someone who clicks through.
 */

/** HR lifecycle stage keys, in lifecycle order (mirrors lib/hr/lifecycle.ts). */
export const HR_SECTIONS = [
  "pre-interview",
  "post-interview",
  "pre-joining",
  "post-joining",
  "during",
  "exit",
] as const;

export type HrSectionKey = (typeof HR_SECTIONS)[number];

export const HR_SECTION_LABEL: Record<HrSectionKey, string> = {
  "pre-interview": "Pre-Interview",
  "post-interview": "Post-Interview",
  "pre-joining": "Pre-Joining",
  "post-joining": "Post-Joining",
  during: "During",
  exit: "Exit",
};

export interface HrFormDef {
  /** Stable id stored on every submission row. Never change one in place. */
  key: string;
  /** Display name, snapshotted onto each submission at save time. */
  name: string;
  section: HrSectionKey;
  /** Where "open the form" goes. The form keeps its own page and behaviour. */
  href: string;
  /** The table that actually owns this form's data — documentation for readers
   *  chasing a row back to its source, and what `sourceTable` is set to. */
  sourceTable: string;
}

/**
 * The registered forms. Adding one here does NOT make it record submissions —
 * its save action has to call `recordHrFormSubmission`. Keeping the two steps
 * separate means a form can be listed as "known" before it's wired, instead of
 * silently producing rows nobody renders.
 */
export const HR_FORMS: HrFormDef[] = [
  {
    key: "exit-interview",
    name: "Exit Interview",
    section: "exit",
    href: "/hr/exit",
    sourceTable: "exit_records",
  },
  {
    key: "exit-handover",
    name: "Handover & Clearance Checklist",
    section: "exit",
    href: "/hr/exit",
    sourceTable: "exit_records",
  },
];

const BY_KEY = new Map(HR_FORMS.map((f) => [f.key, f]));

export function getHrForm(key: string): HrFormDef | undefined {
  return BY_KEY.get(key);
}

export function isHrSection(v: string): v is HrSectionKey {
  return (HR_SECTIONS as readonly string[]).includes(v);
}

/** Label for a stored section key. Falls back to the raw key so a submission
 *  filed under a stage that was later removed still renders something rather
 *  than an empty cell. */
export function hrSectionLabel(key: string): string {
  return isHrSection(key) ? HR_SECTION_LABEL[key] : key;
}
