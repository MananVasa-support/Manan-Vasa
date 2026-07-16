import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { listSalaryProfiles } from "@/lib/queries/salary";
import {
  ExitDocumentsWorkbench,
  type EmployeeOption,
} from "@/components/salary/exit-documents-workbench";

export const dynamic = "force-dynamic";

/* Employees-module identity — matches the Salary page. */
const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/** Known paying entities so the signatory mapping is always selectable, even
 *  before any employee is tagged to them. */
const SEED_ENTITIES = ["Altus Corp", "MJV HUF", "JSV HUF", "Unleashed"];

export default async function SalaryDocumentsPage() {
  // Default ON (Sir 2026-07-09 — reveal exit-doc/signatory screens). Killable via
  // SALARY_DOCS_UI=false. Documents are generated on demand; no payroll math here.
  if (process.env.SALARY_DOCS_UI === "false") notFound();
  await requireAdmin();

  const profiles = await listSalaryProfiles();
  const employees: EmployeeOption[] = profiles.map((p) => ({
    employeeId: p.employeeId,
    name: p.name,
    designation: p.designationName,
    entity: p.payingEntityName,
  }));

  const entities = Array.from(
    new Set([
      ...SEED_ENTITIES,
      ...profiles.map((p) => p.payingEntityName).filter((x): x is string => Boolean(x)),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header
          className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${GREEN} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${GREEN} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
          >
            <FileSignature size={13} strokeWidth={2.6} /> Employees · Salary · Documents
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,42px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Exit documents
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            Generate the Full &amp; Final Settlement, Return of Company Assets and Handover
            Accepted letters — each closed with the entity&apos;s Authorised Signatory block.
          </p>
        </header>

        <ExitDocumentsWorkbench employees={employees} entities={entities} />
      </main>
      <DashboardFooter />
    </>
  );
}
