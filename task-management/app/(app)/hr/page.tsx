import { LayoutGrid, PartyPopper, LifeBuoy } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HR_STAGES } from "@/lib/hr/lifecycle";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * HR room front door — the employee lifecycle in eight cards: the five stages
 * (Pre-Interview → Post-Interview → Pre-Joining → Post-Joining → Exit) on top,
 * then Overview · Holiday List · Help Desk below. Each stage is its own
 * sub-module with its own sidebar; the three below are direct destinations.
 */
const STAGE_CARDS: HrCardDef[] = HR_STAGES.map((s) => ({
  slug: `/hr/${s.slug}`,
  title: s.title,
  blurb: s.blurb,
  Icon: s.Icon,
  // A stage is still "planned" only while every surface inside it is a screen
  // awaiting its build (Pre-Interview). Any stage with a live letter is ready.
  soon: s.items.every((it) => it.kind === "screen"),
}));

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
          subtitle="Five stages of the people journey — from first contact to a clean exit — plus the overview, holiday calendar and help desk. Open a stage to work inside it."
        />

        {/* Top row — the five lifecycle stages. */}
        <section className="grid grid-cols-1 gap-4 max-md:gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STAGE_CARDS.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>

        {/* Second row — three direct destinations, centred under the stages. */}
        <section className="mx-auto mt-4 grid grid-cols-1 gap-4 max-md:gap-3 sm:grid-cols-3 lg:max-w-[62%]">
          {DIRECT_CARDS.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={(i + 5) * 40} />
          ))}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
