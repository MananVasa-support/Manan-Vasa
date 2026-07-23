import { and, eq, sql } from "drizzle-orm";
import { FileText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { db } from "@/lib/db";
import { employees, designations, letterTemplates } from "@/db/schema";
import { formatMergeDate } from "@/lib/hr-docs/merge";
import { listTemplates } from "@/app/(app)/hr-docs/actions";
import { DocumentHub } from "@/components/hr-docs/document-hub";
import { SelfDocsPanel, type RequestTemplate } from "@/components/hr-docs/request-dialog";
import type { HrDocEmployee } from "@/components/hr-docs/compose-dialog";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * HR Documents room — the Document Hub (Phase 3). Admins compose from the 26-type
 * library, edit template bodies, and track issued documents. A non-admin lands on
 * their own issued documents (same self-view the dossier embeds).
 */
export default async function HrDocsPage() {
  const me = await requireWorkspace("hr");
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  if (!isAdmin) {
    const [reqRows, desigRows] = await Promise.all([
      db
        .select({
          typeKey: letterTemplates.typeKey,
          title: letterTemplates.title,
          bodyMd: letterTemplates.bodyMd,
        })
        .from(letterTemplates)
        .where(and(eq(letterTemplates.trigger, "request"), eq(letterTemplates.active, true))),
      me.designationId
        ? db
            .select({ name: designations.name })
            .from(designations)
            .where(eq(designations.id, me.designationId))
            .limit(1)
        : Promise.resolve([] as { name: string }[]),
    ]);
    const requestTemplates: RequestTemplate[] = reqRows;

    return (
      <Shell subtitle="Your issued letters, agreements and certificates — plus raise a leave or resignation request.">
        <SelfDocsPanel
          employeeId={me.id}
          user={{
            name: me.name,
            email: me.email ?? "",
            department: me.department ?? "",
            designation: desigRows[0]?.name ?? "",
          }}
          requestTemplates={requestTemplates}
        />
      </Shell>
    );
  }

  const [templatesRes, roster] = await Promise.all([listTemplates(), loadRoster()]);
  const templates = templatesRes.ok ? templatesRes.templates : [];

  return (
    <Shell subtitle="Compose from the letter library, edit the body of any template, and track what's been issued.">
      <DocumentHub templates={templates} roster={roster} isAdmin hrName={me.name} />
    </Shell>
  );
}

/** Active roster with the fields the merge engine + preview need. */
async function loadRoster(): Promise<HrDocEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      joinedAt: employees.joinedAt,
      designation: designations.name,
      managerId: employees.managerId,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`);

  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    department: r.department ?? "",
    designation: r.designation ?? "",
    reportingManager: r.managerId ? nameById.get(r.managerId) ?? "" : "",
    joiningDate: formatMergeDate(r.joinedAt),
  }));
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1280px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <FileText size={13} strokeWidth={2.6} /> HR · Documents
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(30px,3.6vw,46px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Document Hub
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">{subtitle}</p>
        </header>
        {children}
      </main>
      <DashboardFooter />
    </>
  );
}
