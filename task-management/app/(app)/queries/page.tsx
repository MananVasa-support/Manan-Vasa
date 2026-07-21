import Link from "next/link";
import type { Route } from "next";
import { BellRing } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { HrComingSoon } from "@/components/hr/coming-soon";
import { hrSupportEnabled } from "@/lib/hr/flag";
import {
  resolveViewer,
  listMyTickets,
  listHrNotifications,
} from "@/lib/queries/hr-support";
import { TicketComposer } from "@/components/hr/ticket-composer/ticket-composer";
import { TicketList } from "@/components/hr/ticket-list/ticket-list";
import { relTime } from "@/lib/hr/ticket-ui";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export default async function QueriesPage() {
  const me = await requireWorkspace("hr");
  if (!hrSupportEnabled()) {
    return (
      <HrComingSoon
        title="Queries & Notifications"
        Icon={BellRing}
        blurb="Raise HR queries, track their status, and stay on top of company notices and announcements. This section is being built."
      />
    );
  }

  const v = await resolveViewer(me);
  const [myQueries, notes] = await Promise.all([
    listMyTickets(v, "query"),
    listHrNotifications(me),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            HR · Ask HR
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3vw,38px)", letterSpacing: "-0.025em" }}
          >
            Queries &amp; Notifications
          </h1>
          <p className="mt-1 text-[14px] font-medium text-ink-muted">
            Quick question for HR? Ask below — it goes to the same desk and you&apos;ll be notified when they reply.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section className="rounded-2xl border border-hairline bg-surface-card p-5">
              <TicketComposer mode="query" />
            </section>

            {myQueries.length > 0 && (
              <section>
                <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-muted">Your questions</h2>
                <TicketList rows={myQueries} handlerView={false} />
              </section>
            )}
          </div>

          <aside>
            <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-muted">Notifications</h2>
            {notes.length === 0 ? (
              <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-8 text-center text-[13px] font-medium text-ink-muted">
                No HR notifications yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {notes.map((n) => {
                  const row = (
                    <div
                      className="rounded-xl border border-hairline bg-surface-card px-3.5 py-3 transition hover:border-[var(--color-altus-red)]"
                      style={{ opacity: n.readAt ? 0.7 : 1 }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink-strong">{n.title}</span>
                        {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RED }} />}
                      </div>
                      <span className="mt-0.5 block text-[11.5px] text-ink-muted">{relTime(n.createdAt)}</span>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link as Route}>{row}</Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
