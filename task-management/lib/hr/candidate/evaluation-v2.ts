/**
 * CANDIDATE EVALUATION v2 — the declarative instrument definition.
 *
 * The single, PURE, CLIENT-SAFE source of truth for the structured candidate
 * evaluation ("Interview Intelligence Platform"). Eight sections across three
 * buckets, each with a defined input type. No server imports — the client
 * screens, the scoring core, the composite engine and the server actions all
 * read this. Load-neutral.
 *
 * 2026-07-28 — restructured to the 8-section Interview Intelligence spec
 * (Pre-Requisites · Base Expectations · Important Drivers · Technical Skills ·
 * Customer-Facing · Other Factors · Sales · Overall). Section/instance shapes
 * are ADDITIVE-superset of the old A–N model so stored blobs stay readable.
 */

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type EvalBucketId = "prerequisites" | "mandatory" | "evaluations";

/** How a section is filled. */
export type EvalInputKind =
  | "passfail" // Pre-Requisites — Yes / No / N-A rows (deal-breakers)
  | "rating" // 0..10 rows (+ Can't Say + notes, optional confidence)
  | "gate" // a multi-value gate that reveals its own ratings (Customer-Facing)
  | "overall"; // Overall — recommendation + manual gut 0..10

export interface EvalItem {
  id: string;
  label: string;
  /** Pre-Requisites only — a "No" here flags the candidate for review. */
  critical?: boolean;
}

/** A sub-group inside a section. */
export interface EvalGroup {
  /** Optional sub-heading. */
  label?: string;
  /** Optional relative weight of this sub-group within its section. */
  weight?: number;
  items: EvalItem[];
}

/** Multi-value gate config (Customer-Facing): the gate answer decides whether
 *  this section's ratings are shown / counted. */
export interface EvalGate {
  /** Stored in instance.gates[sectionId]. */
  label: string;
  options: { value: string; label: string }[];
  /** Gate values that REVEAL + count the section's ratings. */
  revealWhen: string[];
}

export interface EvalSection {
  /** Stable id (also the key ratings/passfail are stored under, per-item). */
  id: string;
  /** The display code (Interview Intelligence uses 1–8; kept as string). */
  code: string;
  title: string;
  bucket: EvalBucketId;
  input: EvalInputKind;
  /** Default macro weight (rating sections only; relative + renormalized). */
  weight?: number;
  /** Optional helper note shown under the heading. */
  note?: string;
  /** Rating sections: also capture an optional 0..10 Confidence per item. */
  hasConfidence?: boolean;
  /** Rating sections (Technical): also capture a "Practical Tested?" Yes/No per item. */
  hasPracticalTested?: boolean;
  /** Customer-Facing: a multi-value gate controlling its own ratings. */
  gate?: EvalGate;
  /** When true the whole section applies only to customer-facing / sales roles. */
  salesOnly?: boolean;
  groups: EvalGroup[];
}

/* ------------------------------------------------------------------ */
/* Buckets                                                              */
/* ------------------------------------------------------------------ */

export const EVAL_BUCKETS: { id: EvalBucketId; title: string; blurb: string }[] = [
  {
    id: "prerequisites",
    title: "Pre-Requisites",
    blurb: "Hygiene / deal-breakers — a critical ‘No’ (without a valid exception) flags the candidate for review.",
  },
  {
    id: "mandatory",
    title: "Mandatory Requirements",
    blurb: "Non-negotiable skills & tools needed to perform the basic function of the role.",
  },
  {
    id: "evaluations",
    title: "Evaluations & Judgments",
    blurb: "Qualitative assessment — rate 0–10 (or ‘Can’t Say’), with notes you can dictate.",
  },
];

/* ------------------------------------------------------------------ */
/* Section / group builders                                            */
/* ------------------------------------------------------------------ */

