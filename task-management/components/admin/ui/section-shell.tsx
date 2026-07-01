import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { StatPill, type StatTone } from "@/components/admin/ui/stat-pill";
import { cn } from "@/lib/utils";

export interface AdminSectionStat {
  label: string;
  value: string | number;
  tone?: StatTone;
}

export interface AdminSectionProps {
  /** Breadcrumb eyebrow, e.g. "ADMIN · PEOPLE". Rendered uppercased. */
  eyebrow?: string;
  /** The big display title, e.g. "The team". */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Optional lucide icon rendered in the brand-red tile beside the title. */
  icon?: LucideIcon;
  /** Premium stat pills rendered in a row under the title. */
  stats?: AdminSectionStat[];
  /** Right-aligned actions slot (buttons, export links, primary dialogs). */
  actions?: ReactNode;
  /** The page body — lists, tables, forms. */
  children: ReactNode;
  className?: string;
}

/**
 * The shared premium header + body frame for every admin section page.
 *
 * Server-safe (no hooks, no "use client") — drop it straight into an
 * admin section page.tsx (a server component). It renders a glassy
 * brand-red-tinted, frosted header band (breadcrumb eyebrow, big display
 * title, optional subtitle + icon, a right-aligned `actions` slot, and a row
 * of premium `StatPill`s), then the `children` below in a comfortable
 * max-width container with a staggered `wg-rise` entrance.
 *
 * Usage:
 *   <AdminSection
 *     eyebrow="Admin · Employees"
 *     title="The team"
 *     subtitle="12 total · 9 active · 3 pending invite"
 *     icon={Users}
 *     stats={[
 *       { label: "Total", value: 12 },
 *       { label: "Active", value: 9, tone: "green" },
 *       { label: "Pending", value: 3, tone: "amber" },
 *     ]}
 *     actions={<InviteEmployeeDialog … />}
 *   >
 *     <EmployeeList … />
 *   </AdminSection>
 */
export function AdminSection({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  stats,
  actions,
  children,
  className,
}: AdminSectionProps) {
  return (
    <div className={cn("wg-rise", className)}>
      <header className="admin-section-band px-6 py-6 max-md:px-4 max-md:py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex items-start gap-4">
            {Icon ? (
              <span
                className="admin-section-icon shrink-0 mt-0.5"
                style={{ width: 52, height: 52 }}
                aria-hidden
              >
                <Icon size={26} strokeWidth={2.1} />
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-altus-red-deep/90">
                  {eyebrow}
                </div>
              ) : null}
              <h1
                className="mt-1 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), var(--font-serif), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 44,
                  lineHeight: 1.02,
                  letterSpacing: "-0.03em",
                }}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 max-w-2xl text-[15px] font-medium text-ink-muted tabular-nums">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex items-center gap-2.5 shrink-0 mt-1">{actions}</div>
          ) : null}
        </div>

        {stats && stats.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2.5">
            {stats.map((s, i) => (
              <StatPill
                key={`${s.label}-${i}`}
                label={s.label}
                value={s.value}
                tone={s.tone}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-6">{children}</div>
    </div>
  );
}
