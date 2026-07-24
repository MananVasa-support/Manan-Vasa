// HR Letters / Documents engine — DEFAULT editable bodies for all 26 document
// types. CLIENT-SAFE (no server-only). These are the FIRST-LOAD defaults the
// applier (scripts/apply-0152-hr-letters.ts) upserts into `letter_templates`.
// Admins edit them in-app afterwards; the fixed Altus frame + signature block
// live in the renderer, so these bodies are ONLY the editable middle.
//
// Bodies use {{mergeFields}} (see lib/hr-docs/merge.ts MERGE_FIELDS). Structured
// CTC types (ctc_breakup / promotion_ctc / appraisal_ctc) render from the CtcFields
// structure, not this body — their body is a short intro paragraph only.

import { DOC_TYPES } from "./types";

export interface DefaultTemplate {
  title: string;
  bodyMd: string;
}

/** typeKey → { title, bodyMd } default. One entry per DOC_TYPES key. */
export const DEFAULT_TEMPLATE_BODIES: Record<string, DefaultTemplate> = {
  // ── A — Recruitment & Interns ──────────────────────────────────────────────
  invitation_to_join: {
    title: "Invitation to Join",
    bodyMd: `Dear {{name}},

We are delighted to invite you to join **{{company}}** as **{{designation}}**. Your skills and attitude stood out through our conversations, and we are confident you will thrive here.

Your proposed date of joining is **{{joiningDate}}**. Ahead of that, our HR team will share your appointment letter, onboarding details and the documents we'll need from you.

Please confirm your acceptance by replying to this email. We look forward to welcoming you aboard.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  rejection: {
    title: "Rejection Letter",
    bodyMd: `Dear {{name}},

Thank you for taking the time to interview with **{{company}}** for the **{{designation}}** role and for your interest in joining us.

After careful consideration, we have decided to move forward with other candidates whose profile more closely matched our current requirements. This was not an easy decision — the standard of applicants was high.

We genuinely wish you the very best in your career and encourage you to apply for future openings that fit your strengths.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  interns_letter: {
    title: "Internship Letter",
    bodyMd: `Dear {{name}},

We are pleased to offer you an internship with **{{company}}** in the capacity of **{{designation}}**, commencing **{{joiningDate}}**.

During your internship you will work with the {{department}} team and be guided by **{{reportingManager}}**. This is a learning-focused engagement; you are expected to maintain professionalism, confidentiality and regular attendance throughout.

Please sign below to confirm your acceptance of this internship and its terms.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  interns_certificate: {
    title: "Internship Certificate",
    bodyMd: `This is to certify that **{{name}}** successfully completed an internship as **{{designation}}** with **{{company}}**, concluding on **{{date}}**.

During this period, {{firstName}} contributed diligently to the {{department}} team, demonstrating a strong willingness to learn and a professional approach to the work assigned.

We wish {{firstName}} continued success in every future endeavour.

{{hrName}}
Human Resources, {{company}}`,
  },

  offer_letter: {
    title: "Selection Letter",
    bodyMd: `Dear {{name}},

We are pleased to offer you the position of **{{designation}}** at **{{company}}**. Following our interview process, we were impressed by your capabilities and believe you will be a strong addition to our team.

Your proposed date of joining is **{{joiningDate}}**, with a cost-to-company of **{{ctc}}** per annum. The detailed compensation structure, appointment letter and joining formalities will follow on your acceptance of this offer.

Kindly confirm your acceptance by replying to this email. We look forward to welcoming you to {{company}}.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  assignment_letter: {
    title: "Assignment Letter",
    bodyMd: `Dear {{name}},

Thank you for your continued interest in the **{{designation}}** role at **{{company}}**. As the next step in our selection process, we would like you to complete a short assignment so we can better understand your approach and skills.

**Assignment:** _____________________
**Submit by:** _____________________

Please share your completed work by replying to this email. Do reach out if you have any questions — we're happy to help.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  next_round_call: {
    title: "Next Round Invitation",
    bodyMd: `Dear {{name}},

Thank you for your time so far in our selection process for the **{{designation}}** role at **{{company}}**. We're pleased to let you know that you have progressed to the next round.

**Round:** _____________________
**Date & time:** _____________________
**Mode / venue:** _____________________

Please confirm your availability by replying to this email. We look forward to speaking with you again.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },

  // ── B — Appointment & Agreements ───────────────────────────────────────────
  appointment_letter: {
    title: "Appointment Letter",
    bodyMd: `Dear {{name}},

We are pleased to confirm your appointment at **{{company}}** as **{{designation}}**, effective **{{joiningDate}}**. You will be part of the {{department}} team and report to **{{reportingManager}}**.

Your cost-to-company is **{{ctc}}** per annum, detailed in the accompanying CTC breakup. You will serve an initial probation of **{{probationMonths}}** months. On separation, a notice period of **{{noticePeriod}}** applies.

Your employment is governed by the company's policies on conduct, confidentiality and attendance, which you will acknowledge separately. We are excited to have you with us and look forward to your contribution.

Please sign below to confirm your acceptance.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  confidentiality: {
    title: "Confidentiality Agreement",
    bodyMd: `This Confidentiality Agreement is entered into between **{{company}}** and **{{name}}** ("the Employee") as of **{{date}}**.

1. **Confidential Information.** The Employee will have access to proprietary and confidential information including client data, financials, strategies, processes and trade secrets ("Confidential Information").

2. **Obligation.** The Employee shall not, during or after employment, disclose, copy or use any Confidential Information except as required to perform their duties for {{company}}.

3. **Return of Materials.** On separation, the Employee shall return all documents, devices and materials containing Confidential Information.

4. **Survival.** These obligations survive the termination of employment.

By signing below, the Employee acknowledges and agrees to be bound by this Agreement.

{{name}}
{{designation}}, {{company}}`,
  },
  training_confidentiality: {
    title: "Training Confidentiality Agreement",
    bodyMd: `This Training Confidentiality Agreement is made between **{{company}}** and **{{name}}** as of **{{date}}**.

In the course of training, the Employee will be exposed to proprietary training material, methodologies, tools and know-how ("Training Material"). The Employee agrees:

1. To treat all Training Material as strictly confidential and to use it solely for the purpose of their engagement with {{company}}.

2. Not to reproduce, distribute or share any Training Material with third parties, whether during or after the training or employment.

3. That all Training Material remains the exclusive property of {{company}}.

By signing below, the Employee accepts these terms.

{{name}}
{{designation}}, {{company}}`,
  },
  exit_clause: {
    title: "Exit Clause Agreement",
    bodyMd: `This Exit Clause Agreement between **{{company}}** and **{{name}}** sets out the terms that apply on separation, as of **{{date}}**.

1. **Notice.** Either party may terminate this engagement by serving a notice period of **{{noticePeriod}}**, or salary in lieu thereof.

2. **Handover.** The Employee shall complete a full handover of responsibilities, assets and documents before their last working day.

3. **Post-exit obligations.** Confidentiality and non-solicitation obligations continue to apply after separation.

4. **Full & final settlement.** Dues will be settled in accordance with company policy following clearance.

By signing below, the Employee acknowledges and accepts these exit terms.

{{name}}
{{designation}}, {{company}}`,
  },

  // ── C — Policies (acknowledge) ─────────────────────────────────────────────
  posh_policy: {
    title: "POSH Policy",
    bodyMd: `**Prevention of Sexual Harassment (POSH) Policy — {{company}}**

{{company}} is committed to providing a safe, respectful workplace free from sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.

- Sexual harassment of any kind — physical, verbal, visual or digital — is strictly prohibited.
- Any employee who believes they have been harassed may report the matter to the Internal Committee (IC) in confidence.
- Complaints are handled promptly, fairly and without retaliation against the complainant.
- Proven misconduct results in disciplinary action up to and including termination.

By acknowledging below, **{{name}}** confirms having read and understood this policy.`,
  },
  professional_conduct: {
    title: "Professional Conduct Policy",
    bodyMd: `**Professional Conduct Policy — {{company}}**

Every member of {{company}} is expected to uphold the highest standards of professionalism and integrity:

- Treat colleagues, clients and partners with courtesy and respect.
- Act honestly, avoid conflicts of interest, and protect company and client interests.
- Represent {{company}} responsibly, including on digital and social platforms.
- Comply with all company policies and applicable laws.

Breaches of this policy may lead to disciplinary action.

By acknowledging below, **{{name}}** confirms having read and agreed to abide by this policy.`,
  },
  clash_policy: {
    title: "Conflict / Clash Policy",
    bodyMd: `**Conflict of Interest & Clash Policy — {{company}}**

To protect the interests of {{company}} and its clients, employees must:

- Disclose any personal, financial or family interest that could conflict with their duties.
- Refrain from engaging in outside work or business that competes with, or clashes with, {{company}}'s interests.
- Avoid using company resources, relationships or information for personal gain.
- Escalate any perceived conflict to their manager or HR at the earliest.

Undisclosed conflicts are treated as serious misconduct.

By acknowledging below, **{{name}}** confirms understanding and acceptance of this policy.`,
  },
  attendance_policy: {
    title: "Attendance Policy",
    bodyMd: `**Attendance Policy — {{company}}**

Consistent attendance keeps our teams and clients well served. Employees are expected to:

- Report on time as per their working hours and mark attendance daily.
- Apply for leave in advance through the approved process, except in genuine emergencies.
- Maintain the minimum working hours; repeated late marks or short hours may attract deductions per policy.
- Inform their reporting manager promptly in case of unplanned absence.

By acknowledging below, **{{name}}** confirms having read and understood the attendance policy.`,
  },
  holidays_list: {
    title: "Holidays List",
    bodyMd: `**Holidays List — {{company}}**

Please find below the list of holidays observed by {{company}} for the current year. Optional / restricted holidays, where applicable, may be availed as per policy.

_The official holiday calendar is maintained by HR and shared alongside this letter. Regional or client-specific variations, if any, will be communicated separately._

By acknowledging below, **{{name}}** confirms receipt of the holidays list.

{{hrName}}
Human Resources, {{company}}`,
  },

  // ── D — Compensation (structured; body is a short intro only) ──────────────
  ctc_breakup: {
    title: "CTC Breakup Letter",
    bodyMd: `Dear {{name}},

We are pleased to share the detailed breakup of your cost-to-company (CTC) at **{{company}}**, effective **{{joiningDate}}**. The complete structure — earnings, deductions and net take-home — is set out below.

Please review it and sign to confirm your acceptance.`,
  },
  promotion_ctc: {
    title: "Promotion — Revised CTC",
    bodyMd: `Dear {{name}},

Congratulations on your promotion to **{{designation}}**. In recognition of your contribution and growth at **{{company}}**, we are pleased to revise your compensation with effect from **{{date}}**. Your revised CTC structure is detailed below.

Please review and sign to confirm your acceptance.`,
  },
  appraisal_ctc: {
    title: "Appraisal — Revised CTC",
    bodyMd: `Dear {{name}},

Following your annual appraisal, and in appreciation of your performance at **{{company}}**, we are pleased to revise your compensation with effect from **{{date}}**. Your revised CTC structure is detailed below.

Please review and sign to confirm your acceptance.`,
  },

  // ── E — Milestones & Recognition ───────────────────────────────────────────
  free_training_completed: {
    title: "Free Training Completion Certificate",
    bodyMd: `This is to certify that **{{name}}** has successfully completed the training programme conducted by **{{company}}**, concluding on **{{date}}**.

We commend {{firstName}}'s commitment and enthusiasm throughout the programme and wish them every success ahead.

{{hrName}}
{{company}}`,
  },
  probation_completed: {
    title: "Probation Completion Certificate",
    bodyMd: `This is to certify that **{{name}}**, serving as **{{designation}}**, has successfully completed the probation period at **{{company}}** as of **{{date}}**.

We are pleased to confirm {{firstName}} as a regular employee and look forward to a long and rewarding association.

Congratulations!

{{hrName}}
Human Resources, {{company}}`,
  },
  confirmation_letter: {
    title: "Confirmation Letter",
    bodyMd: `Dear {{name}},

We are pleased to confirm your employment as **{{designation}}** at **{{company}}** with effect from **{{date}}**, having successfully completed your probation period.

Your performance, conduct and commitment during probation have met our expectations, and we are glad to have you continue as a regular member of the {{department}} team. All terms of your appointment continue to apply.

Congratulations, and here's to a long and rewarding association.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  employee_of_month: {
    title: "Employee of the Month",
    bodyMd: `**Employee of the Month**

Presented to **{{name}}** — {{designation}}, {{department}}

In recognition of outstanding performance, dedication and the example set for the entire team at **{{company}}** this month. Thank you for the difference you make.

Awarded on {{date}}.

{{hrName}}
{{company}}`,
  },
  birthday_anniversary: {
    title: "Birthday / Work Anniversary",
    bodyMd: `Dear {{name}},

On behalf of everyone at **{{company}}**, we send you our warmest wishes on your special day!

Your energy and contribution make our team stronger, and we're grateful to have you with us. Here's to more shared milestones and success ahead.

Have a wonderful day!

Warm regards,
Team {{company}}`,
  },

  // ── F — Requests (employee → HR) ───────────────────────────────────────────
  leave_request: {
    title: "Leave Request",
    bodyMd: `To: Human Resources, {{company}}
From: {{name}} — {{designation}}, {{department}}
Date: {{date}}

Dear HR,

I would like to request leave for the period noted below. I have informed my reporting manager, **{{reportingManager}}**, and will ensure a smooth handover of my responsibilities during my absence.

**Reason:** _____________________
**From:** _____________  **To:** _____________

I request you to kindly approve the same. Thank you.

Regards,
{{name}}`,
  },
  resignation_request: {
    title: "Resignation Request",
    bodyMd: `To: Human Resources, {{company}}
From: {{name}} — {{designation}}, {{department}}
Date: {{date}}

Dear HR,

I am writing to formally tender my resignation from my position as **{{designation}}** at **{{company}}**. I will serve the applicable notice period of **{{noticePeriod}}**, with my proposed last working day being **{{lastWorkingDay}}**.

I am committed to ensuring a smooth and complete handover before I leave. I am grateful for the opportunities and support I have received here.

Sincerely,
{{name}}`,
  },

  // ── G — Separation ─────────────────────────────────────────────────────────
  resignation_accepted: {
    title: "Resignation Acceptance",
    bodyMd: `Dear {{name}},

This is to confirm that we have received and **accepted** your resignation from the position of **{{designation}}** at **{{company}}**. Your last working day is recorded as **{{lastWorkingDay}}**.

Kindly ensure that all handovers, asset returns and clearances are completed before your last working day. Your full and final settlement will be processed as per company policy following clearance.

We thank you for your contribution and wish you the very best in your future endeavours.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  resignation_rejected: {
    title: "Resignation Rejection",
    bodyMd: `Dear {{name}},

We are in receipt of your resignation from the position of **{{designation}}** at **{{company}}**. After review, we are **unable to accept** it in its current form.

{{firstName}}, your contribution is valued and we would like the opportunity to discuss your concerns before any decision is finalised. Kindly reach out to HR or your reporting manager, **{{reportingManager}}**, at the earliest so we can find the right way forward together.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  ffs_letter: {
    title: "Full & Final Settlement Letter",
    bodyMd: `Dear {{name}},

This letter confirms the **full and final settlement** of your dues with **{{company}}** following your separation, with your last working day recorded as **{{lastWorkingDay}}**.

Your settlement has been computed after accounting for salary payable, leave encashment, statutory deductions and recovery of any advances or company assets, as detailed in the accompanying statement.

Please review the statement and sign below to acknowledge receipt and acceptance of the full and final settlement.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  handover_letter: {
    title: "Handover Letter",
    bodyMd: `Dear {{name}},

As part of your separation from **{{company}}** (last working day **{{lastWorkingDay}}**), this letter records the handover of your responsibilities, work-in-progress, documents and company assets.

You are requested to complete the handover to **{{reportingManager}}** (or nominee), including all files, credentials, devices and pending items, and to confirm the same by signing below. Completion of this handover is a prerequisite for your clearance and final settlement.

We appreciate your cooperation in ensuring a smooth transition.

Warm regards,
{{hrName}}
Human Resources, {{company}}`,
  },
  experience_letter: {
    title: "Experience Letter",
    bodyMd: `**TO WHOMSOEVER IT MAY CONCERN**

This is to certify that **{{name}}** was employed with **{{company}}** as **{{designation}}** in the {{department}} team, from **{{joiningDate}}** to **{{lastWorkingDay}}**.

During this tenure, {{firstName}} was found to be sincere, diligent and professional, and contributed positively to the organisation. Their conduct throughout the period of employment was satisfactory.

We wish {{firstName}} success in all future endeavours.

{{hrName}}
Human Resources, {{company}}`,
  },
  completion_certificate: {
    title: "Completion Certificate",
    bodyMd: `**CERTIFICATE OF COMPLETION**

This is to certify that **{{name}}** has successfully completed their engagement as **{{designation}}** with **{{company}}**, concluding on **{{lastWorkingDay}}**.

All assigned responsibilities and the handover of duties were duly completed. We acknowledge {{firstName}}'s contribution during their association with {{company}} and extend our best wishes for the future.

{{hrName}}
Human Resources, {{company}}`,
  },
};

/**
 * The seed rows the applier upserts — one per DOC_TYPES entry, pairing the type
 * metadata (category / trigger / signature / content) with its default title +
 * body. Kept in canonical DOC_TYPES order.
 */
export function templateSeedRows(): Array<{
  category: string;
  typeKey: string;
  title: string;
  bodyMd: string;
  trigger: string;
  signature: string;
  content: string;
}> {
  return DOC_TYPES.map((d) => {
    const def = DEFAULT_TEMPLATE_BODIES[d.typeKey];
    return {
      category: d.category,
      typeKey: d.typeKey,
      title: def?.title ?? d.title,
      bodyMd: def?.bodyMd ?? "",
      trigger: d.trigger,
      signature: d.signature,
      content: d.content,
    };
  });
}
