// HR Letters / Documents engine — CLIENT-SAFE shared types. No server-only
// imports (db, node, env): this module is imported by both server actions and
// client editors/UI. The 26 canonical document types, their category grouping,
// and the structured-CTC field shapes all live here so the whole program agrees
// on one taxonomy.

/** A document's issue trigger — how it leaves HR. */
export type DocTrigger = "issued" | "email" | "request";

/** Whether/how a document must be signed or acknowledged. */
export type DocSignature = "none" | "acknowledge" | "esign";

/** The body model used to render the document. */
export type DocContent = "text" | "structured" | "certificate";

/**
 * Lifecycle of a composed document instance:
 *   draft        — composed, not yet issued
 *   sent         — issued (rendered PDF stored; emailed if trigger === 'email')
 *   acknowledged — recipient acknowledged (signature === 'acknowledge')
 *   signed       — e-signed (signature === 'esign', via document_signatures)
 */
export type DocStatus = "draft" | "sent" | "acknowledged" | "signed";
export const DOC_STATUSES: readonly DocStatus[] = [
  "draft",
  "sent",
  "acknowledged",
  "signed",
] as const;

/** The seven document families (categories A..G). */
export const HR_CATEGORIES = [
  "recruitment",
  "appointment",
  "policies",
  "compensation",
  "milestones",
  "requests",
  "separation",
] as const;
export type HrCategory = (typeof HR_CATEGORIES)[number];

/** Human labels for each category (UI section headings). */
export const CATEGORY_LABELS: Record<HrCategory, string> = {
  recruitment: "Recruitment & Interns",
  appointment: "Appointment & Agreements",
  policies: "Policies",
  compensation: "Compensation",
  milestones: "Milestones & Recognition",
  requests: "Requests",
  separation: "Separation",
};

/** One of the 26 canonical document types. `typeKey` is the stable identity. */
export interface DocType {
  typeKey: string;
  category: HrCategory;
  title: string;
  trigger: DocTrigger;
  signature: DocSignature;
  content: DocContent;
}

/**
 * THE 26 DOCUMENT TYPES — the single source of truth for the letters program.
 * (growth_journey is intentionally NOT here: it is part of the CTC structured
 * document, carried in CtcBreakup.growthJourney, not a standalone letter.)
 */
export const DOC_TYPES: readonly DocType[] = [
  // A — Recruitment & Interns
  { typeKey: "invitation_to_join", category: "recruitment", title: "Invitation to Join", trigger: "email", signature: "none", content: "text" },
  { typeKey: "rejection", category: "recruitment", title: "Rejection Letter", trigger: "email", signature: "none", content: "text" },
  { typeKey: "interns_letter", category: "recruitment", title: "Internship Letter", trigger: "issued", signature: "esign", content: "text" },
  { typeKey: "interns_certificate", category: "recruitment", title: "Internship Certificate", trigger: "issued", signature: "none", content: "certificate" },

  // B — Appointment & Agreements
  { typeKey: "appointment_letter", category: "appointment", title: "Appointment Letter", trigger: "issued", signature: "esign", content: "text" },
  { typeKey: "confidentiality", category: "appointment", title: "Confidentiality Agreement", trigger: "issued", signature: "esign", content: "text" },
  { typeKey: "training_confidentiality", category: "appointment", title: "Training Confidentiality Agreement", trigger: "issued", signature: "esign", content: "text" },
  { typeKey: "exit_clause", category: "appointment", title: "Exit Clause Agreement", trigger: "issued", signature: "esign", content: "text" },

  // C — Policies (acknowledge)
  { typeKey: "posh_policy", category: "policies", title: "POSH Policy", trigger: "issued", signature: "acknowledge", content: "text" },
  { typeKey: "professional_conduct", category: "policies", title: "Professional Conduct Policy", trigger: "issued", signature: "acknowledge", content: "text" },
  { typeKey: "clash_policy", category: "policies", title: "Conflict / Clash Policy", trigger: "issued", signature: "acknowledge", content: "text" },
  { typeKey: "attendance_policy", category: "policies", title: "Attendance Policy", trigger: "issued", signature: "acknowledge", content: "text" },
  { typeKey: "holidays_list", category: "policies", title: "Holidays List", trigger: "issued", signature: "acknowledge", content: "text" },

  // D — Compensation (structured)
  { typeKey: "ctc_breakup", category: "compensation", title: "CTC Breakup Letter", trigger: "issued", signature: "esign", content: "structured" },
  { typeKey: "promotion_ctc", category: "compensation", title: "Promotion — Revised CTC", trigger: "issued", signature: "esign", content: "structured" },
  { typeKey: "appraisal_ctc", category: "compensation", title: "Appraisal — Revised CTC", trigger: "issued", signature: "esign", content: "structured" },

  // E — Milestones & Recognition
  { typeKey: "free_training_completed", category: "milestones", title: "Free Training Completion Certificate", trigger: "issued", signature: "none", content: "certificate" },
  { typeKey: "probation_completed", category: "milestones", title: "Probation Completion Certificate", trigger: "issued", signature: "none", content: "certificate" },
  { typeKey: "employee_of_month", category: "milestones", title: "Employee of the Month", trigger: "issued", signature: "none", content: "certificate" },
  { typeKey: "birthday_anniversary", category: "milestones", title: "Birthday / Work Anniversary", trigger: "email", signature: "none", content: "text" },

  // F — Requests (employee → HR)
  { typeKey: "leave_request", category: "requests", title: "Leave Request", trigger: "request", signature: "none", content: "text" },
  { typeKey: "resignation_request", category: "requests", title: "Resignation Request", trigger: "request", signature: "none", content: "text" },

  // G — Separation
  { typeKey: "resignation_accepted", category: "separation", title: "Resignation Acceptance", trigger: "issued", signature: "none", content: "text" },
  { typeKey: "resignation_rejected", category: "separation", title: "Resignation Rejection", trigger: "issued", signature: "none", content: "text" },
  { typeKey: "ffs_letter", category: "separation", title: "Full & Final Settlement Letter", trigger: "issued", signature: "esign", content: "text" },
  { typeKey: "handover_letter", category: "separation", title: "Handover Letter", trigger: "issued", signature: "esign", content: "text" },
];

