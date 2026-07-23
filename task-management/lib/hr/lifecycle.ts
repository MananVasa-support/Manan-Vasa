import type { LucideIcon } from "lucide-react";
import {
  UserSearch,
  ContactRound,
  ClipboardList,
  Gauge,
  ClipboardCheck,
  FileCheck2,
  FileX2,
  FileText,
  Repeat,
  DoorOpen,
  FileSignature,
  IndianRupee,
  ScrollText,
  Briefcase,
  GraduationCap,
  Award,
  BadgeCheck,
  Target,
  LogOut,
  MessagesSquare,
  Banknote,
} from "lucide-react";

/**
 * The Altus employee lifecycle — the HR room's five stages and the sidebar
 * surfaces inside each. ONE source of truth: the HR front-door cards, each
 * stage's sub-hub, its sidebar (main-nav HR_SECTION_NAV) and the per-item pages
 * (/hr/<stage>/<item>) are all generated from this.
 *
 * item.kind:
 *   "doc"    — a letter/agreement/certificate → a compose station at
 *              /hr/<stage>/<slug> backed by letter template `typeKey`.
 *   "screen" — a workflow surface still to be planned → placeholder page.
 *   "link"   — jumps to an existing module route (`href`), no page of its own.
 */
export type HrStageKey =
  | "pre-interview"
  | "post-interview"
  | "pre-joining"
  | "post-joining"
  | "exit";

export type HrItemKind = "doc" | "screen" | "link";

export interface HrItem {
  slug: string;
  label: string;
  Icon: LucideIcon;
  kind: HrItemKind;
  /** kind === "doc": the letter_templates.type_key this station composes. */
  typeKey?: string;
  /** kind === "link": the existing route to jump to. */
  href?: string;
  blurb: string;
}

export interface HrStage {
  key: HrStageKey;
  slug: HrStageKey;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  items: HrItem[];
}

export const HR_STAGES: HrStage[] = [
  {
    key: "pre-interview",
    slug: "pre-interview",
    title: "Pre-Interview",
    blurb: "Everything before a candidate walks in — details and assessments.",
    Icon: UserSearch,
    items: [
      { slug: "basic-details", label: "Basic Details", Icon: ContactRound, kind: "screen", blurb: "Capture the candidate's core details." },
      { slug: "first-assessment", label: "First Assessment", Icon: ClipboardList, kind: "screen", blurb: "The first-round evaluation." },
      { slug: "management-assessment", label: "Management Assessment", Icon: Gauge, kind: "screen", blurb: "The management-round evaluation." },
    ],
  },
  {
    key: "post-interview",
    slug: "post-interview",
    title: "Post-Interview",
    blurb: "After the conversation — the decision and the letter that follows.",
    Icon: ClipboardCheck,
    items: [
      { slug: "offer-letter", label: "Offer Letter", Icon: FileCheck2, kind: "doc", typeKey: "offer_letter", blurb: "Extend the role to the candidate." },
      { slug: "reject-letter", label: "Reject Letter", Icon: FileX2, kind: "doc", typeKey: "rejection", blurb: "A considerate decline." },
      { slug: "assignment-letter", label: "Assignment Letter", Icon: FileText, kind: "doc", typeKey: "assignment_letter", blurb: "Send a pre-hire assignment." },
      { slug: "next-round", label: "1 More Round", Icon: Repeat, kind: "doc", typeKey: "next_round_call", blurb: "Invite the candidate to another round." },
    ],
  },
  {
    key: "pre-joining",
    slug: "pre-joining",
    title: "Pre-Joining",
    blurb: "Between offer and day one — appointment, CTC, policies and forms.",
    Icon: DoorOpen,
    items: [
      { slug: "acceptance-letter", label: "Acceptance Letter", Icon: FileSignature, kind: "doc", typeKey: "appointment_letter", blurb: "The formal appointment letter." },
      { slug: "ctc-breakup", label: "CTC Breakup", Icon: IndianRupee, kind: "link", href: "/hr-docs", blurb: "Build the structured CTC in the letter library." },
      { slug: "all-policies-signatory", label: "All Policies Signatory", Icon: ScrollText, kind: "link", href: "/policies", blurb: "Every company policy to acknowledge and sign." },
      { slug: "employment-form", label: "Employment Form", Icon: ClipboardList, kind: "screen", blurb: "The joining data form." },
    ],
  },
  {
    key: "post-joining",
    slug: "post-joining",
    title: "Post-Joining",
    blurb: "The settled employee — induction, training, confirmation and appraisal.",
    Icon: Briefcase,
    items: [
      { slug: "induction", label: "Induction", Icon: GraduationCap, kind: "link", href: "/dossier/onboarding", blurb: "Onboarding & induction." },
      { slug: "free-training", label: "Free Training", Icon: Award, kind: "doc", typeKey: "free_training_completed", blurb: "Free-training completion certificate." },
      { slug: "confirmation", label: "Confirmation", Icon: BadgeCheck, kind: "doc", typeKey: "confirmation_letter", blurb: "Confirm the employee after probation." },
      { slug: "appraisal", label: "Appraisal", Icon: Target, kind: "link", href: "/appraisal", blurb: "The live rolling scorecard." },
    ],
  },
  {
    key: "exit",
    slug: "exit",
    title: "Exit",
    blurb: "A clean separation — interview, settlement and closing documents.",
    Icon: LogOut,
    items: [
      { slug: "exit-interview", label: "Exit Interview", Icon: MessagesSquare, kind: "screen", blurb: "The exit conversation." },
      { slug: "full-and-final", label: "Full & Final Settlement", Icon: Banknote, kind: "doc", typeKey: "ffs_letter", blurb: "Settle all dues." },
      { slug: "resignation-letter", label: "Resignation Letter", Icon: FileText, kind: "doc", typeKey: "resignation_accepted", blurb: "Acknowledge the resignation." },
      { slug: "experience-letter", label: "Experience Letter", Icon: Award, kind: "doc", typeKey: "experience_letter", blurb: "Certify their tenure." },
      { slug: "completion-certificate", label: "Completion Certificate", Icon: BadgeCheck, kind: "doc", typeKey: "completion_certificate", blurb: "Certify completion of engagement." },
    ],
  },
];

const STAGE_BY_KEY = new Map<string, HrStage>(HR_STAGES.map((s) => [s.key, s]));

export function getHrStage(key: string): HrStage | undefined {
  return STAGE_BY_KEY.get(key);
}

export function getHrItem(stageKey: string, itemSlug: string): HrItem | undefined {
  return getHrStage(stageKey)?.items.find((i) => i.slug === itemSlug);
}

/** Where a sidebar/card item points: an external module for links, else its own
 *  station page under the stage. */
export function hrItemHref(stageSlug: string, item: HrItem): string {
  return item.kind === "link" && item.href ? item.href : `/hr/${stageSlug}/${item.slug}`;
}
