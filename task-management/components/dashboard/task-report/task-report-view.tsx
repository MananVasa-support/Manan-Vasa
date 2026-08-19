"use client";

import Link from "next/link";
import type { Route } from "next";
import * as React from "react";
import { motion } from "motion/react";
import {
  CalendarCheck2,
  XCircle,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { FineBucketBars } from "@/components/dashboard/task-report/fine-bucket-bars";
import { ManagerInitiatorCard } from "@/components/dashboard/exec/manager-initiator-card";
import { ManagerDrilldown } from "@/components/dashboard/exec/manager-drilldown";
import { useReducedMotion } from "@/lib/motion-utils";
import type {
  DoneFineDistribution,
  NotApprovedPersonRow,
  TaskReportData,
} from "@/lib/queries/task-report";
import type { FineBucketCount } from "@/lib/transforms/aging-buckets-fine";
import type { InitiatorBoard } from "@/lib/types";
import { PageShell } from "@/components/layout/page-shell";

const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-altus-red, #E10600)";

type WindowKey = "d3" | "d7";

export interface TaskReportViewProps {
  data: TaskReportData;
  avatarById: Record<string, string | null>;
  isAdmin: boolean;
  meId: string | null;
}

export function TaskReportView({ data, avatarById, isAdmin, meId }: TaskReportViewProps) {
  const reduce = useReducedMotion() ?? false;
  const resolveAvatar = React.useCallback(
    (id: string): string | null => avatarById[id] ?? null,
    [avatarById],
  );

  const rise = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <PageShell as="div" width="full" py={false} className="pb-20">
      {/* ── Section 1 + 2: the two DONE distributions, side by side ── */}
      <motion.section {...rise(0)} aria-label="Done on time by due-date basis">
        <SectionHeader
          icon={<CalendarCheck2 size={22} strokeWidth={2.4} />}
          kicker="Done on time"
          title="Delivery vs due date — the 12-bucket spread"
          subtitle="Completed tasks categorized by delivery timing relative to their committed due dates."
        />
        {/* ONE distribution now. The "By REVISED due date" panel is removed —
            the split below reuses the width it occupied to separate late from
            on-time/early, which is the comparison people actually read this
            chart for. `data.doneByRevised` is still computed upstream; nothing
            renders it. */}
        <DoneCard dist={data.doneByOriginal} label="By ORIGINAL due date" />
      </motion.section>

      {/* ── Section 3: Not Approved ── */}
      <motion.section {...rise(0.08)} className="mt-12" aria-label="Not-approved tasks">
        <SectionHeader
          icon={<XCircle size={22} strokeWidth={2.4} />}
          kicker="Not approved"
          title="Sent-back work, by person and by how overdue"
          subtitle="Tasks an admin declined and returned. Left: who is carrying them · Right: aged against each task's effective due date (red = overdue)."
          tone="red"
        />
        <NotApprovedPanel
          total={data.notApproved.total}
          byPerson={data.notApproved.byPerson}
          buckets={data.notApproved.buckets}
          undated={data.notApproved.undated}
          isAdmin={isAdmin}
          meId={meId}
          resolveAvatar={resolveAvatar}
        />
      </motion.section>

      {/* ── Section 4: Task Initiator scorecards ── */}
      <motion.section {...rise(0.12)} className="mt-12" aria-label="Task initiator scorecards">
        <SectionHeader
          icon={<Users size={22} strokeWidth={2.4} />}
          kicker="Task initiator"
          title="Who is delegating — target vs actual"
          subtitle="Tasks each manager handed to their direct reports, scored against the target of 3 tasks per report per working day."
        />
        <InitiatorPanel
          initiator={data.initiator}
          isAdmin={isAdmin}
          meId={meId}
          resolveAvatar={resolveAvatar}
        />
      </motion.section>
    </PageShell>
  );
}

/* ───────────────────────────── Section header ─────────────────────────── */

