import type { Route } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import {
  listOvertimeEntries,
  listOvertimeLoggableEmployees,
  overtimeScopeFor,
} from "@/lib/queries/overtime";
import { OvertimeClient } from "@/components/overtime/overtime-client";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

export default async function OvertimePage() {
  const me = await requireUser();
  const todayISO = localDateString(TZ);

  const [rows, loggableFor, scope] = await Promise.all([
    listOvertimeEntries({ employeeId: me.id, isAdmin: me.isAdmin }),
    listOvertimeLoggableEmployees({ employeeId: me.id, isAdmin: me.isAdmin }),
    overtimeScopeFor(me),
  ]);

  // Reviewer = admin (scope.all) OR a manager whose scope spans more than self.
  const canReview = scope.all || scope.ids.length > 1;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              Employees · Overtime
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 3.4vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
                marginTop: 6,
              }}
            >
              Overtime
            </h1>
            <p
              className="mt-1.5 font-medium text-ink-muted"
              style={{ fontSize: 15.5 }}
            >
              {canReview
                ? "Log extra hours and review your team's overtime."
                : "Log the extra hours you put in. Your manager approves them."}
            </p>
          </div>
          {canReview && (
            <Link
              href={"/overtime/dashboard" as Route}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-3 px-5 text-[15px] font-bold text-ink-strong transition-transform active:scale-[0.99] hover:border-[color:var(--color-altus-red)]"
            >
              <BarChart3 size={17} strokeWidth={2.4} />
              Dashboard
              {pendingCount > 0 && (
                <span
                  className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white"
                  style={{ background: "var(--color-altus-red)" }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
        </header>

        <OvertimeClient
          rows={rows}
          meId={me.id}
          loggableFor={loggableFor}
          canReview={canReview}
          todayISO={todayISO}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
