/**
 * APPRAISAL — REVISED CTC LETTER — the annual-appraisal compensation revision.
 *
 * A warm recognition of the employee's performance, confirming the revised Cost
 * to Company effective from the appraisal date, with the previous → revised figure
 * and the increment called out, followed by the headline revised breakup. All ₹
 * figures are editable red fields pulled from the Compensation Workbench.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, term, signature } from "../types";

const template: LetterTemplate = {
  key: "appraisal-revised-ctc",
  title: "Appraisal — Revised CTC Letter",
  category: "compensation",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "Confirm an appraisal-driven CTC revision — previous, revised and increment.",
  blocks: [
    para(t("Dear "), f("employeeName", "Employee Name", { placeholder: "e.g. Ms. Rutvisha Mehta" }), t(",")),

    para(
      t(
        "We are pleased to acknowledge your valuable contribution and consistent performance over the past year. In recognition of the same, following your annual appraisal, we are delighted to revise your compensation as ",
      ),
      f("designation", "Designation", { placeholder: "e.g. Business Development Manager" }),
      t("."),
    ),

    heading("Revised Compensation", 2),
    term("Previous Cost to Firm (per annum)", f("previousCtc", "Previous CTC (per year)", { placeholder: "₹0" })),
    term("Revised Cost to Firm (per annum)", f("revisedCtc", "Revised CTC (per year)", { placeholder: "₹0" })),
    term("Increment", f("increment", "Increment", { placeholder: "e.g. ₹1,20,000 (18%)" })),
    term("Effective From", f("effectiveDate", "Effective Date", { placeholder: "e.g. 1 April 2026" })),

    heading("Revised Monthly Structure", 2),
    term("Gross Monthly Salary", f("grossMonthly", "Gross (per month)", { placeholder: "₹0" })),
    term("Net Take-Home (per month)", f("netMonthly", "Net Take-Home (per month)", { placeholder: "₹0" })),
    term("Revised Cost to Firm (per month)", f("ctcMonthly", "CTC (per month)", { placeholder: "₹0" })),

    para(
      t(
        "The detailed component-wise breakup of your revised CTC is enclosed as an annexure. All other terms and conditions of your employment remain unchanged.",
      ),
    ),

    para(
      t(
        "We congratulate you on your growth and thank you for your commitment. We are confident that you will continue to scale new heights with us.",
      ),
    ),

    para(t("Warm regards,")),

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
