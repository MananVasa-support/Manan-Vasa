/**
 * CANDIDATE EVALUATION v2 — the declarative instrument definition.
 *
 * The single, PURE, CLIENT-SAFE source of truth for the structured candidate
 * evaluation used by BOTH the Candidate Evaluation Checklist (interviewer) and the
 * Management Assessment (management). Three buckets → sections A–N, each with a
 * defined input type. No server imports — the client screens, the scoring core and
 * the server actions all read this. Load-neutral.
 *
 * Design spec: docs/superpowers/specs/2026-07-27-candidate-evaluation-v2-design.md
 */

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type EvalBucketId = "prerequisites" | "mandatory" | "evaluations";

/** How a section is filled. */
export type EvalInputKind =
  | "passfail" // A — Yes / No / N-A rows (deal-breakers)
  | "rating" // B–J, M — 0..10 rows (+ Can't Say + notes)
  | "xfactor" // K — a single bonus 0..10 (outside the weighted average)
  | "gate" // L — Yes/No that gates a later section
  | "overall"; // N — a single manual 0..10 interviewer number

export interface EvalItem {
  id: string;
  label: string;
}

/** A sub-group inside a section (e.g. G's Problem-Solving / Ability-to-Execute). */
export interface EvalGroup {
  /** Optional sub-heading. */
  label?: string;
  /** Optional relative weight of this sub-group within its section (e.g. G = 5 / 5). */
  weight?: number;
  items: EvalItem[];
}

export interface EvalSection {
  /** Stable id (also the key ratings/passfail are stored under, per-item). */
  id: string;
  /** The display letter, A–N. */
  code: string;
  title: string;
  bucket: EvalBucketId;
  input: EvalInputKind;
  /** Default macro weight (rating sections only; relative + renormalized). */
  weight?: number;
  /** The section this one is gated by (section is hidden/skipped when the gate = "no"). */
  gatedBy?: string;
  /** Optional helper note shown under the heading. */
  note?: string;
  groups: EvalGroup[];
}

/* ------------------------------------------------------------------ */
/* Buckets                                                              */
/* ------------------------------------------------------------------ */

export const EVAL_BUCKETS: { id: EvalBucketId; title: string; blurb: string }[] = [
  {
    id: "prerequisites",
    title: "Pre-Requisites",
    blurb: "Hygiene / deal-breakers — a single ‘No’ (without a valid exception) means an immediate reject.",
  },
  {
    id: "mandatory",
    title: "Mandatory Requirements",
    blurb: "Non-negotiable skills & qualifications needed to perform the basic function of the role.",
  },
  {
    id: "evaluations",
    title: "Evaluations & Judgments",
    blurb: "Qualitative assessment — rate 0–10 (or ‘Can’t Say’), with notes you can dictate.",
  },
];

/* ------------------------------------------------------------------ */
/* Sections A–N                                                         */
/* ------------------------------------------------------------------ */

const g = (items: [string, string][]): EvalGroup => ({ items: items.map(([id, label]) => ({ id, label })) });
const gl = (label: string, weight: number, items: [string, string][]): EvalGroup => ({
  label,
  weight,
  items: items.map(([id, label]) => ({ id, label })),
});

