import Link from "next/link";
import type { Route } from "next";
import { LayoutDashboard } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope, canFillFor, canReviewFor, canManageItemsFor } from "@/lib/dcc/access";
import { listOwnerItems, listOwnerEntries, listDccPeople, listReviewsForOwners } from "@/lib/queries/dcc";
import { isoDate } from "@/lib/dcc/util";
import { DccBoard } from "@/components/dcc/dcc-board";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DccPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const scope = await loadDccScope(me);
  const sp = await searchParams;

  // Whose board are we viewing? Default = me. Managers/super can switch via ?emp.
  const requested = typeof sp.emp === "string" ? sp.emp : null;
  const ownerId = requested && scope.visibleIds.has(requested) ? requested : me.id;

  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 48); // ~7 weeks window for streaks/history
  const fromISO = isoDate(from);

  const [items, entries, people, reviews] = await Promise.all([
    listOwnerItems(ownerId),
    listOwnerEntries(ownerId, fromISO),
    scope.isManager ? listDccPeople([...scope.visibleIds]) : Promise.resolve([]),
    canReviewFor(scope, ownerId) ? listReviewsForOwners([ownerId], fromISO) : Promise.resolve([]),
  ]);

  const owner = people.find((p) => p.id === ownerId) ?? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, department: me.department };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Employees · DCC</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.2vw, 42px)", letterSpacing: "-0.025em", lineHeight: 1.05, marginTop: 6 }}>
              Daily Compliance — KPIs
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15 }}>
              {ownerId === me.id ? "Your KPIs — fill them at the end of the day." : `${owner.name}'s KPIs`}
            </p>
          </div>
          {scope.isManager && (
            <Link href={"/dcc/dashboard" as Route} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red">
              <LayoutDashboard size={16} strokeWidth={2.2} /> {scope.isSuper ? "Dashboard" : "My team"}
            </Link>
          )}
        </header>

        <DccBoard
          ownerId={ownerId}
          ownerName={owner.name}
          meId={me.id}
          canFill={canFillFor(scope, ownerId)}
          canReview={canReviewFor(scope, ownerId)}
          canManage={canManageItemsFor(scope, ownerId)}
          people={scope.isManager ? people : []}
          items={items}
          entries={entries}
          reviews={reviews}
          today={today}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
