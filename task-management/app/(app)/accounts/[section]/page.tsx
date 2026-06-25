import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { getAccountsSection } from "@/lib/accounts/sections";
import { SectionStub } from "@/components/accounts/section-stub";

export const dynamic = "force-dynamic";

/**
 * Generic renderer for STUB accounts sections. Built sections (task-list,
 * ca-handover) have their own static routes which Next resolves before this
 * dynamic segment, so they never reach here — we 404 defensively if a built
 * slug (or an unknown one) lands here anyway.
 */
export default async function AccountsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  const section = getAccountsSection(slug);
  if (!section || section.status !== "stub") notFound();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <SectionStub section={section} />
      <DashboardFooter />
    </>
  );
}
