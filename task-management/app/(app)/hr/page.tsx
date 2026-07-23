import {
  UserSearch,
  ClipboardCheck,
  DoorOpen,
  Briefcase,
  LayoutGrid,
  PartyPopper,
  LifeBuoy,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * HR room front door — the employee lifecycle in seven cards: four stages of the
 * journey (Pre-Interview → Post-Interview → Pre-Joining → Post-Joining) on the
 * top row, then Overview · Holiday List · Help Desk centred below. Each of the
 * four stages is its own sub-module with its own sidebar; the three below are
 * direct destinations.
 */
const STAGE_CARDS: HrCardDef[] = [
  {
    slug: "/hr/pre-interview",
    title: "Pre-Interview",
    blurb: "Everything before a candidate walks in — sourcing, screening and interview scheduling.",
    Icon: UserSearch,
    soon: true,
  },
  {
    slug: "/hr/post-interview",
    title: "Post-Interview",
    blurb: "After the conversation — evaluations, decisions, offers and candidate communication.",
    Icon: ClipboardCheck,
    soon: true,
  },
  {
    slug: "/hr/pre-joining",
    title: "Pre-Joining",
    blurb: "Between offer and day one — acceptance, documentation and onboarding readiness.",
    Icon: DoorOpen,
    soon: true,
  },
  {
    slug: "/hr/post-joining",
    title: "Post-Joining",
    blurb: "The employee's working file — HR record, agreements, dossier, policies and letters.",
    Icon: Briefcase,
  },
];

const DIRECT_CARDS: HrCardDef[] = [
  {
    slug: "/hr/overview",
    title: "Overview",
    blurb: "Every live HR surface in one index — jump straight to any document, record or list.",
    Icon: LayoutGrid,
  },
  {
    slug: "/holidays",
    title: "Holiday List",
    blurb: "The official holiday calendar for the year, at a glance.",
    Icon: PartyPopper,
  },
  {
    slug: "/support",
    title: "Help Desk",
    blurb: "Get help from the HR desk — questions, requests and escalations.",
    Icon: LifeBuoy,
  },
];

export default async function HrHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  await requireWorkspace("hr");

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader
          title="The employee lifecycle, one room"
          subtitle="Four stages of the people journey — from first contact to a settled team member — plus the overview, holiday calendar and help desk. Open a stage to work inside it."
        />

        {/* Top row — the four lifecycle stages (4 across on desktop). */}
        <section className="grid grid-cols-1 gap-4 max-md:gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAGE_CARDS.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>

        {/* Second row — three direct destinations, centred under the four above. */}
        <section className="mx-auto mt-4 grid grid-cols-1 gap-4 max-md:gap-3 sm:grid-cols-3 lg:max-w-[75%]">
          {DIRECT_CARDS.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={(i + 4) * 40} />
          ))}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
