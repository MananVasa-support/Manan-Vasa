import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getHrStage, getHrItem } from "@/lib/hr/lifecycle";
import { getTemplate } from "@/app/(app)/hr-docs/actions";
import { loadHrRoster } from "@/lib/hr-docs/roster";
import { HrPageHeader, HrPlanned } from "@/components/hr/hr-chrome";
import { LetterStation } from "@/components/hr/letter-station";

export const dynamic = "force-dynamic";

/**
 * A single lifecycle-stage surface. "link" items redirect to their existing
 * module; "screen" items show a planned placeholder; "doc" items render a
 * focused compose station for that letter type (admin only).
 */
export default async function HrStageItemPage({
  params,
}: {
  params: Promise<{ stage: string; item: string }>;
}) {
  const me = await requireWorkspace("hr");
  const { stage, item } = await params;
  const st = getHrStage(stage);
  const it = getHrItem(stage, item);
  if (!st || !it) notFound();

  // Link items have no page of their own — bounce to the real module.
  if (it.kind === "link" && it.href) redirect(it.href as Route);

  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  // Note: Basic Details is a "link" item (→ /hr/candidates, its own full-screen
  // route) so it's already handled by the link redirect above — its heavy
  // 108-field wizard never sits in this shared item-route bundle.

  let body: React.ReactNode;
  if (it.kind === "doc" && it.typeKey) {
    if (!isAdmin) {
      body = (
        <HrPlanned
          title={it.label}
          note="Issuing this document is an HR-desk action. Ask HR, or find your own issued copies in the Document Hub."
        />
      );
    } else {
      const res = await getTemplate(it.typeKey);
      if (!res.ok) {
        body = <HrPlanned title={it.label} note="This letter template isn't available yet." />;
      } else {
        const roster = await loadHrRoster();
        body = <LetterStation template={res.template} roster={roster} hrName={me.name} />;
      }
    }
  } else {
    body = <HrPlanned title={it.label} />;
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader title={`${st.title} · ${it.label}`} subtitle={it.blurb} />
        {body}
      </main>
      <DashboardFooter />
    </>
  );
}
