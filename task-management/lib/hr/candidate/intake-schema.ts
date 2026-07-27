import { visibleFields, type FormFieldDef } from "@/lib/forms/field-types";

/**
 * Wizard schema for the Candidate Interview Form — restructured into rail
 * sections on top of the existing FormFieldDef renderer. Repeated blocks
 * (Education, Previous Work, Family) become "add another" repeaters so the rail
 * stays short.
 *
 * Runtime values are a flat Record<string,string> keyed:
 *   non-repeat:  `${sectionId}.${fieldKey}`
 *   repeater:    `${sectionId}.${instanceIndex}.${fieldKey}`
 * The Declaration photo/signature are file uploads handled outside FieldInput.
 *
 * Special Personal-section fields (rendered specially by IntakeSectionStep):
 *   position  — managed dropdown fed by the Interview Positions master (add/delete)
 *   department — dropdown fed by the Departments master
 *   aadhaar   — seeds an Aadhaar-based lookup that auto-fills Mobile + Location
 *   age       — auto-computed (whole years) from Date of Birth, read-only
 *   homeLoan/monthlyRent — conditional on "Do you own a house?" (showIf)
 */
export interface IntakeSection {
  id: string;
  title: string;
  subtitle?: string;
  fields: FormFieldDef[];
  /** Repeater config — `fields` repeat per instance. */
  repeat?: { min: number; max: number; seed: number; itemLabel: string };
  /** Section is a file-upload declaration step (special-rendered). */
  declaration?: boolean;
  /** Section is the free-form Notes + Dictate step (special-rendered). */
  notes?: boolean;
}

/**
 * EVERY field in the Candidate Interview Form is mandatory — the only fields we
 * never require are derived/read-only ones (e.g. the auto-computed Age, which
 * fills itself from Date of Birth). This is the single source of truth for
 * "is this field required"; the per-field `required` flags below are now purely
 * cosmetic hints and are no longer what drives the completion gate.
 */
export function isRequiredField(f: FormFieldDef): boolean {
  return !f.readOnly && f.compute == null;
}

const YN: string[] = ["Yes", "No"];

/** Seed list for the Interview Positions master (admins add/remove live). */
export const DEFAULT_POSITIONS: string[] = [
  "First-Year Intern",
  "Second-Year Intern",
  "Executive",
  "Senior Executive",
  "Assistant Manager",
  "Deputy Manager",
  "Senior Manager",
  "Consultant",
  "Senior Consultant",
  "General Manager",
  "Assistant Vice President",
  "Deputy Vice President",
  "Senior Vice President",
];

const EDU_FIELDS: FormFieldDef[] = [
  { key: "degree", label: "Degree", type: "text", placeholder: "e.g. 10th / 12th / B.Com" },
  { key: "school", label: "Name of School / College", type: "text" },
  { key: "board", label: "Board / University", type: "text" },
  { key: "mode", label: "Regular / Part-Time", type: "buttons", options: ["Regular", "Part-Time"] },
  {
    key: "passingMonth",
    label: "Month of Passing",
    type: "select",
    options: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
  },
  { key: "passingYear", label: "Year of Passing", type: "text", placeholder: "e.g. 2019" },
  { key: "attempts", label: "Number of Attempts", type: "number" },
  { key: "percentage", label: "Percentage", type: "text", placeholder: "e.g. 78%" },
];

const FAMILY_FIELDS: FormFieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relationship", label: "Relationship", type: "text", required: true },
  { key: "gender", label: "Gender", type: "buttons", options: ["Male", "Female"], required: true },
  { key: "age", label: "Age", type: "number", required: true },
  { key: "occupation", label: "Occupation", type: "text", required: true },
];

