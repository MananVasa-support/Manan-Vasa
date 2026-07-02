import Link from "next/link";
import type { Route } from "next";
import { LayoutDashboard, ClipboardCheck } from "lucide-react";
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
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Page header ── */}
        <header className="wg-rise mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
            >
              <ClipboardCheck size={13} strokeWidth={2.6} /> Employees · DCC
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px,3.6vw,46px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Daily Compliance
            </h1>
            <p className="mt-1.5 text-[15.5px] font-medium text-ink-muted">
              {ownerId === me.id ? "Your KPIs — fill them at the end of each day." : `${owner.name}'s KPIs`}
            </p>
          </div>

          {scope.isManager && (
            <Link
              href={"/dcc/dashboard" as Route}
              className="wg-btn inline-flex items-center gap-2 rounded-xl bg-surface-card px-4 py-2.5 text-[14.5px] font-bold text-ink-soft transition-colors hover:text-[#15803d]"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong), 0 6px 18px -14px rgba(15,23,42,0.4)" }}
            >
              <LayoutDashboard size={18} strokeWidth={2.2} style={{ color: "#16a34a" }} />
              {scope.isSuper ? "Dashboard" : "My team"}
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
