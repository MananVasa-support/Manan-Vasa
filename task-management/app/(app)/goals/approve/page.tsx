import { and, asc, eq, inArray } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireGoalsAccess } from "@/lib/goals/access";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { currentWeekStart, prevWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import { isMondayIST } from "@/lib/manager-gates";
import { ApproveWorkbench, type ApproveMember, type ApproveGoal } from "@/components/goals/approve/approve-workbench";

export const dynamic = "force-dynamic";

// Goals identity — amber-gold (IDENTITY only; brand red is never used in this room).
const ACCENT = MODULE_THEME.goals.accent; // #b45309
const ACCENT_DEEP = MODULE_THEME.goals.accentDeep; // #7c2d12
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

/** Serialise a weekly_goals row to the client DTO (numeric cols are strings). */
function toApproveGoal(r: typeof weeklyGoals.$inferSelect): ApproveGoal {
  return {
    id: r.id,
    employeeId: r.employeeId,
    weekStart: r.weekStart,
    position: r.position,
    subject: r.subject,
    client: r.client,
    area: r.area,
    uom: r.uom,
    targetDone: r.targetDone,
    notes: r.notes,
    weight: r.weight,
    status: r.status,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: r.reviewNotes,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    targetAmount: r.targetAmount,
    actualAmount: r.actualAmount,
    teamDependencyPct: r.teamDependencyPct,
    evidenceUrl: r.evidenceUrl,
    linkUrl: r.linkUrl,
    committed: r.committedAt != null,
    approved: r.approvedByManagerAt != null,
  };
}

async function loadApproveBoard(
  managerId: string,
  weekStart: string,
  lastWeek: string,
): Promise<{ members: ApproveMember[]; monday: boolean }> {
  const monday = isMondayIST();
  try {
    const downline = await getDownlineIds(managerId);
    if (downline.length === 0) return { members: [], monday };

    const [people, rows] = await withRetry(
      () =>
        Promise.all([
          db
            .select({ id: employees.id, name: employees.name })
            .from(employees)
            .where(and(inArray(employees.id, downline), eq(employees.isActive, true))),
          db
            .select()
            .from(weeklyGoals)
            .where(
              and(
                inArray(weeklyGoals.employeeId, downline),
                inArray(weeklyGoals.weekStart, [lastWeek, weekStart]),
                eq(weeklyGoals.archived, false),
                eq(weeklyGoals.adopted, true),
              ),
            )
            .orderBy(asc(weeklyGoals.position)),
        ]),
      { timeoutMs: [6000, 12000], label: "goals.approve.loadBoard" },
    );

    const byEmp = new Map<string, { last: ApproveGoal[]; this: ApproveGoal[] }>();
    for (const r of rows) {
      const bucket = byEmp.get(r.employeeId) ?? { last: [], this: [] };
      (r.weekStart === weekStart ? bucket.this : bucket.last).push(toApproveGoal(r));
      byEmp.set(r.employeeId, bucket);
    }

    const members: ApproveMember[] = people
      .map((p) => {
        const b = byEmp.get(p.id) ?? { last: [], this: [] };
        return { id: p.id, name: p.name, lastWeek: b.last, thisWeek: b.this };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { members, monday };
  } catch {
    // Fail-safe: never throw the surface — render an empty roster.
    return { members: [], monday };
  }
}