export const EVAL_SECTIONS: EvalSection[] = [
  /* ── A · Eligibility / Non-Negotiables (Pre-Requisites) ─────────── */
  {
    id: "eligibility",
    code: "A",
    title: "Eligibility / Non-Negotiables",
    bucket: "prerequisites",
    input: "passfail",
    note: "Strict pass/fail. Any ‘No’ trips a deal-breaker unless a valid exception is recorded.",
    groups: [
      g([
        ["elig-policy-acceptance", "Company Policy Acceptance"],
        ["elig-travel", "Travel Comfort"],
        ["elig-6days", "6 Days Working"],
        ["elig-timing", "10:30–7:30 Timing"],
        ["elig-late", "Late Sitting"],
        ["elig-sunday", "Sunday Working (Occasional)"],
        ["elig-probation", "6 Months Probation"],
        ["elig-leave", "7 Days Leave"],
        ["elig-training", "15 Days Training"],
        ["elig-nowfh", "No WFH"],
        ["elig-smallfirm", "Small Firm Comfort"],
        ["elig-salary10", "Salary on 10th"],
        ["elig-attendance", "Attendance Policy"],
        ["elig-nonveg", "No Non-Veg"],
        ["elig-policies-sign", "Policies to Sign"],
        ["elig-ctc", "CTC Structure (No PF/Insurance)"],
      ]),
    ],
  },

  /* ── I · Technical Skills (Mandatory) ───────────────────────────── */
  {
    id: "technical",
    code: "I",
    title: "Technical Skills",
    bucket: "mandatory",
    input: "rating",
    weight: 10,
    groups: [
      g([
        ["tech-typing", "Typing Speed"],
        ["tech-drive", "Google Drive"],
        ["tech-sheets", "Google Sheets"],
        ["tech-excel-basic", "Basic Excel"],
        ["tech-excel-adv", "Advanced Excel"],
        ["tech-ppt", "PowerPoint"],
        ["tech-chatgpt", "ChatGPT"],
        ["tech-claude", "Claude"],
        ["tech-canva", "Canva"],
        ["tech-video", "Video Editing"],
        ["tech-digital-marketing", "Digital Marketing"],
        ["tech-drafting", "Drafting Skills"],
      ]),
    ],
  },

  /* ── J · Experience & Career Fit (Mandatory) ────────────────────── */
  {
    id: "experience",
    code: "J",
    title: "Experience & Career Fit",
    bucket: "mandatory",
    input: "rating",
    weight: 5,
    groups: [
      g([
        ["exp-relevant", "Relevant Experience"],
        ["exp-stability", "Career Stability"],
        ["exp-longterm", "Long-Term Potential"],
        ["exp-salary", "Salary Expectations"],
        ["exp-fixed-incentive", "Fixed vs Incentive Preference"],
        ["exp-manager-material", "Manager Material"],
      ]),
    ],
  },

  /* ── B · Communication ──────────────────────────────────────────── */
  {
    id: "communication",
    code: "B",
    title: "Communication",
    bucket: "evaluations",
    input: "rating",
    weight: 10,
    groups: [
      g([
        ["comm-listen", "Ability to Listen"],
        ["comm-retain", "Ability to Retain"],
        ["comm-articulation", "Articulation"],
        ["comm-explain", "Ability to Explain"],
        ["comm-verbal-english", "Verbal English"],
        ["comm-written-english", "Written English"],
        ["comm-reserved-outspoken", "Reserved vs Outspoken"],
        ["comm-under-over", "Under vs Over Communication"],
      ]),
    ],
  },

  /* ── C · Professional Presence ──────────────────────────────────── */
  {
    id: "presence",
    code: "C",
    title: "Professional Presence",
    bucket: "evaluations",
    input: "rating",
    weight: 5,
    groups: [
      g([
        ["pres-grooming", "Grooming"],
        ["pres-hygiene", "Personal Hygiene"],
        ["pres-confidence", "Confidence while speaking"],
        ["pres-presence-of-mind", "Lost vs Presence of Mind"],
        ["pres-customer-facing", "Customer Facing Ability"],
      ]),
    ],
  },

  /* ── D · Character Fit ──────────────────────────────────────────── */
  {
    id: "character",
    code: "D",
    title: "Character Fit",
    bucket: "evaluations",
    input: "rating",
    weight: 10,
    groups: [
      g([
        ["char-honesty", "Honesty"],
        ["char-integrity", "Integrity"],
        ["char-family-values", "Family Values"],
        ["char-manners", "Manners"],
        ["char-humility", "Humility"],
        ["char-positive", "Positive Attitude"],
        ["char-loyalty", "Loyalty"],
        ["char-longterm", "Long-term Player"],
        ["char-not-opportunistic", "Not Opportunistic"],
        ["char-selfless", "Self-Centered vs Selfless"],
      ]),
    ],
  },

  /* ── E · Culture Fit ────────────────────────────────────────────── */
  {
    id: "culture",
    code: "E",
    title: "Culture Fit",
    bucket: "evaluations",
    input: "rating",
    weight: 15,
    groups: [
      g([
        ["cult-customer", "Customer Centric"],
        ["cult-company", "Firm Centric"],
        ["cult-team", "Team Centric"],
        ["cult-ownership", "Ownership"],
        ["cult-responsibility", "Responsibility"],
        ["cult-knowledge-sharing", "Knowledge Sharing"],
        ["cult-flexibility", "Stubborn vs Flexible"],
        ["cult-altus-fit", "Altus Corp Value & Culture Fit"],
      ]),
    ],
  },

  /* ── F · Thinking, Learning Agility & Mindset ───────────────────── */
  {
    id: "thinking",
    code: "F",
    title: "Thinking, Learning Agility & Mindset",
    bucket: "evaluations",
    input: "rating",
    weight: 15,
    groups: [
      g([
        ["think-common-sense", "Common Sense"],
        ["think-ability-think", "Ability to Think"],
        ["think-grasping", "Grasping"],
        ["think-presence-mind", "Presence of Mind"],
        ["think-hunger", "Hunger to Learn"],
        ["think-growth", "Growth Mindset"],
        ["think-passion", "Passion"],
        ["think-feedback", "Sensitive to Feedback"],
        ["think-maturity", "Maturity"],
        ["think-self-confidence", "Self Confidence"],
        ["think-self-esteem", "Self Esteem"],
        ["think-intuition", "Intuition"],
      ]),
    ],
  },

  /* ── G · Execution Capability (sub-weighted 5 / 5) ──────────────── */
  {
    id: "execution",
    code: "G",
    title: "Execution Capability",
    bucket: "evaluations",
    input: "rating",
    weight: 10,
    groups: [
      gl("Problem Solving", 5, [
        ["exec-ps-orientation", "Solution ↔ Problem Orientation"],
        ["exec-ps-ability", "Problem-Solving Ability"],
        ["exec-ps-ideas", "Out-of-the-Box Ideas"],
        ["exec-ps-strategic", "Strategic Thinking"],
      ]),
      gl("Ability to Execute", 5, [
        ["exec-ex-speed", "Work Speed"],
        ["exec-ex-independent", "Works Independently"],
        ["exec-ex-initiative", "Takes Initiative"],
        ["exec-ex-temperament", "Temperament"],
        ["exec-ex-pressure", "Ability to Work Under Pressure"],
      ]),
    ],
  },

  /* ── H · Ability to Get Things Done ─────────────────────────────── */
  {
    id: "getthingsdone",
    code: "H",
    title: "Ability to Get Things Done",
    bucket: "evaluations",
    input: "rating",
    weight: 5,
    groups: [
      g([
        ["gtd-convince", "Ability to Convince"],
        ["gtd-external", "Gets Work Done from — External People"],
        ["gtd-peers", "Gets Work Done from — Peers"],
        ["gtd-managers", "Gets Work Done from — Managers"],
        ["gtd-subordinates", "Gets Work Done from — Subordinates"],
        ["gtd-delegate", "Ability to Delegate"],
      ]),
    ],
  },

  /* ── K · X-Factor (bonus, outside the weighted average) ─────────── */
  {
    id: "xfactor",
    code: "K",
    title: "X-Factor",
    bucket: "evaluations",
    input: "xfactor",
    note: "A standout, hard-to-quantify strength. Scored as a bonus outside the weighted average.",
    groups: [],
  },

  /* ── L · Responsibility to Sell? (gate for M) ───────────────────── */
  {
    id: "sell",
    code: "L",
    title: "Responsibility to Sell?",
    bucket: "evaluations",
    input: "gate",
    note: "If No, the Sales Competency section is skipped and its weight is dropped.",
    groups: [],
  },

  /* ── M · Sales Competency (gated by L) ──────────────────────────── */
  {
    id: "sales",
    code: "M",
    title: "Sales Competency",
    bucket: "evaluations",
    input: "rating",
    weight: 20,
    gatedBy: "sell",
    groups: [
      gl("Prospecting", 0, [
        ["sales-pros-call", "Willing to Call"],
        ["sales-pros-visit", "Willing to Visit Customers"],
        ["sales-pros-references", "Collect References"],
      ]),
      gl("Communication", 0, [
        ["sales-comm-persuasion", "Persuasion"],
        ["sales-comm-explanation", "Customer Explanation"],
        ["sales-comm-presentation", "Presentation"],
        ["sales-comm-demeanour", "Demeanour"],
      ]),
      gl("Closing", 0, [
        ["sales-close-money", "Money Collection"],
        ["sales-close-negotiation", "Negotiation"],
        ["sales-close-influence", "Influence Customer"],
      ]),
      gl("Resilience", 0, [
        ["sales-res-rejection", "Handles Rejection"],
        ["sales-res-justify", "Justify vs Settle"],
        ["sales-res-excuses", "Doesn't Get Stuck in Excuses"],
      ]),
      gl("Sales Thinking", 0, [
        ["sales-think-creativity", "Sales Creativity"],
        ["sales-think-instinct", "Closing Instinct"],
      ]),
    ],
  },

  /* ── N · Overall Interviewer Score ──────────────────────────────── */
  {
    id: "overall",
    code: "N",
    title: "Overall Interviewer Score",
    bucket: "evaluations",
    input: "overall",
    note: "Your single 0–10 gut number, shown alongside the computed weighted score.",
    groups: [],
  },
];

