import { CalendarHeart, Inbox, ListChecks } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import {
  getLeaveBalance,
  listMyLeave,
  listPendingLeave,
} from "@/lib/queries/leave";
import { localDateString } from "@/lib/format";
import { LeaveBalanceCard } from "@/components/attendance/leave/leave-balance-card";
import { RequestLeaveForm } from "@/components/attendance/leave/request-leave-form";
import { LeaveList } from "@/components/attendance/leave/leave-list";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const me = await requireUser();
  const today = localDateString("Asia/Kolkata");

  const [balance, mine, pending] = await Promise.all([
    getLeaveBalance(me.id, today),
    listMyLeave(me.id),
    me.isAdmin ? listPendingLeave() : Promise.resolve([]),
  ]);

  const firstName = me.name.split(" ")[0] ?? me.name;
  const pendingMine = mine.filter((r) => r.status === "pending").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1060px] px-8 max-md:px-4 pt-8 pb-16">
        {/* ——— Glass hero ——— */}
        <header
          className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-5"
          style={{
            background:
              "linear-gradient(120deg, color-mix(in srgb, #E10600 5%, var(--color-surface-card)) 0%, var(--color-surface-card) 42%, color-mix(in srgb, #16a34a 5%, var(--color-surface-card)) 100%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 8px 30px -22px rgba(15,23,42,0.35)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(225,6,0,0.07), transparent 68%)",
            }}
          />
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
          >
            <CalendarHeart size={13} strokeWidth={2.6} /> Employees · Leave
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
            Time off, {firstName}
          </h1>
          <p className="mt-1.5 text-[15.5px] font-medium text-ink-muted">
            Request paid or unpaid leave and track approvals — balances update
            the moment a request is approved.
          </p>
        </header>

        {/* ——— Balance ——— */}
        <div className="wg-rise" style={{ animationDelay: "70ms" }}>
          <LeaveBalanceCard balance={balance} />
        </div>

        {/* ——— Request + timeline ——— */}
        <div className="mt-6 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 max-lg:grid-cols-1">
          <div
            className="wg-rise self-start lg:sticky lg:top-24"
            style={{ animationDelay: "130ms" }}
          >
            <RequestLeaveForm today={today} />
          </div>

          <div className="min-w-0 space-y-8">
            {me.isAdmin && (
              <section
                className="wg-rise"
                style={{ animationDelay: "170ms" }}
                aria-labelledby="leave-pending-heading"
              >
                <div className="mb-3.5 flex items-center gap-2.5">
                  <span
                    className="inline-grid size-9 place-items-center rounded-xl"
                    style={{
                      background: "color-mix(in srgb, #f59e0b 12%, transparent)",
                      color: "#B45309",
                    }}
                  >
                    <Inbox size={18} strokeWidth={2.3} />
                  </span>
                  <h2
                    id="leave-pending-heading"
                    className="text-ink-strong"
                    style={{
                      fontFamily:
                        "var(--font-display), system-ui, sans-serif",
                      fontWeight: 900,
                      fontSize: 21,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Pending approvals
                  </h2>
                  {pending.length > 0 && (
                    <span
                      className="rounded-pill px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums"
                      style={{
                        background: "rgba(245,158,11,0.14)",
                        color: "#B45309",
                      }}
                    >
                      {pending.length}
                    </span>
                  )}
                </div>
                <LeaveList rows={pending} mode="pending" />
              </section>
            )}

            <section
              className="wg-rise"
              style={{ animationDelay: me.isAdmin ? "210ms" : "170ms" }}
              aria-labelledby="leave-mine-heading"
            >
              <div className="mb-3.5 flex items-center gap-2.5">
                <span
                  className="inline-grid size-9 place-items-center rounded-xl"
                  style={{
                    background: "color-mix(in srgb, #E10600 9%, transparent)",
                    color: "#A80400",
                  }}
                >
                  <ListChecks size={18} strokeWidth={2.3} />
                </span>
                <h2
                  id="leave-mine-heading"
                  className="text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: 21,
                    letterSpacing: "-0.02em",
                  }}
                >
                  My requests
                </h2>
                {pendingMine > 0 && (
                  <span
                    className="rounded-pill px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums"
                    style={{
                      background: "rgba(245,158,11,0.14)",
                      color: "#B45309",
                    }}
                  >
                    {pendingMine} awaiting
                  </span>
                )}
              </div>
              <LeaveList rows={mine} mode="mine" />
            </section>
          </div>
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
