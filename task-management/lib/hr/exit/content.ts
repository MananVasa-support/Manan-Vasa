/**
 * Exit-form content — the exact questions, choice sets, rating aspects and
 * clearance items from Altus Corp's Annexure A (Handover & Clearance Checklist)
 * and Annexure B (Exit Interview Questionnaire). Kept as data so both the form
 * UI and the read-only review render from one source of truth.
 *
 * Pure module (no "use client"/"use server") — importable from either side.
 */

// ── Exit Interview Questionnaire (Annexure B) ──

export type ChoiceQuestion = {
  id: string;
  n: number;
  prompt: string;
  choices: string[];
  /** Add a free-text "Comments" box under the choice row. */
  comments?: boolean;
};

export type TextQuestion = { id: string; n: number; prompt: string };

/** Q1, Q6, Q7, Q9 — free-text only. */
export const EXIT_TEXT_QUESTIONS: Record<string, TextQuestion> = {
  q1: { id: "q1", n: 1, prompt: "What is your primary reason for leaving Altus Corp? (e.g., Better compensation, career growth, relocation, work environment)" },
  q6: { id: "q6", n: 6, prompt: "What did you like most about working at Altus Corp?" },
  q7: { id: "q7", n: 7, prompt: "If there is one thing you could change about the company or your team, what would it be?" },
  q9: { id: "q9", n: 9, prompt: "Any suggestions about the company?" },
};

/** Q2–Q5, Q8 — choice questions (some with a Comments box). */
export const EXIT_CHOICE_QUESTIONS: ChoiceQuestion[] = [
  { id: "q2", n: 2, prompt: "Did your role and responsibilities align with your expectations when you joined?", choices: ["Yes completely", "Somewhat", "No"], comments: true },
  { id: "q3", n: 3, prompt: "How would you rate your relationship with your immediate manager?", choices: ["Excellent", "Good", "Fair", "Poor"], comments: true },
  { id: "q4", n: 4, prompt: "Rate your experience with Manan Vasa and Management", choices: ["Excellent", "Good", "Fair", "Poor"], comments: true },
  { id: "q5", n: 5, prompt: "Do you feel you received adequate training, tools, and support to do your job effectively?", choices: ["Yes", "No"], comments: true },
  { id: "q8", n: 8, prompt: "Would you recommend Altus Corp as a good place to work to a friend?", choices: ["Yes", "No"] },
];

/** Q10 — 1 (Poor) → 5 (Excellent) rating matrix aspects, in document order. */
export const EXIT_RATING_ASPECTS: { id: string; label: string }[] = [
  { id: "role_expectations", label: "Role & responsibilities matched expectations" },
  { id: "manager_relationship", label: "Relationship with immediate manager" },
  { id: "management_experience", label: "Experience with Management (Manan Vasa)" },
  { id: "training_support", label: "Training, tools & support provided" },
  { id: "work_environment", label: "Work environment & culture" },
  { id: "compensation", label: "Compensation & benefits" },
  { id: "career_growth", label: "Career growth opportunities" },
  { id: "communication", label: "Communication within the organization" },
  { id: "overall", label: "Overall experience at Altus Corp" },
];

export const EXIT_RATING_LEGEND = ["1 — Poor", "2", "3", "4", "5 — Excellent"];

// ── Handover & Clearance Checklist (Annexure A) ──

export type ClearanceRow = {
  id: string;
  department: string;
  /** Checkable clearance line items. */
  items: { id: string; label: string }[];
};

export const CLEARANCE_ROWS: ClearanceRow[] = [
  {
    id: "reporting_manager",
    department: "Reporting Manager",
    items: [
      { id: "kt_document", label: "KT document reviewed and approved" },
      { id: "project_files", label: "Project files handed over" },
      { id: "client_intros", label: "Client introductions completed" },
      { id: "manager_approval", label: "Reporting manager approval" },
    ],
  },
  {
    id: "it_department",
    department: "IT Department",
    items: [
      { id: "assets_returned", label: "Laptop, charger, and mobile returned" },
      { id: "access_revoked", label: "Email and login system access revoked" },
    ],
  },
  {
    id: "human_resources",
    department: "Human Resources",
    items: [
      { id: "exit_interview", label: "Exit Interview completed" },
      { id: "address_confirmed", label: "Address confirmed for final documents" },
      { id: "fnf_verified", label: "F&F details verified" },
      { id: "relieving_letter", label: "Experience/Relieving letter process initiated" },
    ],
  },
];

export const HANDOVER_INSTRUCTIONS =
  "This checklist must be fully completed and signed by the respective department heads prior to the employee's final working day. Failure to submit this form will delay the Full and Final (F&F) Settlement.";

export const EXIT_CONFIDENTIALITY_NOTE =
  "The feedback provided here will be used solely to improve Altus Corp's work environment. It will not affect your relieving letter or final settlement.";
