import Link from "next/link";
import type { Route } from "next";
import { asc, eq, and } from "drizzle-orm";
import { Award, BookOpen, Settings, Sparkles, Users } from "lucide-react";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { isAppraisalAdmin, appraisalScopeFor } from "@/lib/pms/appraisal/access";
import { loadCycles, loadLatestCycle, loadRoster } from "@/lib/pms/appraisal/queries";
import { AdminCycleBar, CyclePicker } from "@/components/appraisal/admin-bar";
import { APPRAISAL_CYCLE_STATUS_LABELS } from "@/db/enums";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

function band(p: number): { color: string; label: string } {
  if (p >= 75) return { color: "#16a34a", label: "Strong" };
  if (p >= 50) return { color: "#d97706", label: "On track" };
  return { color: "#dc2626", label: "Needs focus" };
}

export default async function AppraisalPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  requireAppraisal();
  const me = await requireUser();
  const admin = isAppraisalAdmin(me);
  const { cycle: cycleParam } = await searchParams;

  const cycles = await loadCycles();
  const current =
    (cycleParam && cycles.find((c) => c.id === cycleParam)) ||
    (await loadLatestCycle()) ||
    null;

  // Roster scope: admin → everyone; else self + downline.
  const scope = await appraisalScopeFor(me);
  let people: { id: string; name: string; avatarUrl: string | null; department: string | null }[];
  if (scope.all) {
    people = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name));
  } else {
    const rows = await db
      .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
      .from(employees)
      .where(and(eq(employees.isActive, true)))
      .orderBy(asc(employees.name));
    const allowed = new Set(scope.ids);
    people = rows.filter((r) => allowed.has(r.id));
  }

  const roster = current ? await loadRoster(current.id, people) : [];
  const withItems = roster.filter((r) => r.itemCount > 0);
  const sorted = [...roster].sort((a, b) => b.scorecard.finalPct - a.scorecard.finalPct);
  const scores = withItems.map((r) => r.scorecard.finalPct);
  const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${ACCENT} 9%, transparent), transparent 55%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow: "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
                <Award size={13} strokeWidth={2.6} /> Employees · Appraisal
              </span>
              <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px,3.6vw,46px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
                Appraisal
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                One consolidated scorecard across KPI, Skill, Attitude, Incentive, Culture and Knowledge Sharing — scored Self → Manager → Management → Final.
                {current ? ` Cycle ${current.label || current.period} · ${APPRAISAL_CYCLE_STATUS_LABELS[current.status]}.` : " No cycle yet."}
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {cycles.length > 0 && <CyclePicker cycles={cycles} current={current?.id ?? null} />}
              {admin && <AdminCycleBar cycle={current ? { id: current.id, period: current.period, label: current.label, status: current.status } : null} />}
              {admin && (
                <Link href={"/appraisal/culture" as Route} className="wg-btn inline-flex items-center gap-2 rounded-pill border-2 bg-white/70 px-4 py-2.5 text-[14px] font-bold whitespace-nowrap" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}>
                  <BookOpen size={16} strokeWidth={2.4} /> Culture pool
                </Link>
              )}
              {admin && (
                <Link href={"/appraisal/config" as Route} className="brand-btn wg-btn inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white whitespace-nowrap" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
                  <Settings size={16} strokeWidth={2.4} /> Config
                </Link>
              )}
            </div>
          </div>
        </header>

        {current && (
          <section aria-label="Appraisal totals" className="mb-6 grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
            <Kpi icon={<Sparkles size={17} />} accent={band(avg).color} label="Average score" value={`${avg}%`} caption={`${withItems.length} scored`} />
            <Kpi icon={<Users size={17} />} accent={ACCENT_DEEP} label="People" value={String(people.length)} caption="in your scope" />
            <Kpi icon={<Award size={17} />} accent={ACCENT} label="Strong (75+)" value={String(scores.filter((s) => s >= 75).length)} caption={`${scores.filter((s) => s < 50).length} need focus`} />
          </section>
        )}

        {!current ? (
          <div className="rounded-2xl bg-surface-card p-12 text-center text-[14.5px] text-ink-muted" style={{ boxShadow: CARD_SHADOW }}>
            {admin ? "Create a cycle to begin." : "No appraisal cycle has been opened yet."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {sorted.map((r, i) => {
              const p = r.scorecard.finalPct;
              const b = band(p);
              return (
                <Link
                  key={r.employee.id}
                  href={`/appraisal/${r.employee.id}?cycle=${current.id}` as Route}
                  className="wg-rise group block rounded-2xl bg-surface-card p-5 transition-all duration-200 hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, boxShadow: CARD_SHADOW }}
                >
                  <div className="flex items-center gap-4">
                    <EmployeeAvatar name={r.employee.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[16px] font-bold text-ink-strong">{r.employee.name}</span>
                        {r.isManager && <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase text-ink-subtle">Manager</span>}
                      </div>
                      <span className="text-[13px] text-ink-subtle">{r.employee.department || "—"} · {r.itemCount} items · {r.scorecard.ratingTerm}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "-0.02em", color: b.color }}>
                        {Math.round(p)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: b.color }}>{b.label}</div>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, p)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${b.color} 70%, #fff), ${b.color})` }} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {r.scorecard.dimensions.map((d) => (
                      <span key={d.dimension} className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
                        {d.label} <span className="tabular-nums" style={{ color: ACCENT_DEEP }}>{Math.round(d.pct)}%</span>
                      </span>
                    ))}
                    {r.itemCount === 0 && <span className="text-[12px] text-ink-subtle">No items yet</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

function Kpi({ icon, accent, label, value, caption }: { icon: React.ReactNode; accent: string; label: string; value: string; caption: string }) {
  return (
    <div className="wg-rise rounded-2xl bg-surface-card px-4.5 py-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex items-center gap-2">
        <span className="inline-grid size-8 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      </div>
      <div className="mt-2 tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(21px, 1.7vw, 27px)", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
    </div>
  );
}