function SectionHeader({
  icon,
  kicker,
  title,
  subtitle,
  tone = "brand",
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  subtitle: string;
  tone?: "brand" | "red";
}) {
  const accent = tone === "red" ? RED : "var(--color-altus-red-deep)";
  return (
    <header className="mb-5">
      <p
        className="inline-flex items-center gap-2 text-[10.5px] font-black uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        <span
          className="inline-flex size-7 items-center justify-center rounded-lg"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 11%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          {icon}
        </span>
        {kicker}
      </p>
      <h2
        className="mt-2 leading-tight text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 26,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      {/* Single line from lg up. The max-w-[820px] cap is what wrapped these;
          with it gone `whitespace-nowrap` keeps each subtitle on one row.

          lg, not md, because this rule is shared by all three sections and the
          longest subtitle here is 134 characters ≈ 870px at 14px. That clears
          the ~970px of content width at lg, but not the ~710px at md — and a
          nowrap line wider than its container does not truncate, it pushes the
          whole page into horizontal scroll. Below lg they wrap, which is the
          lesser evil. */}
      <p className="mt-1.5 text-[14px] font-semibold text-ink-subtle max-lg:whitespace-normal lg:whitespace-nowrap">
        {subtitle}
      </p>
    </header>
  );
}

/* ───────────────────────── Card chrome (cream glass) ───────────────────── */

/**
 * The report's card surface. Clean white with a hairline grey border — the
 * cream/beige gradient it replaced (#FBF7F0 → #F4EEE3) tinted every colour
 * sitting on it, which the nine-tier delivery ramp cannot tolerate: the neutral
 * "On Due Date" tier is defined as white, and on a beige ground it read as
 * another filled band rather than the neutral pivot.
 */
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm max-md:p-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/* ──────────────────────── ① + ② DONE distribution card ─────────────────── */

function DoneCard({ dist, label }: { dist: DoneFineDistribution; label: string }) {
  const rate = dist.dated > 0 ? Math.round((dist.onTime / dist.dated) * 100) : 0;
  // One denominator across BOTH halves, taken from the full distribution, so a
  // bar's length means the same thing on either side of the split.
  const barScale = Math.max(...dist.buckets.map((b) => b.count), 1);
  return (
    <GlassCard>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            {label}
          </p>
          <div className="mt-1 flex items-end gap-2.5">
            <span
              className="tabular-nums leading-none"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 46,
                letterSpacing: "-0.02em",
                color: GREEN,
              }}
            >
              {rate}%
            </span>
            <span className="mb-1.5 text-[12.5px] font-bold text-ink-soft">on time</span>
          </div>
        </div>
        <div className="text-right text-[12.5px] font-bold">
          <p style={{ color: GREEN }}>
            <span className="tabular-nums text-ink-strong">{dist.onTime}</span> on / before
          </p>
          <p style={{ color: RED }}>
            <span className="tabular-nums text-ink-strong">{dist.late}</span> late
          </p>
        </div>
      </div>

      {/* Side-by-side split. The buckets are already ordered most-overdue first
          through earliest-delivery last, so `fineBucketIsLate` cuts the list
          cleanly in two at the "On Due Date" boundary — no re-ordering and no
          second source of truth for which band is which.
          On Due Date sits on the RIGHT: delivering exactly on the committed day
          is hitting the deadline, not missing it. */}
      <div className="mt-5 grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <FineBucketBars
          buckets={dist.buckets.filter((b) => b.late)}
          heading="Overdue"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
        <FineBucketBars
          buckets={dist.buckets.filter((b) => !b.late)}
          heading="On time & early"
          scaleMax={barScale}
          percentBase={dist.dated}
        />
      </div>

      {dist.undated > 0 && (
        <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
          {dist.undated} done without a comparable date — not counted.
        </p>
      )}
    </GlassCard>
  );
}

/* ──────────────────────────── ③ Not-approved ───────────────────────────── */

