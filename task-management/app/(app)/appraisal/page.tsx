import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

/**
 * /appraisal RETIRED (2026-08) — the Appraisal module moved into Team
 * Productivity. `?emp=<id>` deep-links straight to that person's appraisal at
 * its new home; a bare visit lands on the viewer's OWN appraisal (so employees
 * keep self-access even though /productivity/team is manager-only). The setup
 * pages (/appraisal/admin · /appraisal/config · /appraisal/culture) are
 * UNAFFECTED — reached from the workspace's admin link.
 */
export default async function AppraisalRedirect({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string }>;
}) {
  const { emp } = await searchParams;
  const target = emp ?? (await requireUser()).id;
  redirect(`/productivity/team/${target}/appraisal` as Route);
}
