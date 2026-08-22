"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { XCircle } from "lucide-react";
import { FineBucketBars } from "@/components/dashboard/task-report/fine-bucket-bars";
import { Avatar } from "@/components/ui/avatar";
import type { FineBucketCount } from "@/lib/transforms/aging-buckets-fine";
import type { NotApprovedPersonRow } from "@/lib/queries/task-report";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD,
} from "@/components/dashboard/section-chrome";
import { PageShell } from "@/components/layout/page-shell";

/**
 * SENT-BACK WORK — who is carrying declined tasks, and how overdue they are.
 *
 * Moved here from the Task Analytics report. `NotApprovedPanel` is carried over
 * unchanged — same person list, same fine-bucket aging, same links — because
 * the brief was placement, not redesign.
 *
 * As with the delivery spread, the report's `ReportSection` chrome could not
 * come along: it is shared with that page's other sections. The dashboard's own
 * header + collapse wrap it instead, so this folds like every other section
 * here.
 */
export function SentBackSection({
  total,
  byPerson,
  buckets,
  undated,
  isAdmin,
  meId,
  avatarById,
}: {
  total: number;
  byPerson: NotApprovedPersonRow[];
  buckets: FineBucketCount[];
  undated: number;
  isAdmin: boolean;
  meId: string | null;
  /**
   * A PLAIN OBJECT, not a lookup function.
   *
   * This prop used to be `resolveAvatar: (id) => string | null`, handed down
   * from the dashboard page — an async SERVER component — to this one, which
   * is `"use client"`. Functions cannot cross that boundary: React has to
   * serialise every prop into the RSC payload and throws
   * "Functions cannot be passed directly to Client Components" when it meets
   * one. The throw happened while RENDERING, so the page's try/catch (which
   * only wraps the data FETCH) never saw it and <WidgetBoundary> caught it
   * instead — which is why this card, and only this card, showed
   * "Unable to load sent-back work" while the query underneath was fine.
   *
   * Every sibling widget on the page — AgingHeatmap, StatusTable,
   * TopPerformersSection — already takes the map itself. This one now matches
   * them, which is also what stops the mistake being made again: there is no
   * function left to pass.
   */
  avatarById: Record<string, string | null>;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <PageShell as="section" width="full" py={false} aria-label="Sent-back work">
      <DashboardSectionHeader
        icon={
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red)",
            }}
          >
            <XCircle size={20} strokeWidth={2.2} />
          </span>
        }
        title="Sent-back work, by person and by how overdue"
        subtitle="Tasks an Admin declined and returned. Left: who is carrying them · Right: aged against each task's effective due date (red = overdue)."
        actions={
          <CollapseToggle
            expanded={open}
            onToggle={() => setOpen((v) => !v)}
            label="sent-back work"
          />
        }
      />
      <CollapsibleBody expanded={open}>
        <div className={`${DASHBOARD_CARD} p-6 md:p-8`}>
          <NotApprovedPanel
            total={total}
            byPerson={byPerson}
            buckets={buckets}
            undated={undated}
            isAdmin={isAdmin}
            meId={meId}
            avatarById={avatarById}
          />
        </div>
      </CollapsibleBody>
    </PageShell>
  );
}

/* Carried over from task-report-view. GlassCard is the inner shell the panel
   was written against; it stays so the panel renders exactly as it did. */
const RED = "var(--color-altus-red, #E10600)";

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-md:p-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <span
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-ink-subtle) 12%, transparent)",
          color: "var(--color-ink-subtle)",
        }}
      >
        {icon}
      </span>
      <p
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-serif), serif", fontWeight: 700, fontSize: 18 }}
      >
        {title}
      </p>
      <p className="max-w-[420px] text-[13px] font-semibold text-ink-subtle">{body}</p>
    </div>
  );
}

