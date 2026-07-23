import {
  ClipboardList,
  FileSignature,
  FolderLock,
  ScrollText,
  Mail,
  PartyPopper,
  LifeBuoy,
  Briefcase,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * HR Overview — a flat index of every LIVE HR destination, so anyone can jump
 * straight to a document, record or list without walking the lifecycle stages.
 */
export default async function HrOverviewPage() {
  const me = await requireWorkspace("hr");
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  const cards: HrCardDef[] = [
    {
      slug: "/hr/post-joining",
      title: "Post-Joining",
      blurb: "The working employee's document file — record, agreements, dossier, policies, letters.",
      Icon: Briefcase,
    },
    ...(isAdmin
      ? [{
          slug: "/attendance/hr-record",
          title: "HR Record",
          blurb: "The master attendance & paid-leave log.",
          Icon: ClipboardList,
        } as HrCardDef]
      : []),
    {
      slug: "/agreements",
      title: "Agreements",
      blurb: "Issue, sign and archive employee agreements digitally.",
      Icon: FileSignature,
    },
    {
      slug: "/dossier",
      title: "Dossier",
      blurb: "Every person's complete document file.",
      Icon: FolderLock,
    },
    {
      slug: "/hr-docs",
      title: "Letters",
      blurb: "Compose from the letter library — editable inline with live previews.",
      Icon: Mail,
    },
    {
      slug: "/policies",
      title: "Policies",
      blurb: "The company handbook — every policy in one place.",
      Icon: ScrollText,
    },
    {
      slug: "/holidays",
      title: "Holiday List",
      blurb: "The official holiday calendar for the year.",
      Icon: PartyPopper,
    },
    {
      slug: "/support",
      title: "Help Desk",
      blurb: "Questions, requests and escalations to the HR desk.",
      Icon: LifeBuoy,
    },
  ];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader
          title="HR Overview"
          subtitle="Every live HR surface in one index — jump straight to any document, record or list."
        />
        <section
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {cards.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
