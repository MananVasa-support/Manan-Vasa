import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { CalendarCheck2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { MyDayBoard } from "@/components/my-day/my-day-board";
import { getMyDayPayload } from "./payload";

export const dynamic = "force-dynamic";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-11" → "11 Aug". Reads the IST ymd the payload already resolved, so
 *  the header can't disagree with the rows about which day this is. */
function shortDay(ymd: string): string {
  const [, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi <= 11 ? `${Number(d)} ${MONTH_ABBR[mi]}` : ymd;
}

/**
 * WMS · My Day — the EXECUTION half of the daily loop.
 *
 * Plan My Day (`/goals/plan`) is where you DECIDE what today looks like; this
 * is where you WORK THROUGH it. Both sit on the SAME `daily_checklist` rows for
 * the same IST day, so a commitment made in Goals shows up here and a tick here
 * is the same write the planner's close-out makes — one daily plan, two views,
 * never two planning systems.
 *
 * Gates match the planner exactly, because the daily loop is one module:
 * `goalsCascadeEnabled()` 404s the route when it's off, and
 * `requireGoalsAccess()` enforces the identical permission scope.
 *
 * WHY A WMS-OWNED PATH: `workspaceForPath` (lib/workspaces.ts) owns `/goals*`
 * for the GOALS room, so a WMS nav entry pointing there would flip the sidebar
 * to Goals the moment you clicked it. `/my-day` keeps the room you're in.
 */
export default async function MyDayPage() {
  const { me } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const payload = await getMyDayPayload(me.id);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-5 pb-12 max-md:pt-4 max-md:pb-10">
        <header className="mb-4 wg-rise">
          <div className="flex items-start justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "#ffffff", background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              WMS · Daily Loop
            </span>
            <Link
              href={"/goals/plan" as Route}
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong"
            >
              <CalendarCheck2 size={13} /> Plan My Day
            </Link>
          </div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(22px, 2.3vw, 30px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              marginTop: 4,
            }}
          >
            My Day
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 13.5, maxWidth: "70ch" }}>
            Today · {shortDay(payload.ymd)} — the work you committed to. Tick it off, move a task&apos;s
            status, or open it in full.
          </p>
        </header>

        <MyDayBoard payload={payload} />
      </PageShell>
      <DashboardFooter />
    </>
  );
}
