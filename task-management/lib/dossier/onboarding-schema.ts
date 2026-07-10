// Onboarding form — the exact field set (Sir, 2026-07-10), 7 sections, 51
// fields incl. 8 attachments and one conditional (current = permanent).
// Client-safe: drives the fill form, the read-only view, AND the server
// upload/validation — ONE source of truth. Every field is compulsory; where a
// field can't apply (no sibling, current = permanent), the person types "NA".

export type OnbFieldType = "text" | "tel" | "number" | "select" | "file";

/** Rendered width, sized to the data (keeps the form compact — no full-width
 *  sprawl). sm ≈ short codes/names, md ≈ phones/city, lg ≈ company/refs,
 *  xl ≈ full-row addresses + attachments. */
export type OnbWidth = "sm" | "md" | "lg" | "xl";

export interface OnbField {
  key: string;
  label: string;
  type: OnbFieldType;
  required?: boolean;
  hint?: string;
  options?: string[]; // select
  w: OnbWidth;
}

export interface OnbSection {
  key: string;
  title: string;
  hint?: string;
  fields: OnbField[];
}

// Every field compulsory (r = required:true), width sized to its data.
const r = true;

export const ONBOARDING_SECTIONS: OnbSection[] = [
  {
    key: "personal",
    title: "Personal Details",
    fields: [
      { key: "firstName", label: "First Name", type: "text", required: r, w: "sm" },
      { key: "middleName", label: "Middle Name", type: "text", required: r, hint: "NA if none", w: "sm" },
      { key: "lastName", label: "Last Name", type: "text", required: r, w: "sm" },
      { key: "phone", label: "Phone No", type: "tel", required: r, w: "md" },
      { key: "selfie", label: "Selfie (FaceCut · Plain BG)", type: "file", required: r, w: "lg" },
    ],
  },
  {
    key: "previous",
    title: "Previous Employment",
    hint: "Write NA everywhere if this is your first job.",
    fields: [
      { key: "lastCtc", label: "Last Drawn CTC (₹/yr)", type: "text", required: r, hint: "NA if first job", w: "md" },
      { key: "lastDesignation", label: "Designation", type: "text", required: r, w: "md" },
      { key: "lastCompanyName", label: "Last Company Name", type: "text", required: r, w: "lg" },
      { key: "lastCompanyAddress", label: "Last Company Address", type: "text", required: r, w: "xl" },
      { key: "lastSalaryCertificate", label: "Last Salary Certificate", type: "file", required: r, w: "lg" },
      { key: "lastSalaryBankProof", label: "Last Salary — bank proof", type: "file", required: r, w: "lg" },
    ],
  },
  {
    key: "verification",
    title: "Background Verification",
    hint: "Family + two references outside the family (friends / neighbours). Type NA where not applicable.",
    fields: [
      { key: "fatherName", label: "Father's Name", type: "text", required: r, w: "md" },
      { key: "fatherPhone", label: "Father's Phone", type: "tel", required: r, w: "md" },
      { key: "motherName", label: "Mother's Name", type: "text", required: r, w: "md" },
      { key: "motherPhone", label: "Mother's Phone", type: "tel", required: r, w: "md" },
      { key: "brotherName", label: "Brother's Name", type: "text", required: r, hint: "NA if none", w: "md" },
      { key: "brotherPhone", label: "Brother's Phone", type: "tel", required: r, hint: "NA if none", w: "md" },
      { key: "sisterName", label: "Sister's Name", type: "text", required: r, hint: "NA if none", w: "md" },
      { key: "sisterPhone", label: "Sister's Phone", type: "tel", required: r, hint: "NA if none", w: "md" },
      { key: "ref1Name", label: "Reference 1 Name", type: "text", required: r, w: "md" },
      { key: "ref1Phone", label: "Reference 1 Phone", type: "tel", required: r, w: "md" },
      { key: "ref2Name", label: "Reference 2 Name", type: "text", required: r, w: "md" },
      { key: "ref2Phone", label: "Reference 2 Phone", type: "tel", required: r, w: "md" },
    ],
  },
  {
    key: "permanent",
    title: "Permanent Address",
    fields: [
      { key: "permAddr1", label: "Line 1 (House / Building / Society)", type: "text", required: r, w: "xl" },
      { key: "permAddr2", label: "Line 2 (Road / Nagar)", type: "text", required: r, w: "lg" },
      { key: "permAddr3", label: "Line 3 (Area / Suburb)", type: "text", required: r, w: "lg" },
      { key: "permCity", label: "City", type: "text", required: r, w: "sm" },
      { key: "permState", label: "State", type: "text", required: r, w: "sm" },
      { key: "permPincode", label: "Pincode", type: "text", required: r, w: "sm" },
      { key: "permLandmark", label: "Landmark", type: "text", required: r, w: "md" },
    ],
  },
  {
    key: "current",
    title: "Current Address",
    hint: "Choose YES if same as permanent — the fields fill automatically.",
    fields: [
      { key: "sameAsPermanent", label: "Same as Permanent?", type: "select", required: r, options: ["YES", "NO"], w: "sm" },
      { key: "currAddr1", label: "Line 1 (House / Building / Society)", type: "text", required: r, w: "xl" },
      { key: "currAddr2", label: "Line 2 (Road / Nagar)", type: "text", required: r, w: "lg" },
      { key: "currAddr3", label: "Line 3 (Area / Suburb)", type: "text", required: r, w: "lg" },
      { key: "currCity", label: "City", type: "text", required: r, w: "sm" },
      { key: "currState", label: "State", type: "text", required: r, w: "sm" },
      { key: "currPincode", label: "Pincode", type: "text", required: r, w: "sm" },
      { key: "currLandmark", label: "Landmark", type: "text", required: r, w: "md" },
    ],
  },
  {
    key: "identification",
    title: "Identification Details",
    fields: [
      { key: "latestSelfie", label: "Latest Selfie", type: "file", required: r, w: "lg" },
      { key: "addressProof", label: "Address Proof", type: "file", required: r, w: "lg" },
      { key: "aadharNo", label: "Aadhar Card No", type: "text", required: r, w: "md" },
      { key: "aadharCopy", label: "Aadhar Card Copy", type: "file", required: r, w: "lg" },
      { key: "panNo", label: "PAN Card No", type: "text", required: r, w: "sm" },
      { key: "panCopy", label: "PAN Card Copy", type: "file", required: r, w: "lg" },
    ],
  },
  {
    key: "bank",
    title: "Bank Details",
    hint: "Salary will be credited to this account.",
    fields: [
      { key: "bankAccountName", label: "Account Name", type: "text", required: r, w: "md" },
      { key: "bankAccountNo", label: "Account No", type: "text", required: r, w: "md" },
      { key: "ifsCode", label: "IFSC", type: "text", required: r, w: "sm" },
      { key: "micrCode", label: "MICR", type: "text", required: r, w: "sm" },
      { key: "branchAddress", label: "Branch Address", type: "text", required: r, w: "lg" },
      { key: "branchCity", label: "Branch City", type: "text", required: r, w: "sm" },
      { key: "branchPincode", label: "Branch Pincode", type: "text", required: r, w: "sm" },
      { key: "cancelledCheque", label: "Cancelled Cheque", type: "file", required: r, w: "lg" },
    ],
  },
];

