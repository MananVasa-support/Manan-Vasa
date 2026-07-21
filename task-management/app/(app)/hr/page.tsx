import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  FolderLock,
  FileSignature,
  ScrollText,
  PartyPopper,
  Mail,
  BellRing,
  LifeBuoy,
  Waypoints,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrHandler } from "@/lib/hr/access";
import { hrSupportEnabled } from "@/lib/hr/flag";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.hr;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface HrSection {
  slug: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  /** Sections without their real build yet — badged "Coming soon". */
  soon?: boolean;
}

/**
 * The HR room's sections. Dossier + Agreements are LIVE (re-parented here from
 * Employees); the rest are scaffolded placeholders that get their real
 * functionality in a later build phase.
 */
const HR_SECTIONS: HrSection[] = [
  {
    slug: "/dossier",
    title: "Dossier",
    blurb: "Every person's complete document file — appointment, probation, CTC, increments, confidentiality & onboarding.",
    Icon: FolderLock,
  },
  {
    slug: "/agreements",
    title: "Agreements",
    blurb: "Issue, sign and archive employee agreements digitally.",
    Icon: FileSignature,
  },
  {
    slug: "/policies",
    title: "Policies",
    blurb: "The company handbook — every policy in one searchable place.",
    Icon: ScrollText,
  },
  {
    slug: "/holidays",
    title: "Holiday List",
    blurb: "The official holiday calendar for the year, at a glance.",
    Icon: PartyPopper,
  },
  {
    slug: "/letters",
    title: "Letters",
    blurb: "HR letters — offer, confirmation, increment, experience & more.",
    Icon: Mail,
  },
  {
    slug: "/queries",
    title: "Queries & Notifications",
    blurb: "Raise an HR query and track company notices & announcements.",
    Icon: BellRing,
    soon: true,
  },
  {
    slug: "/support",
    title: "Support",
    blurb: "Get help from the HR desk — questions, requests & escalations.",
    Icon: LifeBuoy,
    soon: true,
  },
];

/**
 * HR room front door — mirrors the Monthly Events Master hub's section-card
 * style, in the HR teal identity.
 */
interface HrTool {
  slug: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
}

export default async function HrHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  const me = await requireWorkspace("hr");

  const supportOn = hrSupportEnabled();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const handler = supportOn ? await isHrHandler(me) : false;

  const tools: HrTool[] = [];
  if (supportOn && isAdmin) {
    tools.push({
      slug: "/hr/routing",
      title: "Ticket Routing",
      blurb: "Choose who owns each category of HR request so nothing lands unowned.",
      Icon: Waypoints,
    });
  }
  if (supportOn && handler) {
    tools.push({
      slug: "/hr/metrics",
      title: "Support Metrics",
      blurb: "Open load, SLA breaches, response times and CSAT at a glance.",
      Icon: BarChart3,
    });
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            HR
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
              maxWidth: "22ch",
            }}
          >
            People paperwork, all in one room
          </h1>
          <p className="mt-1.5 max-w-[80ch] font-medium text-ink-muted" style={{ fontSize: 13.5 }}>
            Dossiers, agreements, policies, holiday lists, letters and support —
            the HR desk's document & help surfaces, separated from day-to-day
            people operations.
          </p>
        </header>

        <section
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {HR_SECTIONS.map((s, i) => {
            const Icon = s.Icon;
            // The "Soon" badge is only truthful while the ticketing flag is OFF —
            // Support + Queries are the only scaffolded sections, and both go live
            // with hrSupportEnabled(). Never badge a working section "Soon".
            const showSoon = s.soon && !supportOn;
            return (
              <Link
                key={s.slug}
                href={s.slug as Route}
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
                  className="mt-3.5 flex items-center gap-2 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.title}
                  {showSoon && (
                    <span
                      className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                      style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
                    >
                      Soon
                    </span>
                  )}
                </h2>
                <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">
                  {s.blurb}
                </p>
              </Link>
            );
          })}
        </section>

        {tools.length > 0 && (
          <>
            <h2 className="mb-3 mt-9 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">
              HR desk tools
            </h2>
            <section
              className="grid gap-4 max-md:gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
            >
              {tools.map((t, i) => {
                const Icon = t.Icon;
                return (
                  <Link
                    key={t.slug}
                    href={t.slug as Route}
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
                    <h3
                      className="mt-3.5 text-ink-strong"
                      style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
                    >
                      {t.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-ink-muted">
                      {t.blurb}
                    </p>
                  </Link>
                );
              })}
            </section>
          </>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