function NotApprovedPanel({
  total,
  byPerson,
  buckets,
  undated,
  isAdmin,
  meId,
  avatarById,
}: {
  total: number;
  byPerson: NotApprovedPersonRow[];
  buckets: FineBucketCount[];
  undated: number;
  isAdmin: boolean;
  meId: string | null;
  avatarById: Record<string, string | null>;
}) {
  // Defaulted at the point of USE, not just at the call site. `byPerson` and
  // `buckets` arrive from a 60s-memoised payload that a previous deploy may
  // have shaped differently, and `.filter` on an absent array throws during
  // render — the failure mode this whole section just spent a bug on.
  const rows = byPerson ?? [];
  // Privacy: admins see everyone; a non-admin sees only their own row.
  const people = isAdmin ? rows : rows.filter((p) => p.employeeId === meId);

  if (total === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={<XCircle size={24} strokeWidth={2.2} />}
          title="No tasks awaiting re-work"
          body="Nothing has been sent back for correction. When an admin declines a task it appears here, by person and by how overdue it is."
        />
      </GlassCard>
    );
  }

  // Seeded with 1 so an all-zero list cannot divide by zero, and spread LAST
  // so a long roster cannot blow the argument limit ahead of the seed.
  const maxCount = Math.max(1, ...people.map((p) => p.count ?? 0));

  return (
    <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
      {/* LEFT — person-wise */}
      <GlassCard>
        <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          By person · most first
          <span className="ml-2 tabular-nums text-ink-soft">{total} total</span>
        </p>
        {people.length === 0 ? (
          <p className="mt-4 text-[13.5px] font-semibold text-ink-subtle">
            You have no tasks awaiting re-work.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {people.map((p) => {
              const w = (p.count / maxCount) * 100;
              return (
                <li key={p.employeeId}>
                  {/* The whole row is the target, bar included — the bar is the
                      thing the eye lands on, so making only the name clickable
                      would put the affordance in the wrong place.

                      `emp`, not `doer`, and the employee ID rather than a name
                      slug: that is what parseTaskFilters already reads and what
                      the query filters on. A slug would need a reverse lookup
                      and would break on renames and duplicate names. */}
                  <Link
                    href={
                      `/tasks?emp=${encodeURIComponent(p.employeeId)}&status=not_approved&overdue=true` as Route
                    }
                    title={`Open ${p.employeeName}'s overdue sent-back tasks`}
                    className="flex items-center gap-3 rounded-lg px-1 py-1 -mx-1 transition-colors hover:bg-slate-50"
                  >
                  <Avatar name={p.employeeName} avatarUrl={avatarById[p.employeeId] ?? null} size={32} />
                  <span
                    className="w-[30%] shrink-0 truncate text-[13.5px] font-bold text-ink-strong"
                    title={p.employeeName}
                  >
                    {p.employeeName}
                  </span>
                  <span
                    className="relative h-3 flex-1 overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)" }}
                  >
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${w}%`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${RED} 75%, transparent), ${RED})`,
                      }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[14px] font-black tabular-nums" style={{ color: RED }}>
                    {p.count}
                  </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {/* RIGHT — aging across the fine buckets.
          `h-full flex flex-col` on the card + `flex-1` on the chart wrapper is
          what lets the nine rows absorb the height the taller left panel sets,
          instead of the card ending early and leaving a white band. */}
      <GlassCard className="flex h-full flex-col">
        <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          How overdue · vs effective due date
        </p>
        <div className="mt-4 flex flex-1 flex-col">
          <FineBucketBars
            buckets={buckets ?? []}
            earlyLabel="not yet due"
            lateLabel="overdue"
            // Every task in THIS chart is sent-back work by construction — it is
            // the Not Approved section — so the drill-through and the tooltip's
            // split can both state that rather than infer it per row.
            linkStatuses={["not_approved"]}
            statusBreakdown={(count) => [
              { label: "Not Approved", value: count },
              { label: "Pending", value: 0 },
            ]}
          />
        </div>
        {undated > 0 && (
          <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
            {undated} declined without a due date — not placed.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