export const ONB_ALL_FIELDS: OnbField[] = ONBOARDING_SECTIONS.flatMap((s) => s.fields);
export const ONB_FILE_KEYS: string[] = ONB_ALL_FIELDS.filter((f) => f.type === "file").map((f) => f.key);
export const ONB_TEXT_FIELDS: OnbField[] = ONB_ALL_FIELDS.filter((f) => f.type !== "file");
export const ONB_FIELD_BY_KEY = new Map<string, OnbField>(ONB_ALL_FIELDS.map((f) => [f.key, f]));

/** Permanent → current field pairs, used when "Same as Permanent" = YES. */
export const PERM_TO_CURR: [permKey: string, currKey: string][] = [
  ["permAddr1", "currAddr1"],
  ["permAddr2", "currAddr2"],
  ["permAddr3", "currAddr3"],
  ["permCity", "currCity"],
  ["permState", "currState"],
  ["permPincode", "currPincode"],
  ["permLandmark", "currLandmark"],
];

/** An attachment: either an uploaded file (path) OR a pasted link (Drive/URL). */
export interface OnboardingFileRef {
  path?: string; // storage key in the documents bucket (uploaded file)
  link?: string; // external URL (Google Drive / any link)
  fileName?: string;
  mime?: string | null;
  size?: number | null;
}

/** Accept list for the file picker — image / PDF / Word / Excel. */
export const ONB_ACCEPT = ".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv";

/** Flex sizing (basis / max px) per width bucket — keeps fields content-sized. */
export const ONB_WIDTH_PX: Record<OnbWidth, { basis: number; max: number | null }> = {
  sm: { basis: 130, max: 190 },
  md: { basis: 210, max: 300 },
  lg: { basis: 320, max: 480 },
  xl: { basis: 640, max: null },
};
