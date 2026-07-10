// Onboarding form — the exact field set (Sir, 2026-07-10), 7 sections, 51
// fields incl. 8 file attachments and one conditional (current = permanent).
// Client-safe: drives both the fill form and the read-only view, and the
// server upload/validation, so there is ONE source of truth.

export type OnbFieldType = "text" | "tel" | "number" | "select" | "file";

export interface OnbField {
  key: string;
  label: string;
  type: OnbFieldType;
  required?: boolean;
  hint?: string;
  options?: string[]; // select
  half?: boolean; // render two-up on wide screens
}

export interface OnbSection {
  key: string;
  title: string;
  hint?: string;
  fields: OnbField[];
}

export const ONBOARDING_SECTIONS: OnbSection[] = [
  {
    key: "personal",
    title: "Personal Details",
    fields: [
      { key: "firstName", label: "First Name", type: "text", required: true, half: true },
      { key: "middleName", label: "Middle Name", type: "text", half: true },
      { key: "lastName", label: "Last Name", type: "text", required: true, half: true },
      { key: "phone", label: "Employee Phone No", type: "tel", required: true, half: true },
      { key: "selfie", label: "Attach Your Selfie (FaceCut · Plain Background)", type: "file", required: true },
    ],
  },
  {
    key: "previous",
    title: "Previous Employment",
    hint: "Write NA if this is your first job.",
    fields: [
      { key: "lastCtc", label: "Last Drawn Salary (Annual CTC · ₹)", type: "text", hint: "Write NA if first job", half: true },
      { key: "lastDesignation", label: "Designation", type: "text", half: true },
      { key: "lastCompanyName", label: "Last Company Name", type: "text", half: true },
      { key: "lastCompanyAddress", label: "Last Company Address", type: "text", half: true },
      { key: "lastSalaryCertificate", label: "Last Salary Certificate (attach)", type: "file", half: true },
      { key: "lastSalaryBankProof", label: "Last Salary Received in Bank — proof (attach)", type: "file", half: true },
    ],
  },
  {
    key: "verification",
    title: "Background Verification",
    hint: "Family and two references outside the family (friends / neighbours).",
    fields: [
      { key: "fatherName", label: "Father's Name", type: "text", required: true, half: true },
      { key: "fatherPhone", label: "Father's Phone No", type: "tel", half: true },
      { key: "motherName", label: "Mother's Name", type: "text", required: true, half: true },
      { key: "motherPhone", label: "Mother's Phone No", type: "tel", half: true },
      { key: "brotherName", label: "Brother's Name (if any)", type: "text", half: true },
      { key: "brotherPhone", label: "Brother's Phone No", type: "tel", half: true },
      { key: "sisterName", label: "Sister's Name (if any)", type: "text", half: true },
      { key: "sisterPhone", label: "Sister's Phone No", type: "tel", half: true },
      { key: "ref1Name", label: "Reference 1 Name (friend / neighbour)", type: "text", required: true, half: true },
      { key: "ref1Phone", label: "Reference 1 Phone No", type: "tel", required: true, half: true },
      { key: "ref2Name", label: "Reference 2 Name (friend / neighbour)", type: "text", half: true },
      { key: "ref2Phone", label: "Reference 2 Phone No", type: "tel", half: true },
    ],
  },
  {
    key: "permanent",
    title: "Permanent Address",
    fields: [
      { key: "permAddr1", label: "Address Line 1 (House / Building / Block, Society)", type: "text", required: true },
      { key: "permAddr2", label: "Address Line 2 (Road, Nagar)", type: "text" },
      { key: "permAddr3", label: "Address Line 3 (Area, Suburb)", type: "text" },
      { key: "permCity", label: "City", type: "text", required: true, half: true },
      { key: "permState", label: "State", type: "text", required: true, half: true },
      { key: "permPincode", label: "Pincode", type: "text", required: true, half: true },
      { key: "permLandmark", label: "Nearby Landmark", type: "text", half: true },
    ],
  },
  {
    key: "current",
    title: "Current Address",
    hint: "If same as permanent, choose YES — the fields below can be left as NA.",
    fields: [
      { key: "sameAsPermanent", label: "Same as Permanent Address?", type: "select", required: true, options: ["YES", "NO"] },
      { key: "currAddr1", label: "Address Line 1 (House / Building / Block, Society)", type: "text" },
      { key: "currAddr2", label: "Address Line 2 (Road, Nagar)", type: "text" },
      { key: "currAddr3", label: "Address Line 3 (Area, Suburb)", type: "text" },
      { key: "currCity", label: "City", type: "text", half: true },
      { key: "currState", label: "State", type: "text", half: true },
      { key: "currPincode", label: "Pincode", type: "text", half: true },
      { key: "currLandmark", label: "Nearby Landmark", type: "text", half: true },
    ],
  },
  {
    key: "identification",
    title: "Identification Details",
    fields: [
      { key: "latestSelfie", label: "Your Latest Selfie", type: "file", half: true },
      { key: "addressProof", label: "Address Proof (attach)", type: "file", half: true },
      { key: "aadharNo", label: "Aadhar Card No", type: "text", required: true, half: true },
      { key: "aadharCopy", label: "Aadhar Card Copy (attach)", type: "file", half: true },
      { key: "panNo", label: "PAN Card No", type: "text", required: true, half: true },
      { key: "panCopy", label: "PAN Card Copy (attach)", type: "file", half: true },
    ],
  },
  {
    key: "bank",
    title: "Bank Details",
    hint: "Salary will be credited to this account.",
    fields: [
      { key: "bankAccountName", label: "Bank Account Name", type: "text", required: true, half: true },
      { key: "bankAccountNo", label: "Bank Account No", type: "text", required: true, half: true },
      { key: "ifsCode", label: "IFS Code", type: "text", required: true, half: true },
      { key: "micrCode", label: "MICR Code", type: "text", half: true },
      { key: "branchAddress", label: "Branch Address", type: "text", half: true },
      { key: "branchCity", label: "Branch City", type: "text", half: true },
      { key: "branchPincode", label: "Branch Pincode", type: "text", half: true },
      { key: "cancelledCheque", label: "Cancelled Cheque Photo (attach)", type: "file", half: true },
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

export interface OnboardingFileRef {
  path: string;
  fileName: string;
  mime: string | null;
  size: number | null;
}
