import Link from "next/link";
import type { Route } from "next";
import { Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { salaryBreakupMonths, listSalaryBreakup } from "@/lib/queries/salary-breakup";
import type { SalaryBreakup } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const inr = (v: string | number | null) =>
  v == null ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
const dec = (v: string | number | null) => (v == null || v === "" ? "—" : String(Number(v)));

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SalaryPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const months = await salaryBreakupMonths();
  const raw = typeof sp.month === "string" ? sp.month : undefined;
  // Default to the last COMPLETE month — not the current in-progress month (which
  // only has a day or two logged, so it would show tiny pro-rated pay). `months`
  // is newest-first; the first one before this IST month is the last full one.
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0] ?? "";
  const month = raw && MONTH_RE.test(raw) ? raw : defaultMonth;
  const rows = month ? await listSalaryBreakup(month) : [];

  const totalPayable = rows.reduce((s, r) => s + Number(r.payableAfterPt ?? 0), 0);
  const totalFinal = rows.reduce((s, r) => s + Number(r.finalPayment ?? 0), 0);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1700px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              <Wallet size={13} strokeWidth={2.6} /> Employees · Salary
            </span>
            <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px,3.2vw,40px)", letterSpacing: "-0.025em" }}>
              Salary breakup — {month ? monthLabel(month) : "no data"}
            </h1>
            <p className="mt-1.5 text-[14px] font-medium text-ink-muted" style={{ maxWidth: "76ch" }}>
              Straight from the salary sheet (imported as-is). The attendance figures here are the sheet&apos;s own —
              the app&apos;s attendance does not change these numbers.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {months.map((m) => (
              <Link
                key={m}
                href={`/salary?month=${m}` as Route}
                className="rounded-lg border-2 px-3 py-1.5 text-[13px] font-bold transition-colors"
                style={m === month ? { borderColor: "var(--color-altus-red)", color: "var(--color-altus-red-deep)", background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" } : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }}
              >
                {monthLabel(m)}
              </Link>
            ))}
          </div>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Stat label="Employees" value={String(rows.length)} />
          <Stat label="Total payable (after PT)" value={inr(totalPayable)} />
          <Stat label="Total final payment" value={inr(totalFinal)} />
        </section>

        {rows.length === 0 ? (
          <p className="py-12 text-center text-ink-muted">No salary rows for this month.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-card shadow-sm">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left" style={{ background: "var(--color-surface-soft)" }}>
                  {["#", "Employee", "Designation", "Company", "Present", "Absent", "Half", "W-off", "Worked", "Final days", "Monthly CTC", "After leave", "PT", "After PT", "Advance", "Prev pending", "Final payment", "Remarks"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-bold uppercase tracking-wide text-ink-subtle text-[11px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: SalaryBreakup, i) => (
                  <tr key={r.id} className="border-t border-hairline hover:bg-surface-soft/60">
                    <td className="px-3 py-2 tabular-nums text-ink-subtle">{r.srNo ?? i + 1}</td>
                    <td className="px-3 py-2 font-bold text-ink-strong whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{r.designation ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{r.companyName ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{dec(r.present)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: Number(r.absent) > 0 ? "#dc2626" : undefined }}>{dec(r.absent)}</td>
                    <td className="px-3 py-2 tabular-nums">{dec(r.halfDay)}</td>
                    <td className="px-3 py-2 tabular-nums">{dec(r.weeklyOff)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{dec(r.totalDaysWorked)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{dec(r.finalWorkingDays)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.monthlyCtc)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.payableAfterLeave)}</td>
                    <td className="px-3 py-2 tabular-nums text-ink-subtle">{inr(r.pt)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{inr(r.payableAfterPt)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.advance)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.previousPending)}</td>
                    <td className="px-3 py-2 tabular-nums font-black text-ink-strong">{inr(r.finalPayment)}</td>
                    <td className="px-3 py-2 text-ink-subtle max-w-[220px] truncate" title={[r.remarks, r.mananRemarks].filter(Boolean).join(" · ")}>{[r.remarks, r.mananRemarks].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 tabular-nums font-black text-ink-strong" style={{ fontSize: 26 }}>{value}</div>
    </div>
  );
}