const BY_KEY = new Map<string, DocType>(DOC_TYPES.map((d) => [d.typeKey, d]));

/** Look up a document type by its stable key (undefined if unknown). */
export function getDocType(typeKey: string): DocType | undefined {
  return BY_KEY.get(typeKey);
}

/** True when a string is one of the 26 canonical document type keys. */
export function isDocTypeKey(v: string): boolean {
  return BY_KEY.has(v);
}

/** The document types belonging to a category, in canonical order. */
export function docTypesByCategory(category: HrCategory): DocType[] {
  return DOC_TYPES.filter((d) => d.category === category);
}

/* ------------------------------------------------------------------ */
/* Structured CTC (category D — the NEW HR compensation engine)         */
/* ------------------------------------------------------------------ */

/**
 * A single named allowance line inside the CTC structure.
 * `amount` is a numeric-as-string (money is numeric(14,2) as strings).
 */
export interface CtcAllowance {
  name: string;
  amount: string;
}

/**
 * The 20-field CTC structure stored in `ctc_breakups.fields`. Money fields are
 * numeric-as-string. RENDER RULE: any numeric field whose value is 0 / empty is
 * HIDDEN in the rendered CTC letter. Names, amounts and %s are all editable;
 * `otherAllowances` and `notes` are add/edit/delete lists.
 */
export interface CtcFields {
  employeeName: string;
  designation: string;
  dateOfJoining: string;
  reportingManager: string;
  /** headline % (per month) */
  pctPerMonth: string;
  /** headline % (per annum) */
  pctPerAnnum: string;
  basic: string;
  hra: string;
  statutoryBonus: string;
  medical: string;
  attire: string;
  otherAllowances: CtcAllowance[];
  professionalTax: string;
  providentFund: string;
  incomeTax: string;
  netSalary: string;
  retentionBonus: string;
  costToCompany: string;
  notes: string[];
  extraNotes: string;
}

/** The reason a CTC version was created. */
export type CtcReason = "initial" | "promotion" | "appraisal";
export const CTC_REASONS: readonly CtcReason[] = ["initial", "promotion", "appraisal"] as const;

/**
 * One entry in an employee's growth-journey timeline (stored in
 * `ctc_breakups.growth_journey`). The client manages undo/redo over this list.
 */
export interface GrowthStep {
  id: string;
  date: string;
  title: string;
  detail: string;
}

/** An empty, well-typed CTC structure — a safe default for new versions/forms. */
export function emptyCtcFields(): CtcFields {
  return {
    employeeName: "",
    designation: "",
    dateOfJoining: "",
    reportingManager: "",
    pctPerMonth: "",
    pctPerAnnum: "",
    basic: "",
    hra: "",
    statutoryBonus: "",
    medical: "",
    attire: "",
    otherAllowances: [],
    professionalTax: "",
    providentFund: "",
    incomeTax: "",
    netSalary: "",
    retentionBonus: "",
    costToCompany: "",
    notes: [],
    extraNotes: "",
  };
}