const g = (items: [string, string][]): EvalGroup => ({ items: items.map(([id, label]) => ({ id, label })) });
const gc = (items: [string, string, boolean?][]): EvalGroup => ({
  items: items.map(([id, label, critical]) => ({ id, label, critical: critical ?? false })),
});
/** Named sub-group with a relative weight (used by graded sub-groups). */
export const gl = (label: string, weight: number, items: [string, string][]): EvalGroup => ({
  label,
  weight,
  items: items.map(([id, label]) => ({ id, label })),
});

/* ------------------------------------------------------------------ */
/* The 8 sections                                                      */
/* ------------------------------------------------------------------ */

export const EVAL_SECTIONS: EvalSection[] = [
  /* ── 1 · Pre-Requisite Checklist (Pre-Requisites) ───────────────── */
  {
    id: "prerequisites",
    code: "1",
    title: "Pre-Requisite Confirmation",
    bucket: "prerequisites",
    input: "passfail",
    note: "Confirm each with the candidate. A critical ‘No’ (without a recorded exception) flags them for review.",
    groups: [
      gc([
        ["prereq-travel", "Travel Comfort", true],
        ["prereq-6days", "6 Days Working", true],
        ["prereq-timing", "10:30 AM – 7:30 PM", true],
        ["prereq-late", "Late Sitting till 8:30 PM (Twice Weekly)", false],
        ["prereq-sunday", "One Sunday Per Month", false],
        ["prereq-probation", "6 Months Probation", true],
        ["prereq-leave", "7 Days Paid Leave", false],
        ["prereq-training", "15 Days Pre-Employment Training", true],
        ["prereq-nonveg", "No Non-Veg Allowed", false],
        ["prereq-policies", "Policies to Sign", false],
        ["prereq-ctc", "CTC Only (No PF / Insurance)", true],
        ["prereq-travel-ctc", "Travel Included in CTC", false],
        ["prereq-attendance", "Attendance Policy Accepted", true],
        ["prereq-nowfh", "No Work From Home", true],
        ["prereq-smallfirm", "Comfortable Working in Small Firm", false],
        ["prereq-salary10", "Salary Credited on 10th", false],
      ]),
    ],
  },

  /* ── 2 · Base Expectations (Evaluations) ────────────────────────── */
  {
    id: "base",
    code: "2",
    title: "Base Expectations",
    bucket: "evaluations",
    input: "rating",
    weight: 20,
    hasConfidence: true,
    note: "Standardised 0–10 for each. Strength / Weakness indices compute automatically.",
    groups: [
      g([
        ["base-culture-fit", "Culture Fit"],
        ["base-honesty", "Honesty"],
        ["base-integrity", "Integrity"],
        ["base-family-bg", "Family Background"],
        ["base-family-values", "Family Values"],
        ["base-listening", "Listening"],
        ["base-retention", "Reproduction / Retention"],
        ["base-articulation", "Articulation"],
        ["base-verbal-english", "Verbal English"],
        ["base-written-english", "Written English"],
        ["base-explain", "Ability to Explain"],
        ["base-presence-of-mind", "Presence of Mind"],
        ["base-grooming", "Grooming"],
        ["base-hygiene", "Personal Hygiene"],
        ["base-not-opportunistic", "Not Opportunistic"],
      ]),
    ],
  },

  /* ── 3 · Important Drivers (Evaluations) ────────────────────────── */
  {
    id: "drivers",
    code: "3",
    title: "Important Drivers",
    bucket: "evaluations",
    input: "rating",
    weight: 25,
    note: "0–10 each. Leadership / Execution / Learning / Communication / Ownership scores roll up automatically.",
    groups: [
      g([
        ["drv-common-sense", "Common Sense"],
        ["drv-growth-mindset", "Growth Mindset"],
        ["drv-self-confidence", "Self Confidence"],
        ["drv-self-esteem", "Self Esteem"],
        ["drv-humility", "Humility"],
        ["drv-passion", "Passion"],
        ["drv-temperament", "Temperament"],
        ["drv-relevant-experience", "Relevant Experience"],
        ["drv-work-speed", "Work Speed"],
        ["drv-flexibility", "Flexibility"],
        ["drv-manners", "Manners"],
        ["drv-ownership", "Ownership"],
        ["drv-independence", "Independence"],
        ["drv-take-pressure", "Ability to Take Pressure"],
        ["drv-convince", "Ability to Convince"],
        ["drv-positive-attitude", "Positive Attitude"],
        ["drv-work-under-pressure", "Ability to Work Under Pressure"],
        ["drv-delegate", "Ability to Delegate"],
        ["drv-getwork-external", "Get Work Done from External People"],
        ["drv-getwork-subordinates", "Get Work Done from Subordinates"],
        ["drv-getwork-managers", "Get Work Done from Managers"],
        ["drv-knowledge-sharing", "Knowledge Sharing"],
        ["drv-problem-solving", "Problem Solving"],
        ["drv-hunger-to-learn", "Hunger to Learn"],
        ["drv-think", "Ability to Think"],
        ["drv-execute", "Ability to Execute"],
        ["drv-creativity", "Creativity"],
        ["drv-long-term", "Long-Term Player"],
        ["drv-loyalty", "Loyalty"],
      ]),
    ],
  },

  /* ── 4 · Technical Skills (Mandatory) ───────────────────────────── */
  {
    id: "technical",
    code: "4",
    title: "Technical Skills",
    bucket: "mandatory",
    input: "rating",
    weight: 15,
    hasPracticalTested: true,
    note: "Proficiency 0–10 + whether you practically tested it. Technical / Digital-Literacy / AI-Readiness compute automatically.",
    groups: [
      g([
        ["tech-typing", "Typing Speed"],
        ["tech-gdrive", "Google Drive"],
        ["tech-gsheet", "Google Spreadsheet"],
        ["tech-excel-basic", "Basic Excel"],
        ["tech-excel-adv", "Advanced Excel"],
        ["tech-ppt", "Basic PowerPoint"],
        ["tech-chatgpt", "ChatGPT"],
        ["tech-claude", "Claude"],
        ["tech-canva", "Canva"],
        ["tech-video", "Video Editing"],
        ["tech-digital-mktg", "Digital Marketing"],
      ]),
    ],
  },

  /* ── 5 · Customer-Facing Ability (Evaluations, gated) ───────────── */
  {
    id: "customer",
    code: "5",
    title: "Customer-Facing Ability",
    bucket: "evaluations",
    input: "gate",
    weight: 10,
    gate: {
      label: "Can Face Customer?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "not-sure", label: "Not Sure" },
        { value: "na", label: "N/A" },
      ],
      revealWhen: ["yes"],
    },
    note: "If they can face customers, rate the sub-abilities 0–10.",
    groups: [
      g([
        ["cf-confidence", "Confidence"],
        ["cf-communication", "Communication"],
        ["cf-professionalism", "Professionalism"],
        ["cf-presentation", "Presentation"],
        ["cf-listening", "Listening"],
        ["cf-handling-questions", "Handling Questions"],
      ]),
    ],
  },

  /* ── 6 · Other Factors (Evaluations) ────────────────────────────── */
  {
    id: "other",
    code: "6",
    title: "Other Factors",
    bucket: "evaluations",
    input: "rating",
    weight: 5,
    note: "0–10 each, with notes.",
    groups: [
      g([
        ["of-fixed-vs-incentive", "Fixed Salary vs Incentive Preference"],
        ["of-intuition", "Intuition"],
        ["of-x-factor", "X Factor"],
        ["of-wms-compliance", "WMS Compliance"],
      ]),
    ],
  },

  /* ── 7 · Sales Assessment (Evaluations, sales roles only) ───────── */
  {
    id: "sales",
    code: "7",
    title: "Sales Assessment",
    bucket: "evaluations",
    input: "rating",
    weight: 25,
    salesOnly: true,
    note: "Shown for Sales / customer-facing roles. 0–10 each → Sales Readiness score.",
    groups: [
      g([
        ["sales-call-200", "Willing to Call 200 People Daily"],
        ["sales-meetings-5", "Willing to Conduct 5 Physical Meetings Daily"],
        ["sales-convince", "Ability to Convince"],
        ["sales-influence", "Ability to Influence"],
        ["sales-explain", "Ability to Explain Clearly"],
        ["sales-collect-money", "Ability to Collect Money"],
        ["sales-persuasion", "Persuasion"],
        ["sales-references", "Reference Collection"],
        ["sales-verbal-presentation", "Verbal Presentation"],
        ["sales-demeanour", "Professional Demeanour"],
        ["sales-rejections", "Handling Rejections"],
        ["sales-justify-settle", "Justify vs Settle"],
        ["sales-stuck-reasons", "Gets Stuck in Reasons"],
        ["sales-creativity", "Sales Creativity"],
      ]),
    ],
  },

  /* ── 8 · Overall Assessment ─────────────────────────────────────── */
  {
    id: "overall",
    code: "8",
    title: "Overall Recommendation",
    bucket: "evaluations",
    input: "overall",
    note: "Composite scores compute automatically. Pick a recommendation — you can override it with a reason.",
    groups: [],
  },
];

