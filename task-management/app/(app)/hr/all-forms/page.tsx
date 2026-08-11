import { desc, eq } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PageShell } from "@/components/layout/page-shell";
import { HrPageHeader } from "@/components/hr/hr-chrome";
import { requireHrStaff } from "@/lib/hr/access";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { hrFormSubmissions } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import { formatDate } from "@/lib/format";
import {
  FilledFormsTable,
  type FilledFormRow,
} from "@/components/hr/forms/filled-forms-table";

export const dynamic = "force-dynamic";

/**
 * HR · All Filled Forms — every employee's submissions, for HR and admins.
 *
 * PERMISSION MODEL: `requireHrStaff()` is the entire boundary, and it runs
 * before any query. A normal employee never reaches the data; they use
 * /hr/my-forms, which is hard-scoped to their own id. The same check is
 * re-asserted inside the View page and the PDF/email routes, because a list
 * gate protects the list and nothing else.
 *
 * Search / section / form / status filtering and sorting happen client-side in
 * `FilledFormsTable`: the whole set ships in one query, which keeps filtering
 * instant and avoids a round trip per keystroke. If this ever outgrows a single
 * page, the ordering here is already the newest-first index the table expects.
 */
export default async function AllFilledFormsPage() {
  await requireHrStaff();

  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formKey: hrFormSubmissions.formKey,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
      employeeName: employees.name,
    })
    .from(hrFormSubmissions)
    .innerJoin(employees, eq(hrFormSubmissions.employeeId, employees.id))
    .orderBy(desc(hrFormSubmissions.submittedAt), desc(hrFormSubmissions.updatedAt));

  const tableRows: FilledFormRow[] = rows.map((r) => ({
    id: r.id,
    formKey: r.formKey,
    formName: r.formName,
    section: r.section,
    sectionLabel: hrSectionLabel(r.section),
    employeeName: r.employeeName,
    submittedOn: r.submittedAt ? formatDate(r.submittedAt) : r.updatedAt ? formatDate(r.updatedAt) : "",
    submittedTs: r.submittedAt ? new Date(r.submittedAt).getTime() : 0,
    status: r.status,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader
          title="All Filled Forms"
          subtitle="Every employee's HR form submissions — search, filter, view, download or mail."
        />
        <FilledFormsTable rows={tableRows} variant="all" />
      </PageShell>
      <DashboardFooter />
    </>
  );
}
