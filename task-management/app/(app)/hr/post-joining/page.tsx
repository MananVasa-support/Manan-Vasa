import {
  ClipboardList,
  FileSignature,
  FolderLock,
  ScrollText,
  Mail,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * Post-Joining sub-module — the working employee's document file. Its sidebar
 * (see main-nav's HR_SECTION_NAV) mirrors these five surfaces: HR Record,
 * Agreements, Dossier, Policies and Letters.
 */
export default async function PostJoiningPage() {
  const me = await requireWorkspace("hr");
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  const cards: HrCardDef[] = [
    ...(isAdmin
      ? [{
          slug: "/attendance/hr-record",
          title: "HR Record",
          blurb: "The master attendance & paid-leave log — the source-of-truth people record.",
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
      blurb: "Every person's complete document file — appointment, probation, CTC, increments, confidentiality & onboarding.",
      Icon: FolderLock,
    },
    {
      slug: "/policies",
      title: "Policies",
      blurb: "The company handbook — every policy in one searchable place.",
      Icon: ScrollText,
    },
    {
      slug: "/hr-docs",
      title: "Letters",
      blurb: "Compose from the letter library — offers, appointment, policies, CTC, certificates & separation — editable inline with live previews.",
      Icon: Mail,
    },
  ];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader
          title="Post-Joining"
          subtitle="The working employee's file — attendance record, signed agreements, the personal dossier, company policies and every HR letter, all in one place."
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