/* ------------------------------------------------------------------ */
/* Derived helpers                                                      */
/* ------------------------------------------------------------------ */

export const SECTION_BY_ID: Record<string, EvalSection> = Object.fromEntries(
  EVAL_SECTIONS.map((s) => [s.id, s]),
);

/** Rating sections that carry a macro weight (B–J, M). */
export const RATING_SECTIONS: EvalSection[] = EVAL_SECTIONS.filter((s) => s.input === "rating");

/** Every item id inside a section (across its groups). */
export function sectionItemIds(section: EvalSection): string[] {
  return section.groups.flatMap((grp) => grp.items.map((i) => i.id));
}

/** Every rating item id, flat — for progress counts. */
export const ALL_RATING_ITEM_IDS: string[] = RATING_SECTIONS.flatMap(sectionItemIds);

/** Every eligibility (pass/fail) item id. */
export const ELIGIBILITY_ITEM_IDS: string[] = sectionItemIds(SECTION_BY_ID.eligibility!);

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
  | "hire-with-concerns"
  | "hold"
  | "reject";

export const RECOMMENDATIONS: { value: RecommendationValue; label: string; tone: string }[] = [
  { value: "strong-hire", label: "Strong Hire", tone: "#15803d" },
  { value: "hire", label: "Hire", tone: "#16a34a" },
  { value: "hire-with-concerns", label: "Hire with Concerns", tone: "#d97706" },
  { value: "hold", label: "Hold", tone: "#64748b" },
  { value: "reject", label: "Reject", tone: "#dc2626" },
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

/** One filled evaluation instance (interviewer OR management). */
export interface EvaluationInstance {
  passfail: Record<string, PassFail>;
  /** item id → 0..10 (0.5 steps). */
  ratings: Record<string, number>;
  /** item ids explicitly marked "Can't Say" (excluded from averages). */
  cantSay: string[];
  /** per-item free notes (voice-dictated or typed). */
  notes: Record<string, string>;
  /** section-level notes (e.g. eligibility Exceptions), keyed by section id. */
  sectionNotes: Record<string, string>;
  xFactor: number | null;
  /** L — responsibility to sell. */
  sellResponsibility: boolean | null;
  /** N — overall interviewer 0..10. */
  overall: number | null;
  recommendation: RecommendationValue | null;
  textboxes: Partial<Record<TextboxId, string>>;
  updatedAt?: string;
}

export function emptyInstance(): EvaluationInstance {
  return {
    passfail: {},
    ratings: {},
    cantSay: [],
    notes: {},
    sectionNotes: {},
    xFactor: null,
    sellResponsibility: null,
    overall: null,
    recommendation: null,
    textboxes: {},
  };
}

/** The full v2 blob stored on candidate_intake.evaluation_v2. */
export interface EvaluationV2 {
  interviewer?: EvaluationInstance;
  management?: EvaluationInstance;
}
