import { redirect } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireGoalsAccess } from "@/lib/goals/access";

export const dynamic = "force-dynamic";

// PLACEHOLDER shell — the xlsx bulk-import surface is built by the CASCADE-UI
// slice. Admin-only (fan rows across the team).
export default async function GoalsImportPage() {
  const { isAdmin } = await requireGoalsAccess();
  if (!isAdmin) redirect("/goals" as Route);
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <h1
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32 }}
        >
          Bulk Import
        </h1>
        <p className="mt-2 text-ink-muted">Coming next.</p>
      </main>
      <DashboardFooter />
    </>
  );
}