/* ------------------------------------------------------------------ */
/* Section lookups + item id helpers                                   */
/* ------------------------------------------------------------------ */

export const SECTION_BY_ID: Record<string, EvalSection> = Object.fromEntries(
  EVAL_SECTIONS.map((s) => [s.id, s]),
);

/** Rating sections that carry a macro weight (base/drivers/technical/customer/other/sales). */
export const RATING_SECTIONS: EvalSection[] = EVAL_SECTIONS.filter(
  (s) => s.input === "rating" || s.input === "gate",
);

/** Every item id inside a section (across its groups). */
export function sectionItemIds(section: EvalSection): string[] {
  return section.groups.flatMap((grp) => grp.items.map((i) => i.id));
}

/** Every rating item id, flat — for progress counts. */
export const ALL_RATING_ITEM_IDS: string[] = RATING_SECTIONS.flatMap(sectionItemIds);

/** Every pre-requisite (pass/fail) item id. */
export const ELIGIBILITY_ITEM_IDS: string[] = sectionItemIds(SECTION_BY_ID.prerequisites!);

/** Critical pre-requisite ids — a "No" on any flags the candidate for review. */
export const CRITICAL_PREREQ_IDS: string[] = (SECTION_BY_ID.prerequisites?.groups ?? [])
  .flatMap((grp) => grp.items)
  .filter((i) => i.critical)
  .map((i) => i.id);