function NotApprovedPanel({
  total,
  byPerson,
  buckets,
  undated,
  isAdmin,
  meId,
  resolveAvatar,
}: {
  total: number;
  byPerson: NotApprovedPersonRow[];
  buckets: FineBucketCount[];
  undated: number;
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (id: string) => string | null;
}) {
  // Privacy: admins see everyone; a non-admin sees only their own row.
  const people = isAdmin ? byPerson : byPerson.filter((p) => p.employeeId === meId);

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

  const maxCount = Math.max(...people.map((p) => p.count), 1);

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
                  <Avatar name={p.employeeName} avatarUrl={resolveAvatar(p.employeeId)} size={32} />
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
            buckets={buckets}
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

/* ─────────────────────────── ④ Task initiator ──────────────────────────── */

function InitiatorPanel({
  initiator,
  isAdmin,
  meId,
  resolveAvatar,
}: {
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (id: string) => string | null;
}) {
  const [windowKey, setWindowKey] = React.useState<WindowKey>("d7");
  const [openManagerId, setOpenManagerId] = React.useState<string | null>(null);
  const board = initiator[windowKey];
  const windowDays: 3 | 7 = windowKey === "d3" ? 3 : 7;

  const managers = isAdmin
    ? board.managers
    : board.managers.filter((m) => m.managerId === meId);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  function nudge(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(420, el.clientWidth * 0.9), behavior: "smooth" });
  }

  return (
    <GlassCard>
      <div className="mb-5 flex items-end justify-between gap-4 max-md:flex-col max-md:items-stretch">
        <p className="text-[13px] font-semibold text-ink-subtle">
          Target ={" "}
          <span className="tabular-nums font-black text-ink-soft">3 × {board.workingDays}</span>{" "}
          working {board.workingDays === 1 ? "day" : "days"} × direct reports
        </p>
        <div className="flex items-center gap-2">
          <WindowToggle value={windowKey} onChange={setWindowKey} />
          {managers.length > 1 && (
            <div className="flex items-center gap-1.5 max-md:hidden">
              <RailArrow dir={-1} onClick={() => nudge(-1)} />
              <RailArrow dir={1} onClick={() => nudge(1)} />
            </div>
          )}
        </div>
      </div>

      {managers.length === 0 ? (
        <EmptyState
          icon={<Users size={24} strokeWidth={2.2} />}
          title="No managers with direct reports yet"
          body="Assign reporting lines in Admin → Employees to see initiation scorecards."
        />
      ) : (
        <div
          ref={scrollerRef}
          className="task-report-rail flex gap-4 overflow-x-auto pb-2"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {managers.map((m) => (
            <div
              key={m.managerId}
              className="shrink-0"
              style={{
                scrollSnapAlign: "start",
                width:
                  managers.length === 1
                    ? "100%"
                    : managers.length === 2
                      ? "calc(50% - 0.5rem)"
                      : "min(540px, 88vw)",
                minWidth: managers.length === 1 ? undefined : "min(480px, 88vw)",
              }}
            >
              <ManagerInitiatorCard
                scorecard={m}
                avatarUrl={resolveAvatar(m.managerId)}
                resolveAvatar={resolveAvatar}
                onOpenDrilldown={setOpenManagerId}
              />
            </div>
          ))}
        </div>
      )}

      <ManagerDrilldown
        managerId={openManagerId}
        windowDays={windowDays}
        onClose={() => setOpenManagerId(null)}
      />

      <style>{`
        .task-report-rail { scrollbar-width: thin; }
        .task-report-rail::-webkit-scrollbar { height: 8px; }
        .task-report-rail::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--color-altus-red) 22%, transparent);
          border-radius: 999px;
        }
        .task-report-rail::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </GlassCard>
  );
}

function WindowToggle({ value, onChange }: { value: WindowKey; onChange: (k: WindowKey) => void }) {
  const options: { id: WindowKey; label: string }[] = [
    { id: "d3", label: "3-day" },
    { id: "d7", label: "7-day" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Initiator window"
      className="inline-flex shrink-0 items-center gap-1 rounded-chip border p-1"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "color-mix(in srgb, var(--color-surface-card) 88%, transparent)",
      }}
    >
      {options.map((o) => {
        const isActive = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.id)}
            className="rounded-pill px-5 py-2 font-bold transition-all duration-200"
            style={{
              fontSize: 13.5,
              background: isActive
                ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                : "transparent",
              color: isActive ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: isActive ? "0 6px 16px -6px rgba(168,4,0,0.55)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RailArrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === -1 ? "Scroll managers left" : "Scroll managers right"}
      className="grid size-8 place-items-center rounded-full border transition-transform active:scale-95"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "var(--color-surface-card)",
        color: "var(--color-ink-soft)",
      }}
    >
      {dir === -1 ? (
        <ChevronLeft size={16} strokeWidth={2.6} />
      ) : (
        <ChevronRight size={16} strokeWidth={2.6} />
      )}
    </button>
  );
}

/* ──────────────────────────── Shared empty state ───────────────────────── */

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
