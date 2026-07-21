import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { getCurrentEmployee } from "@/lib/auth/current";
import { mySalaryBreakup } from "@/lib/queries/salary-breakup";
import { MySalaryView, type MySalaryMonth } from "@/components/salary/my-salary-view";

export const dynamic = "force-dynamic";

const num = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

function monthLabel(ymd: string): string {
  // `month` is a DATE column → 'YYYY-MM-DD'; label the month.
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * My Salary — the employee's OWN pay, self-service. Any signed-in employee can
 * open it; it loads ONLY their own salary-breakup rows (never anyone else's).
 * The full admin Salary module lives in the Accounts room. More self-service
 * sections can be added here later.
 */
export default async function MySalaryPage() {
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");

  const rows = await mySalaryBreakup(me.id);

  const months: MySalaryMonth[] = rows.map((r) => ({
    month: String(r.month).slice(0, 7),
    label: monthLabel(String(r.month)),
    designation: r.designation ?? null,
    companyName: r.companyName ?? null,
    monthlyCtc: num(r.monthlyCtc),
    payableAfterLeave: num(r.payableAfterLeave),
    pt: num(r.pt),
    advance: num(r.advance),
    previousPending: num(r.previousPending),
    finalPayment: num(r.finalPayment),
    salaryGiven: r.salaryGiven == null ? null : num(r.salaryGiven),
    present: num(r.present),
    absent: num(r.absent),
    halfDay: num(r.halfDay),
    finalWorkingDays: num(r.finalWorkingDays),
    daysInMonth: num(r.daysInMonth),
    paid: r.paid,
    remarks: r.remarks ?? null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-altus-red-deep)" }}>
            <Wallet size={14} strokeWidth={2.6} /> Employees · My Salary
          </div>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32 }}
          >
            My Salary
          </h1>
          <p className="mt-1 text-[14.5px] text-ink-muted">
            Your monthly pay, deductions and attendance — visible only to you.
          </p>
        </header>

        <MySalaryView months={months} />
      </main>
      <DashboardFooter />
    </>
  );
}
