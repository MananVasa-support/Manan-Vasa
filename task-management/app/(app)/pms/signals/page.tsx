import { redirect } from "next/navigation";
import type { Route } from "next";
import { Sparkles, TrendingUp, Award, Target, IndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { listEmployeeOptions } from "@/lib/queries/employees";
import {
  listRecognitions,
  listPromotionSignals,
  incentiveTargetVsActual,
  type RecognitionRow,
  type PromotionSignalRow,
} from "@/lib/queries/pms-signals";
import { RecognitionActions } from "@/components/pms/signals/recognition-actions";
import { PromotionActions } from "@/components/pms/signals/promotion-actions";
import { CreateRecognitionForm } from "@/components/pms/signals/create-recognition-form";
import { MODULE_THEME } from "@/lib/module-theme";

export const dynamic = "force-dynamic";

const ACCENT = MODULE_THEME.employees.accent; // green
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

/** Current IST month as 'YYYY-MM' — for the recognition form default + period labels. */
function currentPeriod(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function rupee(n: number): string {
  return `₹${INR.format(Math.round(n))}`;
}

const RECOGNITION_STATUS: Record<RecognitionRow["status"], { label: string; color: string }> = {
  suggested: { label: "Suggested", color: "#d97706" },
  released: { label: "Released", color: "#16a34a" },
  dismissed: { label: "Dismissed", color: "#64748b" },
};

const PROMOTION_STATUS: Record<PromotionSignalRow["status"], { label: string; color: string }> = {
  flagged: { label: "Flagged", color: "#d97706" },
  acknowledged: { label: "Acknowledged", color: "#2563eb" },
  actioned: { label: "Actioned", color: "#16a34a" },
  dismissed: { label: "Dismissed", color: "#64748b" },
};

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {label}
    </span>
  );
}

function fmtPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function PmsSignalsPage() {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) redirect("/pms" as Route);

  const year = Number(new Date(Date.now() + 5.5 * 3_600_000).getUTCFullYear());
  const period = currentPeriod();

  const [recognitions, promotions, tva, people] = await Promise.all([
    listRecognitions(),
    listPromotionSignals(),
    incentiveTargetVsActual(year),
    listEmployeeOptions(),
  ]);

  const openRecognitions = recognitions.filter((r) => r.status === "suggested").length;
  const flaggedPromotions = promotions.filter((p) => p.status === "flagged").length;

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
              <Sparkles size={13} strokeWidth={2.6} /> Employees · Performance · Release
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}
            >
              Recognition &amp; promotions
            </h1>
            <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "70ch" }}>
              The score engine only <em>suggests</em> recognition and <em>flags</em> promotions — nothing is
              automatic. You decide and release every consequence here.
              {(openRecognitions > 0 || flaggedPromotions > 0) &&
                ` ${openRecognitions} recognition${openRecognitions === 1 ? "" : "s"} and ${flaggedPromotions} promotion${flaggedPromotions === 1 ? "" : "s"} awaiting your call.`}
            </p>
          </div>
          <CreateRecognitionForm people={people} defaultPeriod={period} />
        </header>

        {/* Two columns: recognition (left) + promotion signals (right) */}
        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
          {/* ── Recognition ── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold text-ink-strong">
              <Award size={18} strokeWidth={2.4} style={{ color: ACCENT }} /> Recognition
              <span className="text-[13px] font-semibold text-ink-subtle">
                {openRecognitions} awaiting
              </span>
            </h2>
            {recognitions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-hairline bg-surface-card p-8 text-center text-[14px] text-ink-muted">
                No recognition suggested yet. As scores cross the recognition threshold, suggestions
                appear here for you to release.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {recognitions.map((r, i) => {
                  const st = RECOGNITION_STATUS[r.status];
                  return (
                    <article
                      key={r.id}
                      className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <div className="flex items-start gap-4">
                        <EmployeeAvatar name={r.employeeName} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[16px] font-bold text-ink-strong">{r.employeeName}</span>
                            <StatusPill label={st.label} color={st.color} />
                          </div>
                          <div className="mt-0.5 text-[13px] text-ink-subtle">
                            {r.department || "—"} · {fmtPeriod(r.period)}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className="inline-flex items-center rounded-md px-2 py-0.5 text-[12.5px] font-bold"
                              style={{ color: ACCENT_DEEP, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
                            >
                              {r.kind}
                            </span>
                            {r.scoreSnapshot != null && (
                              <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
                                score {Math.round(r.scoreSnapshot)}
                              </span>
                            )}
                          </div>
                          {r.reason && (
                            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{r.reason}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        {r.status === "suggested" ? (
                          <RecognitionActions id={r.id} employeeName={r.employeeName} />
                        ) : (
                          <p className="text-[12.5px] text-ink-subtle">
                            {st.label}
                            {r.releasedByName ? ` by ${r.releasedByName}` : ""}
                            {r.releasedAt
                              ? ` · ${new Date(r.releasedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Promotion signals ── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold text-ink-strong">
              <TrendingUp size={18} strokeWidth={2.4} style={{ color: ACCENT }} /> Promotion signals
              <span className="text-[13px] font-semibold text-ink-subtle">{flaggedPromotions} flagged</span>
            </h2>
            {promotions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-hairline bg-surface-card p-8 text-center text-[14px] text-ink-muted">
                No promotion signals. When someone crosses the promotion threshold with enough tenure,
                they are flagged here for your review.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {promotions.map((p, i) => {
                  const st = PROMOTION_STATUS[p.status];
                  return (
                    <article
                      key={p.id}
                      className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <div className="flex items-start gap-4">
                        <EmployeeAvatar name={p.employeeName} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[16px] font-bold text-ink-strong">{p.employeeName}</span>
                            <StatusPill label={st.label} color={st.color} />
                          </div>
                          <div className="mt-0.5 text-[13px] text-ink-subtle">{p.department || "—"}</div>
                          <div className="mt-2 flex items-center gap-3">
                            {p.scoreSnapshot != null && (
                              <span className="tabular-nums font-black leading-none" style={{ fontSize: 26, color: ACCENT }}>
                                {Math.round(p.scoreSnapshot)}
                              </span>
                            )}
                            {p.eligibleSince && (
                              <span className="text-[12.5px] font-semibold text-ink-subtle">
                                eligible since{" "}
                                {new Date(p.eligibleSince).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                          {p.rationale && (
                            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{p.rationale}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        {p.status === "flagged" ? (
                          <PromotionActions id={p.id} employeeName={p.employeeName} />
                        ) : (
                          <p className="text-[12.5px] text-ink-subtle">
                            {st.label}
                            {p.decidedByName ? ` by ${p.decidedByName}` : ""}
                            {p.decidedAt
                              ? ` · ${new Date(p.decidedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Incentive Target vs Actual (feeds the KPI pillar) ── */}
        <section className="mt-9 wg-rise">
          <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
            <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink-strong">
              <Target size={18} strokeWidth={2.4} style={{ color: ACCENT }} /> Incentive — Target vs Actual
              <span className="text-[13px] font-semibold text-ink-subtle">{tva.year}</span>
            </h2>
            <div className="flex items-center gap-5 text-[13px]">
              <span className="text-ink-subtle">
                Target <strong className="text-ink-strong tabular-nums">{rupee(tva.totals.target)}</strong>
              </span>
              <span className="text-ink-subtle">
                Actual <strong className="text-ink-strong tabular-nums">{rupee(tva.totals.actual)}</strong>
              </span>
              {tva.totals.attainmentPct != null && (
                <span
                  className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums text-white"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                >
                  {Math.round(tva.totals.attainmentPct)}% attained
                </span>
              )}
            </div>
          </div>
          <p className="mb-3 text-[13.5px] text-ink-muted" style={{ maxWidth: "76ch" }}>
            Incentive attainment feeds the KPI pillar alongside Weekly Goals. Set targets in the
            Incentive module; actuals are the approved-earned YTD per person.
          </p>

          {tva.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-surface-card p-8 text-center text-[14px] text-ink-muted">
              No incentive targets or earnings recorded for {tva.year} yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-sm">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-hairline bg-surface-soft text-left">
                    <th className="px-4 py-3 font-bold text-ink-subtle">Person</th>
                    <th className="px-4 py-3 text-right font-bold text-ink-subtle">Target</th>
                    <th className="px-4 py-3 text-right font-bold text-ink-subtle">Actual</th>
                    <th className="px-4 py-3 font-bold text-ink-subtle" style={{ minWidth: 180 }}>
                      Attainment
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tva.rows.map((row) => {
                    const pct = row.attainmentPct;
                    const barColor = pct == null ? "var(--color-hairline-strong)" : pct >= 100 ? ACCENT : pct >= 70 ? "#d97706" : "#dc2626";
                    return (
                      <tr key={row.empName} className="border-b border-hairline last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar name={row.empName} size="sm" />
                            <span className="font-semibold text-ink-strong">{row.empName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                          {row.target > 0 ? rupee(row.target) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink-strong">
                          {rupee(row.actual)}
                        </td>
                        <td className="px-4 py-3">
                          {pct == null ? (
                            <span className="text-[13px] text-ink-subtle">no target set</span>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-soft" style={{ minWidth: 90 }}>
                                <div
                                  className="h-full rounded-pill"
                                  style={{ width: `${Math.min(100, Math.round(pct))}%`, background: barColor }}
                                />
                              </div>
                              <span className="w-12 shrink-0 text-right tabular-nums text-[13.5px] font-bold" style={{ color: barColor }}>
                                {Math.round(pct)}%
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-soft font-bold text-ink-strong">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <IndianRupee size={15} strokeWidth={2.6} style={{ color: ACCENT }} /> Total
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{rupee(tva.totals.target)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{rupee(tva.totals.actual)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {tva.totals.attainmentPct != null ? `${Math.round(tva.totals.attainmentPct)}%` : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
