import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { getCurrentEmployee, guardNotCandidate } from "@/lib/auth/current";
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
  guardNotCandidate(me);

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
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4 max-md:pt-5 max-md:pb-6">
        <PageCommandBar
          title="My Salary"
          hint="Your monthly pay, deductions and attendance — visible only to you."
        />

        <MySalaryView months={months} />
      </main>
    </>
  );
}
