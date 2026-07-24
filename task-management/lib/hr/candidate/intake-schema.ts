import type { FormFieldDef } from "@/lib/forms/field-types";

/**
 * Wizard schema for the Candidate Intake ("Altus Candidate Walk-in Interview
 * Form", 108 fields) — restructured into rail sections on top of the existing
 * FormFieldDef renderer. Repeated blocks (Education, Previous Work, Family)
 * become "add another" repeaters so the rail stays short.
 *
 * Runtime values are a flat Record<string,string> keyed:
 *   non-repeat:  `${sectionId}.${fieldKey}`
 *   repeater:    `${sectionId}.${instanceIndex}.${fieldKey}`
 * The Declaration photo/signature are file uploads handled outside FieldInput.
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
}

const YN: string[] = ["Yes", "No"];

const EDU_FIELDS: FormFieldDef[] = [
  { key: "degree", label: "Degree", type: "text", placeholder: "e.g. 10th / 12th / B.Com" },
  { key: "school", label: "Name of the School / College", type: "text" },
  { key: "board", label: "Board / University", type: "text" },
  { key: "mode", label: "Regular / Part-Time", type: "buttons", options: ["Regular", "Part-Time"] },
  { key: "passing", label: "Month & Year of Passing", type: "text", placeholder: "e.g. May 2019" },
  { key: "attempts", label: "No. of Attempts", type: "number" },
  { key: "percentage", label: "Percentage", type: "text", placeholder: "e.g. 78%" },
];

const FAMILY_FIELDS: FormFieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relationship", label: "Relationship", type: "text", required: true },
  { key: "sex", label: "Sex", type: "buttons", options: ["Male", "Female"], required: true },
  { key: "age", label: "Age", type: "number", required: true },
  { key: "occupation", label: "Occupation", type: "text", required: true },
];

const PREV_WORK_FIELDS: FormFieldDef[] = [
  { key: "from", label: "From", type: "date" },
  { key: "to", label: "To", type: "date" },
  { key: "org", label: "Organisation", type: "text" },
  { key: "designation", label: "Designation", type: "text" },
  { key: "reason", label: "Reason for Leaving", type: "textarea" },
  { key: "gap", label: "Career gap (if any)", type: "text" },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "personal",
    title: "Personal Details",
    subtitle: "The candidate's core information.",
    fields: [
      { key: "position", label: "Position Applied", type: "text", required: true },
      { key: "fullName", label: "Full Name", type: "text", required: true },
      { key: "dob", label: "Date of Birth", type: "date", required: true },
      { key: "age", label: "Age", type: "number", required: true },
      { key: "gender", label: "Gender", type: "buttons", options: ["Male", "Female", "Prefer not to say"], required: true },
      { key: "marital", label: "Marital Status", type: "buttons", options: ["Single", "Married", "Other"], required: true },
      { key: "children", label: "Children", type: "text" },
      { key: "ownedHouse", label: "Owned House", type: "buttons", options: YN },
      { key: "rented", label: "Rented", type: "buttons", options: YN },
      { key: "rent", label: "How Much Rent", type: "text" },
      { key: "nativePlace", label: "Native Place", type: "text", required: true },
      { key: "howBig", label: "How Big (family / house)", type: "text" },
      { key: "bathroom", label: "Bathroom", type: "buttons", options: ["In", "Out"] },
      { key: "mobile", label: "Mobile Number", type: "tel", required: true },
      { key: "currentLocation", label: "Current Location", type: "text", required: true },
      { key: "email", label: "E-mail Address", type: "email", required: true },
      { key: "interviewed6mo", label: "Interviewed by us in the last six months?", type: "buttons", options: YN, required: true },
      { key: "smoke", label: "Do you smoke?", type: "buttons", options: YN, required: true },
      { key: "alcohol", label: "Do you consume alcohol?", type: "buttons", options: YN, required: true },
      { key: "differentlyAbled", label: "Differently Abled?", type: "buttons", options: YN, required: true },
      { key: "policeRecord", label: "Do you have a police record?", type: "buttons", options: YN, required: true },
      { key: "majorIllness", label: "History of any major illness?", type: "buttons", options: YN, required: true },
      { key: "source", label: "How did you learn about the opening?", type: "buttons", options: ["Newspaper Advertisement", "Company Website", "Friend or Relative", "Job Portal / HR agency", "Social Media", "Other"] },
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
    subtitle: "Leave blank if the candidate is a fresher.",
    fields: [
      { key: "org", label: "Current Organization", type: "text" },
      { key: "designation", label: "Current Designation", type: "text" },
      { key: "reportsToDesignation", label: "Reports to (Designation)", type: "text" },
      { key: "reportsToName", label: "Reports to (Name)", type: "text" },
      { key: "reportees", label: "No. of People Reporting to You", type: "number" },
      { key: "totalExp", label: "Total Experience", type: "text", placeholder: "e.g. 3 yrs 2 mo" },
      { key: "fixedSalary", label: "Fixed Salary", type: "text" },
      { key: "bonus", label: "Bonus / Incentive", type: "text" },
      { key: "totalSalary", label: "Total Salary", type: "text" },
      { key: "expectedSalary", label: "Expected Salary", type: "text" },
      { key: "prevTimings", label: "Previous Job Working Timings", type: "text" },
      { key: "weekendWorking", label: "Saturday or Sunday Working", type: "text" },
      { key: "openSunday", label: "Open to work on Sunday", type: "buttons", options: YN },
      { key: "totalJobs", label: "Total No. of Jobs", type: "number" },
      { key: "sitTill9", label: "Can you sit till 9 pm?", type: "buttons", options: YN },
      { key: "languages", label: "Languages Known", type: "text" },
    ],
  },
  {
    id: "prevWork",
    title: "Previous Work Experience",
    subtitle: "Add each past employer.",
    repeat: { min: 0, max: 6, seed: 1, itemLabel: "Employer" },
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
      { key: "name", label: "Name (recruiter)", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
    ],
  },
];

/** Composite value key. */
export function vkey(sectionId: string, fieldKey: string, instance?: number): string {
  return instance == null ? `${sectionId}.${fieldKey}` : `${sectionId}.${instance}.${fieldKey}`;
}