/* ------------------------------------------------------------------ */
/* Designations + default weights                                      */
/* ------------------------------------------------------------------ */

/** The rank ladder for per-designation weight profiles (Intern → Sr VP). */
export const DESIGNATION_LADDER = [
  "Intern",
  "Trainee",
  "Executive",
  "Sr Executive",
  "Assistant Manager",
  "Manager",
  "Sr Manager",
  "AVP",
  "VP",
  "Sr VP",
] as const;
export type Designation = (typeof DESIGNATION_LADDER)[number];

/** Section-id → default macro weight (relative; renormalized at score time). */
export const DEFAULT_SECTION_WEIGHTS: Record<string, number> = Object.fromEntries(
  RATING_SECTIONS.map((s) => [s.id, s.weight ?? 0]),
);

/* ------------------------------------------------------------------ */
/* Recommendation + text boxes                                         */
/* ------------------------------------------------------------------ */

export type RecommendationValue =
  | "strong-hire"
  | "hire"
  | "hold"
  | "borderline"
  | "reject"
  | "another-round";

export const RECOMMENDATIONS: { value: RecommendationValue; label: string; tone: string }[] = [
  { value: "strong-hire", label: "Strong Hire", tone: "#15803d" },
  { value: "hire", label: "Hire", tone: "#16a34a" },
  { value: "hold", label: "Hold", tone: "#64748b" },
  { value: "borderline", label: "Borderline", tone: "#d97706" },
  { value: "reject", label: "Reject", tone: "#dc2626" },
  { value: "another-round", label: "Require Another Round", tone: "#2563eb" },
];

