import { ShieldCheck } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireGoalsAccess } from "@/lib/goals/access";
import { loadApproveBoard } from "@/components/goals/approve/data";
import { currentWeekStart, prevWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { ApproveWorkbench } from "@/components/goals/approve/approve-workbench";

export const dynamic = "force-dynamic";

// Goals identity — amber-gold (IDENTITY only; brand red is never used in this room).
const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep
const DISPLAY = "var(--font-display), system-ui, sans-serif";

/**
 * Monday manager-approval surface (Module 3, design §6 / §11b(B)).
 *
 * A manager sees each active downline member's LAST-week progress (review +
 * approve) and THIS-week committed goals (approve, fill-on-behalf, or require a
 * change), stamping `approved_by_manager_at`. When every downline member's
 * last-week + this-week adopted rows are approved, the Monday clock-in gate
 * (`managerApproveSatisfied`) is satisfied.
 *
 * Access is re-asserted here (layout gates are unreliable on prod). The read is
 * fail-safe — a DB hiccup renders an empty roster rather than throwing.
 */
export default async function GoalsApprovePage() {
  const { me } = await requireGoalsAccess();

  // The canvas (and its ?ritual= contextual state) is retired — this page IS
  // the Monday approval surface again in both flag states. Every nav pill,
  // inbox goals_approval_reminder and punch-gate deep-link keeps working.
  const weekStart = currentWeekStart();
  const lastWeek = prevWeekStart(weekStart);

  const { members, monday } = await loadApproveBoard(me.id, weekStart, lastWeek);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="wg-rise mb-6">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <ShieldCheck size={13} strokeWidth={2.5} />
            Monday · Manager approval
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: "clamp(28px, 3.4vw, 42px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
              maxWidth: "22ch",
            }}
          >
            Approve your team&apos;s week
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Review last week&apos;s progress and sign off this week&apos;s committed goals for each
            person who reports to you. Approving stamps the week so their Monday can begin.
          </p>
        </header>

        <ApproveWorkbench
          members={members}
          weekStart={weekStart}
          lastWeekStart={lastWeek}
          weekLabel={formatWeekLabel(weekStart)}
          lastWeekLabel={formatWeekLabel(lastWeek)}
          isMonday={monday}
        />
      </main>
      <DashboardFooter />
    </>
  );
}

// Board loader extracted VERBATIM to components/goals/approve/data.ts (Phase 6)
// so the canvas RitualBanner's lazy action reads the exact same downline board.
