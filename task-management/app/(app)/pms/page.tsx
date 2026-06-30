import Link from "next/link";
import type { Route } from "next";
import { Target, TrendingUp, Settings } from "lucide-react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { scoreForMany, type RosterScore } from "@/lib/queries/pms";
import { MODULE_THEME } from "@/lib/module-theme";

export const dynamic = "force-dynamic";

const ACCENT = MODULE_THEME.employees.accent; // green
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

const PILLARS = [
  ["attendance", "Attendance"],
  ["goals", "Goals"],
  ["dcc", "DCC"],
  ["tasks", "Tasks"],
  ["training", "Training"],
  ["feedback", "Feedback"],
] as const;

/** Score band → colour (green ≥80 / amber ≥60 / red). */
function band(score: number): { color: string; label: string } {
  if (score >= 80) return { color: "#16a34a", label: "Strong" };
  if (score >= 60) return { color: "#d97706", label: "On track" };
  return { color: "#dc2626", label: "Needs focus" };
}

export default async function PmsPage() {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);

  // Access model: admin/super → everyone; manager → their downline + self;
  // plain employee → just themselves.
  let people: { id: string; name: string; avatarUrl: string | null; department: string | null }[];
  if (admin) {
    people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const reports = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)))
      .orderBy(asc(employees.name));
    const self = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.id, me.id));
    const seen = new Set<string>();
    people = [...self, ...reports].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }

  const scores = await scoreForMany(people.map((p) => p.id));
  const byId = new Map<string, RosterScore>(scores.map((s) => [s.employeeId, s]));
  const sorted = [...people].sort((a, b) => (byId.get(b.id)?.score.score ?? 0) - (byId.get(a.id)?.score.score ?? 0));
  const eligible = sorted.filter((p) => byId.get(p.id)?.promotion.eligible).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap wg-rise">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Target size={13} strokeWidth={2.6} /> Employees · Performance
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px,3.6vw,46px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}
            >
              Performance Intelligence
            </h1>
            <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "64ch" }}>
              A live, derived score per person — attendance, goals, DCC, tasks, training & feedback,
              folded from the activity log. {admin ? "Every weight is yours to set." : "Your manager and admins set the weights."}
              {eligible > 0 && ` ${eligible} flagged for a promotion review.`}
            </p>
          </div>
          {admin && (
            <Link
              href={"/pms/config" as Route}
              className="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-[14px] font-bold transition-colors"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
            >
              <Settings size={16} strokeWidth={2.4} /> Score settings
            </Link>
          )}
        </header>

        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          {sorted.map((p, i) => {
            const rs = byId.get(p.id);
            const score = rs?.score.score ?? 0;
            const b = band(score);
            return (
              <div
                key={p.id}
                className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="flex items-center gap-4">
                  <EmployeeAvatar name={p.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-bold text-ink-strong">{p.name}</span>
                      {rs?.promotion.eligible && (
                        <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: ACCENT }}>
                          <TrendingUp size={11} strokeWidth={2.8} /> Promotion
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-ink-subtle">{p.department || "—"} · {rs?.tenureDays ?? 0}d tenure</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums font-black leading-none" style={{ fontSize: 34, color: b.color }}>{score}</div>
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: b.color }}>{b.label}</div>
                  </div>
                </div>
                {/* Pillar breakdown */}
                <div className="mt-4 grid grid-cols-6 gap-2">
                  {PILLARS.map(([key, label]) => {
                    const pillar = rs?.score.breakdown[key];
                    const pct = pillar && pillar.rate != null ? Math.round(pillar.rate * 100) : null;
                    return (
                      <div key={key} className="text-center">
                        <div className="h-14 rounded-md bg-surface-soft relative overflow-hidden" title={`${label}: ${pct == null ? "no data" : pct + "%"}`}>
                          <div className="absolute bottom-0 inset-x-0" style={{ height: `${pct ?? 0}%`, background: pct == null ? "var(--color-hairline-strong)" : ACCENT }} />
                        </div>
                        <div className="mt-1 text-[10px] font-semibold text-ink-subtle">{label}</div>
                        <div className="text-[11px] font-bold tabular-nums" style={{ color: pct == null ? "var(--color-ink-subtle)" : ACCENT_DEEP }}>{pct == null ? "—" : pct}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {sorted.length === 0 && (
          <p className="py-12 text-center text-ink-muted">No one to show yet.</p>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
