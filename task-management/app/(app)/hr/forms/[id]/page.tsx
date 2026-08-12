import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { hrFormSubmissions } from "@/lib/hr/forms/schema";
import { hrSectionLabel } from "@/lib/hr/forms/registry";
import { canViewHrSubmission } from "@/lib/hr/forms/access";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * HR · a single filled form — the completed responses, read-only.
 *
 * One page serves BOTH surfaces (the employee's list and HR's), because the
 * thing being shown is identical; only who may see it differs. That check lives
 * in `canViewHrSubmission` so this page, the PDF route and the email route all
 * enforce the same rule instead of three drifting copies.
 *
 * A refusal renders `notFound()` rather than a "forbidden" page: telling an
 * employee that submission #123 exists but isn't theirs leaks that it exists.
 */
export default async function HrFormSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select({
      id: hrFormSubmissions.id,
      formName: hrFormSubmissions.formName,
      section: hrFormSubmissions.section,
      status: hrFormSubmissions.status,
      responses: hrFormSubmissions.responses,
      submittedAt: hrFormSubmissions.submittedAt,
      updatedAt: hrFormSubmissions.updatedAt,
      employeeId: hrFormSubmissions.employeeId,
      employeeName: employees.name,
    })
    .from(hrFormSubmissions)
    .innerJoin(employees, eq(hrFormSubmissions.employeeId, employees.id))
    .where(eq(hrFormSubmissions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const access = await canViewHrSubmission(row.employeeId);
  if (!access.allowed) notFound();

  // Group the flat response list back into the form's sections for reading.
  const groups = new Map<string, { question: string; answer: string }[]>();
  for (const r of row.responses ?? []) {
    const key = r.group ?? "Responses";
    const list = groups.get(key) ?? [];
    list.push({ question: r.question, answer: r.answer });
    groups.set(key, list);
  }

  const backHref = (access.isHrStaff ? "/hr/all-forms" : "/hr/my-forms") as Route;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="standard">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={14} /> Back to filled forms
        </Link>

        <header className="mb-5 border-b border-hairline pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(20px, 2vw, 28px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                {row.formName}
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                {hrSectionLabel(row.section)} · {row.employeeName} ·{" "}
                {row.submittedAt
                  ? `Submitted ${formatDate(row.submittedAt)}`
                  : `Draft · last saved ${formatDate(row.updatedAt)}`}
              </p>
            </div>
            <a
              href={`/api/hr/forms/${row.id}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
            >
              <Download size={13} strokeWidth={2.4} /> Download PDF
            </a>
          </div>
        </header>

        {groups.size === 0 ? (
          <p className="rounded-xl border border-hairline bg-surface-card px-6 py-12 text-center text-[13px] text-ink-muted">
            This form has no saved answers yet.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {Array.from(groups, ([group, items]) => (
              <section key={group}>
                <h2 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                  {group}
                </h2>
                <dl className="flex flex-col gap-3">
                  {items.map((it, i) => (
                    <div key={`${group}-${i}`} className="border-b border-hairline pb-3 last:border-b-0">
                      <dt className="text-[12.5px] font-semibold text-ink-muted">{it.question}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-[14px] font-medium text-ink-strong">
                        {it.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </PageShell>
    </>
  );
}
