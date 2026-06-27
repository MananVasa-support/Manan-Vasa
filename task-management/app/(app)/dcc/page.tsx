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
      <main className="mx-auto w-full max-w-[920px] px-6 max-md:px-4 pt-10 pb-24">
        <header className="relative mb-8 flex flex-col items-center text-center">
          {scope.isManager && (
            <Link href={"/dcc/dashboard" as Route} className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[15px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red max-md:static max-md:mb-4">
              <LayoutDashboard size={18} strokeWidth={2.2} /> {scope.isSuper ? "Dashboard" : "My team"}
            </Link>
          )}
          <span className="text-[13px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red-deep)" }}>Employees · DCC</span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(38px, 5vw, 60px)", letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 10 }}>
            Daily Compliance
          </h1>
          <p className="mt-3 font-semibold text-ink-muted" style={{ fontSize: 18 }}>
            {ownerId === me.id ? "Your KPIs — fill them at the end of each day." : `${owner.name}'s KPIs`}
          </p>
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
