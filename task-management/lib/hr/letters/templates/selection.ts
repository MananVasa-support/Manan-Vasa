/**
 * SELECTION / OFFER LETTER — the 2-page Altus offer letter.
 *
 * Transcribed verbatim from the Altus Group offer letter: a warm welcome, the
 * offered position at an Altus entity, the key terms of employment (Department,
 * Reporting Manager, Designation, Probation Period, Salary during / after
 * probation), the Performance Incentives section (referral % + probation Monthly
 * Business Target), the Joining Formalities + onboarding-documents list and the
 * onboarding-form link, closing with the "For <entity>" e-sign block.
 *
 * Every RED value in the source is an f() editable field; all other prose is
 * FROZEN. Field ids are reused where a value repeats (e.g. `position` in the
 * offer sentence and the Designation row) so they stay in sync.
 *
 * PURE + CLIENT-SAFE — imports only ../types. Load-neutral.
 */

import { type LetterTemplate, t, f, para, heading, term, bullets, signature } from "../types";

const template: LetterTemplate = {
  key: "selection",
  title: "Selection Letter",
  category: "recruitment",
  entityDefault: "altus-corp",
  signature: "esign",
  blurb: "The full offer letter: position, terms, incentives and onboarding.",
  blocks: [
    para(t("Dear "), f("candidateName", "Candidate Name", { placeholder: "e.g. Mr. Raj Ragpasare" }), t(",")),

    para(
      t("We are delighted to welcome you to Altus Group and are pleased to offer you the position of "),
      f("position", "Position", { placeholder: "e.g. Business Development Manager" }),
      t(" at "),
      f("offerEntity", "Entity", { defaultValue: "Unleashed" }),
      t(
        " (Altus Group entity). We look forward to having you as a part of our growing team and are confident that your skills and experience will contribute to our continued success.",
      ),
    ),

    para(t("Please find below the key terms of your employment:")),

    term("Department", f("department", "Department", { placeholder: "e.g. Solutions Architecture" })),
    term("Reporting Manager", f("reportingManager", "Reporting Manager", { placeholder: "e.g. Mr. Rohan Choudhary" })),
    term("Designation", f("designation", "Designation", { placeholder: "e.g. Business Development Manager" })),
    term("Probation Period", t("6 Months")),
    term("Salary during Probation", [
      f("salaryProbation", "Salary (During Probation)", { placeholder: "e.g. ₹45,000 per month" }),
      t("   (During Probation Period)"),
    ]),
    term("Salary after Probation", [
      f("salaryConfirmed", "Salary (After Probation)", { placeholder: "e.g. ₹50,000 per month" }),
      t("   (After Probation Period)"),
    ]),

    heading("Performance Incentives:", 2),

    para(
      t("Detailed Performance Incentive Structure will be shared with you during the course of your induction training or after "),
      f("inductionDays", "Induction Period", { defaultValue: "7 days" }),
      t(" of your joining."),
    ),

    para(
      t("For business generated through your personal connections or references, you will be entitled to "),
      f("referralPct", "Referral %", { defaultValue: "20%" }),
      t(
        " of the converted business amount, subject to company policies and successful realization of payments.",
      ),
    ),

    para(
      t("During your Probation Period, your Monthly Business Target will be "),
      f("monthlyTarget", "Monthly Business Target", { placeholder: "e.g. ₹9,00,000" }),
      t("."),
    ),

    para(
      t(
        "You will become eligible for Performance incentives only after achieving the prescribed threshold limit, if any.",
      ),
    ),

    para(
      t(
        "Performance Incentives will be calculated on a monthly cumulative basis and paid according to the applicable incentive slabs after the threshold, if any, has been crossed.",
      ),
    ),

    heading("Joining Formalities:", 2),

    para(t("To complete your onboarding process, kindly provide the following:")),

    bullets(
      [t("A copy of your resignation acceptance letter or relieving letter from your current/previous employer.")],
      [t("Confirmation of your proposed joining date.")],
    ),

    para(
      t("Kindly fill the Onboarding Form in 2 working days from receipt of this email using the link below."),
    ),

    para(
      f("joiningDocsLink", "Onboarding Form Link", {
        defaultValue: "https://forms.gle/eLsQ8rWLg9MQEEfQ6",
      }),
    ),

    para(
      t(
        "You will require your Aadhar Card, Pan Card, Passport Size Photo, Cancelled Cheque of your Bank Account and your Previous Employment History to fill the Onboarding Form.",
      ),
    ),

    para(
      t(
        "Once we receive the above documents and your joining date confirmation, we will proceed with the remaining onboarding formalities.",
      ),
    ),

    para(
      t(
        "We are excited to have you join Altus Corp and look forward to a successful and rewarding professional journey together.",
      ),
    ),

    para(
      t("If you have any questions, please feel free to contact "),
      f("contactPerson1", "Contact 1", { defaultValue: "Ms. Rutvisha Mehta 9987741410" }),
      t(" or "),
      f("contactPerson2", "Contact 2", { defaultValue: "Ms. Ruchita Ambre 9167110410" }),
      t(". Kindly respond to this email with a confirmation from your side."),
    ),

    para(t("Regards,")),

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
