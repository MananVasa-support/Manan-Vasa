import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EVENTS_SECTIONS } from "@/lib/monthly-events/sections";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireEventsAccess } from "@/lib/monthly-events/access";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.events;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export default async function EventsHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const { isAdmin } = await requireEventsAccess();

  const sections = [...EVENTS_SECTIONS]
    .filter((s) => isAdmin || !s.adminOnly)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Monthly Events Master
          </span>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.6vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 6,
              maxWidth: "20ch",
            }}
          >
            The company calendar, planned like Sir&apos;s sheet
          </h1>
          {/* One compact line directly under the title — no longer a 3-line
              block that pushes the section cards down. Full width, truncates with
              a hover tooltip on the rare screen too narrow to show it all. */}
          <p
            className="mt-1.5 truncate font-medium text-ink-muted"
            style={{ fontSize: 13.5 }}
            title="One month-at-a-glance grid for every batch, holiday, meeting and obligation — with the same spreadsheet-style facility to type, drag, colour and copy events, plus auto-blocking from schedules and holidays."
          >
            One month-at-a-glance grid for every batch, holiday, meeting and obligation — with the same spreadsheet-style facility to type, drag, colour and copy events, plus auto-blocking from schedules and holidays.
          </p>
        </header>

        <section
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {sections.map((s, i) => {
            const Icon = s.Icon;
            return (
              <Link
                key={s.slug}
                href={`/events/${s.slug}` as Route}
                className="group wg-rise relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card p-5 transition-all hover:border-hairline-strong hover:shadow-lg"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </div>
                <h2
                  className="mt-3.5 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.title}
                </h2>
                <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">
                  {s.blurb}
                </p>
              </Link>
            );
          })}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
