import Link from "next/link";
import type { Route } from "next";
import {
  Users,
  Target,
  ClipboardList,
  AlertTriangle,
  Clock3,
  LifeBuoy,
  CheckCircle2,
  LogIn,
  LogOut,
  ArrowRight,
  CircleSlash,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { teamScopeFor, teamPerformance, type TeamMemberPerf } from "@/lib/queries/team-performance";
import { TZ } from "@/lib/weekly-goals/week";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";

function timeLabel(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** A member's live working state, derived from attendance + plan + tasks. */
function statusOf(p: TeamMemberPerf): { label: string; color: string; bg: string } {
  if (p.needHelp > 0) return { label: "Needs help", color: "#b45309", bg: "color-mix(in srgb, var(--color-amber) 16%, transparent)" };
  if (p.lastInAt && !p.lastOutAt) return { label: "Working", color: "#15803d", bg: "color-mix(in srgb, var(--color-green) 15%, transparent)" };
  if (p.lastOutAt) return { label: "Clocked out", color: "#475569", bg: "var(--color-surface-soft)" };
  if (!p.plannedToday) return { label: "No plan", color: "#dc2626", bg: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" };
  return { label: "Not in yet", color: "#64748b", bg: "var(--color-surface-soft)" };
}

export default async function TeamPerformancePage() {
  const me = await requireUser();
  const roster = await teamScopeFor(me);
  const perf = await teamPerformance(roster.map((r) => r.id));

  // Sort: needs-help first, then behind (overdue), then by goal score.
  const sorted = [...roster].sort((a, b) => {
    const pa = perf.get(a.id);
    const pb = perf.get(b.id);
    const sa = (pa?.needHelp ?? 0) * 100 + (pa?.overdueTasks ?? 0);
    const sb = (pb?.needHelp ?? 0) * 100 + (pb?.overdueTasks ?? 0);
    if (sb !== sa) return sb - sa;
    return (pb?.goalScorePct ?? -1) - (pa?.goalScorePct ?? -1);
  });

  const working = sorted.filter((p) => { const x = perf.get(p.id); return x?.lastInAt && !x?.lastOutAt; }).length;
  const noPlan = sorted.filter((p) => !perf.get(p.id)?.plannedToday).length;
  const needHelp = sorted.filter((p) => (perf.get(p.id)?.needHelp ?? 0) > 0).length;
  const behind = sorted.filter((p) => (perf.get(p.id)?.overdueTasks ?? 0) > 0).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
          >
            <Users size={13} strokeWidth={2.6} /> WMS · Team
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}
          >
            Team performance
          </h1>
          <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "72ch" }}>
            Who&apos;s working, who&apos;s blocked, who has no plan, and who&apos;s behind — live, today. Open
            anyone to see their goals or review their daily checklist.
          </p>
        </header>

        {/* Summary strip */}
        <section className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1 wg-rise" style={{ animationDelay: "40ms" }}>
          <Stat icon={<Users size={18} />} label="Team" value={roster.length} />
          <Stat icon={<CheckCircle2 size={18} />} label="Working now" value={working} tone="green" />
          <Stat icon={<CircleSlash size={18} />} label="No plan today" value={noPlan} tone={noPlan > 0 ? "red" : undefined} />
          <Stat icon={<LifeBuoy size={18} />} label="Need help" value={needHelp} tone={needHelp > 0 ? "amber" : undefined} />
        </section>

        {sorted.length === 0 ? (
          <p className="py-12 text-center text-ink-muted">No team members to show.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
            {sorted.map((m, i) => {
              const p = perf.get(m.id);
              const st = statusOf(p ?? ({} as TeamMemberPerf));
              return (
                <article
                  key={m.id}
                  className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-start gap-3.5">
                    <EmployeeAvatar name={m.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate text-[16px] font-bold text-ink-strong">{m.name}</span>
                        <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ color: st.color, background: st.bg }}>
                          {st.label}
                        </span>
                      </div>
                      <span className="text-[13px] text-ink-subtle">{m.department || "—"}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tabular-nums font-black leading-none" style={{ fontSize: 26, color: p?.goalScorePct == null ? "var(--color-ink-subtle)" : p.goalScorePct >= 80 ? "#16a34a" : p.goalScorePct >= 60 ? "#d97706" : "#dc2626" }}>
                        {p?.goalScorePct == null ? "—" : `${p.goalScorePct}%`}
                      </div>
                      <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">goal score</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
                    <Metric icon={<Target size={14} />} label="Goals" value={`${p?.goalsDone ?? 0}/${p?.goalsCount ?? 0}`} />
                    <Metric icon={<ClipboardList size={14} />} label="Assigned today" value={p?.assignedToday ?? 0} />
                    <Metric icon={<CheckCircle2 size={14} />} label="Done today" value={p?.doneToday ?? 0} tone="green" />
                    <Metric icon={<Clock3 size={14} />} label="Pending" value={p?.pendingTasks ?? 0} />
                    <Metric icon={<AlertTriangle size={14} />} label="Overdue" value={p?.overdueTasks ?? 0} tone={(p?.overdueTasks ?? 0) > 0 ? "red" : undefined} />
                    <Metric icon={<LifeBuoy size={14} />} label="Need help" value={p?.needHelp ?? 0} tone={(p?.needHelp ?? 0) > 0 ? "amber" : undefined} />
                  </div>

                  <div className="mt-3.5 flex items-center gap-4 text-[12.5px] text-ink-subtle">
                    <span className="inline-flex items-center gap-1.5"><LogIn size={13} strokeWidth={2.4} className="text-green-700" /> In {timeLabel(p?.lastInAt ?? null)}</span>
                    <span className="inline-flex items-center gap-1.5"><LogOut size={13} strokeWidth={2.4} /> Out {timeLabel(p?.lastOutAt ?? null)}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2.5 flex-wrap">
                    <Link
                      href={`/weekly-goals?emp=${m.id}` as Route}
                      className="inline-flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-2 text-[13px] font-bold transition-colors"
                      style={{ borderColor: `color-mix(in srgb, ${RED} 35%, transparent)`, color: "var(--color-altus-red-deep)" }}
                    >
                      <Target size={14} strokeWidth={2.4} /> View goals
                    </Link>
                    <Link
                      href={`/weekly-goals/team/${m.id}` as Route}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
                      style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
                    >
                      <ClipboardList size={14} strokeWidth={2.4} /> Daily checklist <ArrowRight size={13} strokeWidth={2.6} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-6 text-[12.5px] text-ink-subtle">
          {behind} member{behind === 1 ? "" : "s"} with overdue tasks · goal score is this week&apos;s weight-aware
          completion. All figures read live from the same task, goal and attendance records — nothing duplicated.
        </p>
      </main>
      <DashboardFooter />
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "#16a34a" : tone === "amber" ? "#d97706" : tone === "red" ? "#dc2626" : "var(--color-ink-strong)";
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        <span style={{ color: RED }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 tabular-nums font-black leading-none" style={{ fontSize: 34, color }}>{value}</div>
    </div>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "#16a34a" : tone === "amber" ? "#d97706" : tone === "red" ? "#dc2626" : "var(--color-ink-strong)";
  return (
    <div className="rounded-xl border border-hairline px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
        <span style={{ color: "var(--color-ink-subtle)" }}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 tabular-nums font-black" style={{ fontSize: 18, color }}>{value}</div>
    </div>
  );
}
