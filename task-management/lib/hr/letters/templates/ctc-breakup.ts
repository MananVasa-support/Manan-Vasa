/**
 * CTC BREAKUP LETTER — the formal "Cost to the Company structure with break-up"
 * on the Altus letterhead, rebuilt to reproduce the real Altus CTC spreadsheet.
 *
 * The heart of the letter is a bordered TABLE (COMPONENTS · PER MONTH · PER
 * ANNUM): a "Pay Slip Salary" group of component rows (each an editable ₹ per-
 * month field + editable ₹ per-annum field, with an optional editable "% of
 * Basic" annotation), a SUB-TOTAL row and the grand "Net Salary (Take Home)"
 * row. A fixed PT note, an editable Notes area and an editable Growth Journey
 * area follow, then the e-sign signature block. Every ₹ figure is an editable
 * red field so the letter mirrors the Compensation Workbench numbers exactly —
 * the Workbench pre-fills them (skipping zero components); the prose is frozen.
 *
 * The component metadata (`CTC_LETTER_COMPONENTS`) is exported so the Workbench →
 * letter pre-fill (lib/hr/ctc/letter-prefill.ts) maps its numeric components onto
 * the exact field ids used below — one source of truth for the mapping.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import {
  type LetterTemplate,
  type TableRow,
  t,
  f,
  para,
  heading,
  term,
  table,
  tgroup,
  ttotal,
  tgrand,
  tcomponent,
  signature,
} from "../types";

/* ------------------------------------------------------------------ */
/* Component catalogue — the "Pay Slip Salary" rows                     */
/* ------------------------------------------------------------------ */

/** One CTC-letter component row + how it maps to the Workbench (for pre-fill). */
export interface CtcLetterComponent {
  /** Row label, e.g. "House Rent Allowance". */
  label: string;
  /** Editable per-month ₹ field id. */
  pmId: string;
  /** Editable per-annum ₹ field id. */
  paId: string;
  /** Editable "% of Basic" field id (omitted for Basic + statutory lines). */
  pctId?: string;
  /** Default percentage seed for `pctId`. */
  pctDefault?: string;
  /** Matching CTC-Workbench component id (omitted → no Workbench source). */
  workbenchId?: string;
}

/**
 * The pay-slip components, in the spreadsheet's order. Allowance rows carry an
 * editable "% of Basic" annotation (default 40%); Basic (the base) and the
 * statutory / travel / catch-all lines do not, to keep the letter uncluttered.
 */
export const CTC_LETTER_COMPONENTS: CtcLetterComponent[] = [
  { label: "Basic Salary", pmId: "basicPm", paId: "basicPa", workbenchId: "basic" },
  { label: "House Rent Allowance", pmId: "hraPm", paId: "hraPa", pctId: "hraPct", pctDefault: "40", workbenchId: "hra" },
  { label: "Statutory Bonus", pmId: "bonusPm", paId: "bonusPa", workbenchId: "bonus" },
  { label: "Medical Allowance", pmId: "medicalPm", paId: "medicalPa", pctId: "medicalPct", pctDefault: "40", workbenchId: "medical" },
  { label: "Attire Allowance", pmId: "attirePm", paId: "attirePa", pctId: "attirePct", pctDefault: "40" },
  { label: "Conveyance", pmId: "conveyancePm", paId: "conveyancePa", pctId: "conveyancePct", pctDefault: "40", workbenchId: "conveyance" },
  { label: "Special Allowance", pmId: "specialPm", paId: "specialPa", pctId: "specialPct", pctDefault: "40", workbenchId: "special" },
  { label: "Leave Travel Allowance (LTA)", pmId: "ltaPm", paId: "ltaPa", workbenchId: "lta" },
  { label: "Other Allowances", pmId: "otherPm", paId: "otherPa", workbenchId: "otherEarnings" },
];

/** The SUB-TOTAL + Net Salary field ids (the Workbench pre-fill targets these). */
export const CTC_LETTER_TOTALS = {
  subtotalPm: "subtotalPm",
  subtotalPa: "subtotalPa",
  netPm: "netPm",
  netPa: "netPa",
} as const;

/** The component-name cell — label + an optional editable "% of Basic" field. */
function nameCell(c: CtcLetterComponent) {
  if (!c.pctId) return [t(c.label)];
  return [
    t(`${c.label} (`),
    f(c.pctId, "%", { defaultValue: c.pctDefault, placeholder: "40" }),
    t("% of Basic)"),
  ];
}

/** Build every table row: group header → components → sub-total → net. */
function ctcRows(): TableRow[] {
  const rows: TableRow[] = [tgroup("A. Pay Slip Salary")];
  for (const c of CTC_LETTER_COMPONENTS) {
    rows.push(
      tcomponent(
        nameCell(c),
        [f(c.pmId, "Per month", { placeholder: "₹0" })],
        [f(c.paId, "Per annum", { placeholder: "₹0" })],
        c.pmId,
      ),
    );
  }
  rows.push(
    ttotal([
      [t("SUB-TOTAL")],
      [f(CTC_LETTER_TOTALS.subtotalPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_TOTALS.subtotalPa, "Per annum", { placeholder: "₹0" })],
    ]),
  );
  rows.push(
    tgrand([
      [t("B. Net Salary (Take Home)")],
      [f(CTC_LETTER_TOTALS.netPm, "Per month", { placeholder: "₹0" })],
      [f(CTC_LETTER_TOTALS.netPa, "Per annum", { placeholder: "₹0" })],
    ]),
  );
  return rows;
}

const NOTES_SEED =
  "1. Six months probation, six days working.\n2. Reimbursement of conveyance for client visits will be paid as per firm policy.";

const GROWTH_SEED = [
  "1. Learning Productivity Shastra Workshop worth Rs. 30,000/- in the first two months of joining (improves time management & productivity).",
  "2. Learning our flagship workshop, the Colloquium, worth Rs. 150,000/- in the first 3 months (goal-setting across life areas + tools to accomplish them).",
  "3. Exposure to a live case study on business owners' sales, operations & production challenges + strategy to overcome them.",
  "4. An opportunity to handle and hand-hold entrepreneurs from the 7th month.",
].join("\n");

const template: LetterTemplate = {
  key: "ctc-breakup",
  title: "CTC Breakup Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "The structured Cost-to-Firm annexure — component-wise pay-slip break-up.",
  blocks: [
    heading("COST TO THE FIRM STRUCTURE WITH BREAK-UP", 1),

    term("Name", f("employeeName", "Name", { placeholder: "e.g. Ms. Tanisha Shah" })),
    term("Designation", f("designation", "Designation", { placeholder: "e.g. Business Development Manager" })),

    table(["COMPONENTS", "PER MONTH", "PER ANNUM"], ctcRows()),

    para(
      t(
        "In February the PT will be Rs. 300/- as per govt PT rules; the rest of the months Rs. 200/-.",
      ),
    ),

    heading("Notes", 2),
    para(f("notes", "Notes", { multiline: true, defaultValue: NOTES_SEED })),

    heading("Growth Journey", 2),
    para(f("growthJourney", "Growth Journey", { multiline: true, defaultValue: GROWTH_SEED })),

    signature({
      forEntity: true,
      esign: true,
      name: [t("CA Manan Vasa")],
      designation: [f("signatoryDesignation", "Designation", { defaultValue: "Founder" })],
      showDate: true,
      place: [f("place", "Place", { defaultValue: "Mumbai" })],
    }),
  ],
};

export default template;
