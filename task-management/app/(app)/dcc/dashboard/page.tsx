import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope } from "@/lib/dcc/access";
import { listDccPeople, listItemsForOwners, listEntriesForOwners, listReviewsForOwners } from "@/lib/queries/dcc";
import { isoDate } from "@/lib/dcc/util";
import { DccDashboard } from "@/components/dcc/dcc-dashboard";

export const dynamic = "force-dynamic";

export default async function DccDashboardPage() {
  const me = await requireUser();
  const scope = await loadDccScope(me);
  if (!scope.isManager) {
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <main className="w-full px-8 max-md:px-4 pt-10 pb-20">
          <p className="rounded-2xl border border-hairline-strong bg-white px-6 py-10 text-center text-[15px] font-bold text-ink-muted">The DCC dashboard is for managers and admins.</p>
        </main>
        <DashboardFooter />
      </>
    );
  }

  const ids = [...scope.visibleIds];
  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 27); // 4-week window
  const fromISO = isoDate(from);

  const [people, items, entries, reviews] = await Promise.all([
    listDccPeople(ids),
    listItemsForOwners(ids),
    listEntriesForOwners(ids, fromISO),
    listReviewsForOwners(ids, fromISO),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <header className="mb-6">
          <Link href={"/dcc" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted transition-colors hover:text-altus-red"><ArrowLeft size={15} /> Back to my DCC</Link>
          <span className="mt-3 block text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Employees · DCC</span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 3vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.05, marginTop: 4 }}>
            {scope.isSuper ? "Compliance Dashboard" : "My Team's Compliance"}
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15 }}>{people.length} {people.length === 1 ? "person" : "people"} · today {fmt(today)}</p>
        </header>

        <DccDashboard meId={me.id} people={people} items={items} entries={entries} reviews={reviews} today={today} />
      </main>
      <DashboardFooter />
    </>
  );
}

function fmt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