export const TEXTBOX_FIELDS = [
  { id: "justification", label: "Recommendation Justification" },
  { id: "strengths", label: "Strengths" },
  { id: "riskAreas", label: "Risk Areas" },
  { id: "concerns", label: "Concerns" },
  { id: "lackOfClarity", label: "Lack of Clarity" },
] as const;
export type TextboxId = (typeof TEXTBOX_FIELDS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Evaluator role + the stored instance shape                          */
/* ------------------------------------------------------------------ */

export type EvaluatorRole = "interviewer" | "management";

export type PassFail = "yes" | "no" | "na";

/** A recommendation override event (audit trail). */
export interface OverrideEvent {
  /** The auto-computed recommendation being overridden (may be null). */
  from: RecommendationValue | null;
  /** The interviewer's chosen recommendation. */
  to: RecommendationValue;
  /** Mandatory reason. */
  reason: string;
  /** ISO timestamp. */
  at: string;
  /** Actor employee id (set server-side). */
  by?: string;
}

/** One filled evaluation instance (interviewer OR management). */
export interface EvaluationInstance {
  passfail: Record<string, PassFail>;
  /** item id → 0..10 (0.5 steps). */
  ratings: Record<string, number>;
  /** item id → 0..10 optional confidence (Base Expectations). */
  confidence?: Record<string, number>;
  /** item id → practically tested? (Technical Skills). */
  practicalTested?: Record<string, boolean>;
  /** section id → gate answer (Customer-Facing multi-value gate). */
  gates?: Record<string, string>;
  /** item ids explicitly marked "Can't Say" (excluded from averages). */
  cantSay: string[];
  /** per-item free notes (voice-dictated or typed). */
  notes: Record<string, string>;
  /** section-level notes (e.g. Pre-Requisite exceptions), keyed by section id. */
  sectionNotes: Record<string, string>;
  /** Overall manual gut 0..10. */
  overall: number | null;
  /** The interviewer's final recommendation (may be an override of the auto one). */
  recommendation: RecommendationValue | null;
  /** Set when `recommendation` diverges from the auto-computed one. */
  recommendationOverride?: OverrideEvent | null;
  /** Append-only audit of every override. */
  overrideHistory?: OverrideEvent[];
  /** AI-generated (then editable) insight summary blob. */
  aiInsights?: InterviewAiInsights | null;
  textboxes: Partial<Record<TextboxId, string>>;
  updatedAt?: string;
}

/** AI (or heuristic) interview summary — generated then editable before save. */
export interface InterviewAiInsights {
  summary: string;
  strengths: string[];
  concerns: string[];
  behavioural: string;
  technical: string;
  learningPotential: string;
  leadershipPotential: string;
  cultureMatch: string;
  roleSuitability: string;
  recommendedDepartment: string;
  trainingSuggestions: string[];
  salaryRange: string;
  nextRound: string;
  nextRoundQuestions: string[];
  riskFactors: string[];
  /** Provenance badge. */
  source: "ai" | "heuristic";
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** True once a human edited the generated text. */
  edited?: boolean;
}

export function emptyInstance(): EvaluationInstance {
  return {
    passfail: {},
    ratings: {},
    confidence: {},
    practicalTested: {},
    gates: {},
    cantSay: [],
    notes: {},
    sectionNotes: {},
    overall: null,
    recommendation: null,
    recommendationOverride: null,
    overrideHistory: [],
    aiInsights: null,
    textboxes: {},
  };
}

/** The full v2 blob stored on candidate_intake.evaluation_v2. */
export interface EvaluationV2 {
  interviewer?: EvaluationInstance;
  management?: EvaluationInstance;
}