const PREV_WORK_FIELDS: FormFieldDef[] = [
  { key: "from", label: "From", type: "date" },
  { key: "to", label: "To", type: "date" },
  { key: "org", label: "Organization", type: "text" },
  { key: "designation", label: "Designation", type: "text" },
  { key: "reason", label: "Reason for Leaving", type: "textarea" },
  { key: "gap", label: "Career Gap (if any)", type: "text" },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "personal",
    title: "Personal Details",
    subtitle: "The candidate's core information.",
    fields: [
      { key: "position", label: "Position Applied For", type: "select", optionsFrom: "positions", required: true },
      { key: "department", label: "Department", type: "select", optionsFrom: "departments", required: true },
      { key: "aadhaar", label: "Aadhaar Card Number", type: "text", placeholder: "12-digit Aadhaar number", aadhaarLookup: true, required: true },
      { key: "fullName", label: "Full Name", type: "text", required: true },
      { key: "dob", label: "Date of Birth", type: "date", required: true },
      { key: "age", label: "Age", type: "number", readOnly: true, compute: "ageFromDob" },
      { key: "gender", label: "Gender", type: "buttons", options: ["Male", "Female", "Prefer not to say"], required: true },
      { key: "marital", label: "Marital Status", type: "buttons", options: ["Single", "Married", "Other"], required: true },
      { key: "children", label: "Number of Children", type: "text", placeholder: "e.g. 0 / 2" },
      { key: "ownHouse", label: "Do you own a house?", type: "buttons", options: YN, required: true },
      { key: "homeLoan", label: "Outstanding Home Loan, if any", type: "text", showIf: { key: "ownHouse", value: "Yes" } },
      { key: "monthlyRent", label: "Monthly Rent", type: "text", showIf: { key: "ownHouse", value: "No" } },
      { key: "sizeOfHouse", label: "Size of House", type: "select", options: ["1 RK", "1 BHK", "2 BHK", "3 BHK"] },
      { key: "bathroom", label: "Bathroom", type: "select", options: ["Inside", "Outside"] },
      { key: "nativePlace", label: "Native Place", type: "text", required: true },
      { key: "mobile", label: "Mobile Number", type: "tel", required: true },
      { key: "location", label: "Location", type: "text", required: true },
      { key: "email", label: "Email Address", type: "email", required: true },
      { key: "interviewed6mo", label: "Interviewed by us in the last six months?", type: "buttons", options: YN, required: true },
      { key: "smoke", label: "Do you smoke?", type: "buttons", options: YN, required: true },
      { key: "alcohol", label: "Do you consume alcohol?", type: "buttons", options: YN, required: true },
      { key: "differentlyAbled", label: "Differently abled?", type: "buttons", options: YN, required: true },
      { key: "policeRecord", label: "Do you have a police record?", type: "buttons", options: YN, required: true },
      { key: "majorIllness", label: "History of any major illness?", type: "buttons", options: YN, required: true },
      { key: "source", label: "How did you learn about the opening?", type: "buttons", options: ["Newspaper Advertisement", "Company Website", "Friend or Relative", "Job Portal / HR Agency", "Social Media", "Other"] },
    ],
  },
  {
    id: "education",
    title: "Education",
    subtitle: "Add each qualification — 10th, 12th and beyond.",
    repeat: { min: 1, max: 5, seed: 2, itemLabel: "Qualification" },
    fields: EDU_FIELDS,
  },
  {
    id: "academic",
    title: "Academic Summary",
    fields: [
      { key: "gap", label: "Academic Gap", type: "buttons", options: YN, required: true },
      { key: "backlogs", label: "Number of Backlogs / ATKTs, if any", type: "text" },
    ],
  },
  {
    id: "currentWork",
    title: "Current Work Experience",
    subtitle: "Every field is required — capture the candidate's current role in full.",
    fields: [
      { key: "org", label: "Current Organization", type: "text" },
      { key: "designation", label: "Current Designation", type: "text" },
      { key: "reportsToDesignation", label: "Reports To (Designation)", type: "text" },
      { key: "reportsToName", label: "Reports To (Name)", type: "text" },
      { key: "reportees", label: "Number of People Reporting to You", type: "number" },
      { key: "totalExp", label: "Total Experience", type: "text", placeholder: "e.g. 3 yrs 2 mo" },
      { key: "fixedSalary", label: "Fixed Salary", type: "text" },
      { key: "bonus", label: "Bonus / Incentive", type: "text" },
      { key: "totalSalary", label: "Total Salary", type: "text" },
      { key: "expectedSalary", label: "Expected Salary", type: "text" },
      { key: "prevTimings", label: "Previous Job Working Timings", type: "text" },
      { key: "weekendWorking", label: "Saturday or Sunday Working", type: "text" },
      { key: "openSunday", label: "Open to Work on Sunday", type: "buttons", options: YN },
      { key: "totalJobs", label: "Total Number of Jobs", type: "number" },
      { key: "sitTill9", label: "Can you work till 9 PM?", type: "buttons", options: YN },
      { key: "languages", label: "Languages Known", type: "text" },
    ],
  },
  {
    id: "prevWork",
    title: "Previous Work Experience",
    subtitle: "Add each past employer — at least one entry is required.",
    repeat: { min: 1, max: 6, seed: 1, itemLabel: "Employer" },
    fields: PREV_WORK_FIELDS,
  },
  {
    id: "family",
    title: "Family Details",
    subtitle: "Add each family member.",
    repeat: { min: 1, max: 8, seed: 2, itemLabel: "Member" },
    fields: FAMILY_FIELDS,
  },
  {
    id: "declaration",
    title: "Declaration & Sign-off",
    subtitle: "Photograph, signature and recruiter remarks.",
    declaration: true,
    fields: [
      { key: "remarks", label: "Recruiter's Remarks", type: "textarea", required: true },
      { key: "name", label: "Recruiter's Name", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    subtitle: "Free-form interview notes — type them, or use Dictate to capture them by voice.",
    notes: true,
    fields: [
      { key: "notes", label: "Interview Notes", type: "textarea", required: true },
    ],
  },
];

/** Composite value key. */
export function vkey(sectionId: string, fieldKey: string, instance?: number): string {
  return instance == null ? `${sectionId}.${fieldKey}` : `${sectionId}.${instance}.${fieldKey}`;
}

/** {fieldKey -> current value} view of one flat (non-repeat) section — for showIf. */
function sectionView(s: IntakeSection, values: Record<string, string>): Record<string, string> {
  const view: Record<string, string> = {};
  for (const f of s.fields) view[f.key] = values[vkey(s.id, f.key)] ?? "";
  return view;
}

/** {fieldKey -> current value} view of one repeater instance — for showIf. */
function instanceView(s: IntakeSection, uid: string, values: Record<string, string>): Record<string, string> {
  const view: Record<string, string> = {};
  for (const f of s.fields) view[f.key] = values[`${s.id}.${uid}.${f.key}`] ?? "";
  return view;
}

/**
 * Required VALUE keys for one section. EVERY visible field is mandatory (see
 * isRequiredField); showIf-hidden fields (e.g. Home Loan vs Monthly Rent) and
 * derived fields (Age) are excluded, and repeaters require ALL of their current
 * instances — not just the first. Depends on `values` because visibility (and
 * therefore which keys count) changes as the form is filled.
 */
export function sectionRequiredKeys(
  s: IntakeSection,
  values: Record<string, string>,
  instances: Record<string, string[]>,
): string[] {
  if (s.repeat) {
    const ids = instances[s.id] ?? [];
    const out: string[] = [];
    for (const uid of ids) {
      for (const f of visibleFields(s.fields, instanceView(s, uid, values))) {
        if (isRequiredField(f)) out.push(`${s.id}.${uid}.${f.key}`);
      }
    }
    return out;
  }
  return visibleFields(s.fields, sectionView(s, values))
    .filter(isRequiredField)
    .map((f) => vkey(s.id, f.key));
}

/** All required value keys across the whole form. */
export function intakeRequiredKeys(
  values: Record<string, string>,
  instances: Record<string, string[]>,
): string[] {
  return INTAKE_SECTIONS.flatMap((s) => sectionRequiredKeys(s, values, instances));
}

/**
 * 0-100 completion %, counting required value keys plus the two Declaration
 * uploads (photo + signature). Used for the wizard progress bar AND the
 * draft/Records "X% done" labels, so they always agree.
 */
export function intakeProgress(
  values: Record<string, string>,
  instances: Record<string, string[]>,
  photoDone: boolean,
  signDone: boolean,
): number {
  const keys = intakeRequiredKeys(values, instances);
  let filled = keys.filter((k) => (values[k] ?? "").trim() !== "").length;
  const total = keys.length + 2;
  if (photoDone) filled++;
  if (signDone) filled++;
  return Math.round((filled / Math.max(total, 1)) * 100);
}

/** True once the form has ANY real content — the trigger to create the draft row. */
export function hasAnyContent(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => (v ?? "").trim() !== "");
}

/** Whole years between a yyyy-mm-dd date string and today; "" if unparseable. */
export function ageFromDob(dob: string): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

/**
 * Auto-pick the family member's Gender from their Relationship — e.g. "Brother"
 * → Male, "Younger Sister" → Female, "Father-in-law" → Male. Returns null for
 * gender-neutral / unknown relationships (Cousin, Spouse, Guardian, Sibling,
 * Friend…) so those stay manual. Substring match handles qualifiers like
 * "Elder", "Step", "Real", "In-law".
 */
export function genderForRelationship(rel: string): "Male" | "Female" | null {
  const r = rel.trim().toLowerCase();
  if (!r) return null;
  const MALE = ["father", "dad", "papa", "brother", "bro", "son", "husband", "hubby", "grandfather", "grandpa", "uncle", "nephew", "grandson"];
  const FEMALE = ["mother", "mom", "mum", "sister", "sis", "daughter", "wife", "grandmother", "grandma", "aunt", "niece", "granddaughter"];
  // Check MALE first — no female term is a substring of a male relationship.
  if (MALE.some((m) => r.includes(m))) return "Male";
  if (FEMALE.some((f) => r.includes(f))) return "Female";
  return null;
}
