/**
 * /appraisal/admin — Appraisal v2 ADMIN PANEL (admin-only).
 *
 * Pick a department + employee, then shape that person's live scorecard config:
 * the <=5 KPIs, the <=3 Skills, the incentive target, the knowledge do/give
 * rule, the six dimension weights (sum-to-100), and the manager + management
 * assignees. All edits go through the "use server" admin actions.
 *
 * Non-admins are bounced back to the read /appraisal surface.
 */
import { redirect } from "next/navigation";
import type { Route } from "next";
import { asc, eq } from "drizzle-orm";
import { SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import {
  apprConfig,
  apprKpi,
  apprSkill,
  designations,
  employees,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { DEFAULT_WEIGHTS, type ApprDimension } from "@/lib/appraisal2/types";
import {
  AdminPanel,
  type AdminEmployee,
  type EmployeeConfig,
} from "@/components/appraisal2/admin-panel";

export const dynamic = "force-dynamic";

const ACCENT = "var(--color-altus-red)";
const ACCENT_DEEP = "var(--color-altus-red-deep)";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toWeights(raw: unknown): Record<ApprDimension, number> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<ApprDimension, number>;
  for (const d of Object.keys(DEFAULT_WEIGHTS) as ApprDimension[]) {
    const v = Number(obj[d]);
    out[d] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[d];
  }
  return out;
}

export default async function AppraisalAdminPage({ searchParams }: PageProps) {
  requireAppraisal();
  const me = await requireUser();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  if (!isAdmin) redirect("/appraisal" as Route);

  const sp = await searchParams;
  const selectedId = typeof sp.emp === "string" ? sp.emp : null;

  // Full active roster (picker + manager/management assignee options).
  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      designation: designations.name,
      avatarUrl: employees.avatarUrl,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  const people: AdminEmployee[] = roster.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department,
    designation: r.designation,
    avatarUrl: r.avatarUrl,
  }));

  const departments = Array.from(
    new Set(people.map((p) => p.department).filter((d): d is string => !!d)),
  ).sort((a, b) => a.localeCompare(b));

  // Selected employee's current config, KPIs and Skills.
  let config: EmployeeConfig | null = null;
  if (selectedId && people.some((p) => p.id === selectedId)) {
    const [cfgRow, kpiRows, skillRows] = await Promise.all([
      db.query.apprConfig.findFirst({ where: eq(apprConfig.employeeId, selectedId) }),
      db
        .select()
        .from(apprKpi)
        .where(eq(apprKpi.employeeId, selectedId))
        .orderBy(asc(apprKpi.srNo), asc(apprKpi.createdAt)),
      db
        .select()
        .from(apprSkill)
        .where(eq(apprSkill.employeeId, selectedId))
        .orderBy(asc(apprSkill.createdAt)),
    ]);

    config = {
      employeeId: selectedId,
      managerId: cfgRow?.managerId ?? null,
      managementId: cfgRow?.managementId ?? null,
      incentiveTarget: cfgRow?.incentiveTarget ?? null,
      knowledgeDo: cfgRow?.knowledgeDo ?? 1,
      knowledgeGive: cfgRow?.knowledgeGive ?? 1,
      weights: toWeights(cfgRow?.dimensionWeights),
      kpis: kpiRows.map((k) => ({
        id: k.id,
        srNo: k.srNo,
        area: k.area,
        measure: k.measure,
        subWeight: k.subWeight,
      })),
      skills: skillRows.map((s) => ({
        id: s.id,
        name: s.name,
        technical: s.technical,
        subWeight: s.subWeight,
      })),
    };
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <SlidersHorizontal size={13} strokeWidth={2.6} /> Appraisal · Admin config
            </span>
          </div>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,44px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Scorecard configuration
          </h1>
          <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
            Pick a person, then set their KPIs, skills-to-learn, incentive target, knowledge rule,
            dimension weights and the manager + management assignees.
          </p>
        </header>

        <AdminPanel
          people={people}
          departments={departments}
          selectedId={selectedId}
          config={config}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
