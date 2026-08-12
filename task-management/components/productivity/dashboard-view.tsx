import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { formatPct, isCriticalGrade, type Grade } from "@/lib/productivity/calc";
import type { ProductivitySnapshot } from "@/lib/productivity/data";

/**
 * The Productivity Dashboard — ONE unified page (§6). KPI, Goals, Tasks,
 * Training and (for managers) Manager are sections of a single scroll, never
 * separate routes.
 *
 * The same component renders every context (§22): your own My Dashboard, a
 * manager viewing a direct report, an admin viewing anyone. Only the header and
 * the optional back-link change, so there is no separate "admin design" to drift.
 *
 * DESIGN (§25): a performance cockpit, not a card gallery. Grades are the loudest
 * thing on screen because they are the answer; percentages sit under them;
 * supporting values are small and scannable. Cards are uniform, centred, and
 * carry no decoration that isn't information. Poor grades are the only place
 * colour shouts.
 */

export function ProductivityDashboardView({
  snap,
  backHref,
  viewingOther,
}: {
  snap: ProductivitySnapshot;
  /** Set when arriving from Team Performance (§5). */
  backHref?: Route;
  /** True when this is somebody else's dashboard — makes whose it is explicit (§7). */
  viewingOther: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={14} /> Back to Team Performance
        </Link>
      )}

      {/* ── Employee header (§7) ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-surface-card px-5 py-4">
        <div className="flex items-center gap-3.5">
          <EmployeeAvatar name={snap.employee.name} size="lg" />
          <div className="min-w-0">
            {viewingOther && (
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-altus-red">
                Viewing · Productivity Dashboard
              </div>
            )}
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
              {snap.employee.name}
            </h1>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              {[snap.employee.designation, snap.employee.department].filter(Boolean).join(" · ") || "—"}
              {snap.employee.managerName && ` · Reporting Manager: ${snap.employee.managerName}`}
            </p>
          </div>
        </div>

        {/* Full Report (§27) */}
        <div className="flex items-center gap-2">
          <Link
            href={`/productivity/report?emp=${snap.employee.id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
          >
            <FileText size={13} strokeWidth={2.4} /> View Full Report
          </Link>
          <a
            href={`/api/productivity/report/${snap.employee.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            <Download size={13} strokeWidth={2.4} /> Download
          </a>
        </div>
      </header>

      {/* ── 1 · KPI (§8) ── */}
      <Section title="KPI" hint="Incentive against base salary">
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {snap.kpi.map((k) => (
            <Card key={k.key} label={k.label}>
              <GradeMark grade={k.grade} />
              <Pct value={k.incentivePct} />
              <Sub>{money(k.incentiveAmount)} incentive</Sub>
              <Sub muted>on {money(k.baseSalary)} base</Sub>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── 2 · Goals (§11) ── */}
      <Section title="Goals">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card label="Monthly Goals">
            <GradeMark grade={snap.goals.monthly.grade} />
            <Pct value={snap.goals.monthly.pct} />
            <Sub>
              {fmt(snap.goals.monthly.completed)} / {fmt(snap.goals.monthly.target)}
            </Sub>
          </Card>
          <Card label="MTD Goals">
            <GradeMark grade={snap.goals.mtd.grade} />
            <Pct value={snap.goals.mtd.pct} />
            <Sub>
              {fmt(snap.goals.mtd.completed)} / {fmt(snap.goals.mtd.target)}
            </Sub>
            <Sub muted>
              {snap.goals.mtd.weeks} week{snap.goals.mtd.weeks === 1 ? "" : "s"} this month
            </Sub>
          </Card>
        </div>
      </Section>

      {/* ── 3 · Tasks (§15) ── */}
      <Section title="Tasks" hint="Open assigned work, by how late it is">
        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          <CountCard label="Overdue > 15 days" value={snap.tasks.over15} critical={snap.tasks.over15 > 0} />
          <CountCard label="Overdue 8–14 days" value={snap.tasks.days8to14} warn={snap.tasks.days8to14 > 0} />
          <CountCard label="Overdue 1–3 days" value={snap.tasks.days1to3} warn={snap.tasks.days1to3 > 0} />
          <CountCard label="Needs Help" value={snap.tasks.needHelp} warn={snap.tasks.needHelp > 0} />
        </div>
      </Section>

      {/* ── 4 · Training, with Daily Checklist nested (§16, §17) ── */}
      <Section title="Training" hint={`Target ${snap.training.targetHours} hrs / month`}>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card label="Training Given">
            <Big>
              {snap.training.givenHours} <span className="text-[15px] font-bold text-ink-subtle">/ {snap.training.targetHours} hrs</span>
            </Big>
            <Pct value={snap.training.givenPct} />
          </Card>
          <Card label="Training Attended">
            <Big>
              {snap.training.attendedHours} <span className="text-[15px] font-bold text-ink-subtle">/ {snap.training.targetHours} hrs</span>
            </Big>
            <Pct value={snap.training.attendedPct} />
          </Card>
          {/* Daily Checklist lives INSIDE Training — it is not a fifth section. */}
          <Card label="Daily Checklist">
            <GradeMark grade={snap.training.checklist.grade} />
            <Pct value={snap.training.checklist.pct} />
            <Sub>
              {snap.training.checklist.completed} / {snap.training.checklist.target} items
            </Sub>
          </Card>
        </div>
      </Section>

      {/* ── 5 · Manager — managers only (§18) ── */}
      {snap.manager && (
        <Section title="Manager" hint="Work handed to your direct reports">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <CountCard label="Tasks Delegated" value={snap.manager.tasksDelegated} />
            <CountCard label="Goals Delegated" value={snap.manager.goalsDelegated} />
          </div>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-strong">{title}</h2>
        {hint && <span className="text-[11.5px] text-ink-subtle">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Uniform card — centred, same height everywhere, no decoration (§25). */
function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[136px] flex-col items-center justify-center rounded-xl border border-hairline bg-surface-card px-3 py-4 text-center">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</div>
      {children}
    </div>
  );
}

function CountCard({
  label,
  value,
  critical,
  warn,
}: {
  label: string;
  value: number;
  critical?: boolean;
  warn?: boolean;
}) {
  const color = critical ? "#dc2626" : warn ? "#d97706" : "var(--color-ink-strong)";
  return (
    <Card label={label}>
      <div className="text-[38px] font-black leading-none tabular-nums" style={{ color }}>
        {value}
      </div>
    </Card>
  );
}

/** The grade — deliberately the largest mark on the card (§25). */
function GradeMark({ grade }: { grade: Grade }) {
  return (
    <div
      className="text-[40px] font-black leading-none tracking-tight"
      style={{ color: isCriticalGrade(grade) ? "#dc2626" : "var(--color-ink-strong)" }}
    >
      {grade}
    </div>
  );
}

/** The percentage — smaller than the grade, by design. */
function Pct({ value }: { value: number | null }) {
  return <div className="mt-1 text-[14px] font-bold tabular-nums text-ink-soft">{formatPct(value)}</div>;
}

function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-[30px] font-black leading-none tabular-nums text-ink-strong">{children}</div>;
}

function Sub({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`mt-1 text-[11.5px] tabular-nums ${muted ? "text-ink-subtle" : "text-ink-muted"}`}>
      {children}
    </div>
  );
}

/** Whole rupees — the paise on an incentive figure are noise at this size. */
function money(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Goal tallies are percentage-points; drop the decimal unless it carries. */
function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
