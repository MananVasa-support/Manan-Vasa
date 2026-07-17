import Link from "next/link";
import type { Route } from "next";
import { LayoutGrid } from "lucide-react";
import { TaskTable } from "./task-table";
import { WeeklyGoalTaskGroup } from "@/components/weekly-goals/weekly-goal-task-group";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";
import type { TaskListRow, TaskListFilters } from "@/lib/types";
import { taskFiltersToSearchString } from "@/lib/task-filters";
import {
  PENDING_STATUSES as CANONICAL_PENDING_STATUSES,
  type TaskStatus,
  type TaskPriority,
  type StatusColorToken,
} from "@/db/enums";

const DONE_STATUSES = new Set<TaskStatus>(["done", "approved"]);
// Sourced from the canonical export so Tier-3 statuses count correctly.
const PENDING_STATUSES = new Set<TaskStatus>(CANONICAL_PENDING_STATUSES);

export type KpiKey =
  | "notApproved"
  | "done"
  | "pending"
  | "critical"
  | "urgent"
  | "notRead";

interface KpiSpec {
  key: KpiKey;
  label: string;
  sublabel: string;
  tone: "green" | "amber" | "red" | "orange" | "rose" | "slate";
}

// Six summary cards. The four middle ones (done/pending/critical/urgent) link
// to the Tasks list with the matching status/priority filter applied; the two
// new ones (notApproved/notRead) are display-only — they don't map to the
// existing status/priority filter dimensions.
const KPI_SPECS: KpiSpec[] = [
  { key: "notApproved", label: "NOT APPROVED", sublabel: "Declined / not approved", tone: "rose"   },
  { key: "done",        label: "DONE",         sublabel: "Done + Approved",               tone: "green"  },
  { key: "pending",     label: "PENDING",      sublabel: "Open work",                     tone: "amber"  },
  { key: "critical",    label: "CRITICAL",     sublabel: "Important & urgent",            tone: "red"    },
  { key: "urgent",      label: "URGENT",       sublabel: "Urgent priority",               tone: "orange" },
  { key: "notRead",     label: "NOT READ",     sublabel: "Unopened pending tasks",        tone: "slate"  },
];

/** Pure, testable count logic for the six summary cards. Operates on the
 *  already-filtered rows so every count respects the page filters. */
export function computeStatCounts(rows: TaskListRow[]): Record<KpiKey, number> {
  return {
    // ONLY tasks whose status is "Not Approved" — not "done awaiting sign-off"
    // or anything else (per Sir: this card must mean exactly Not-Approved).
    notApproved: rows.filter(
      (r) => r.status === "not_approved" || r.approvalStatus === "not_approved",
    ).length,
    done: rows.filter((r) => DONE_STATUSES.has(r.status)).length,
    pending: rows.filter((r) => PENDING_STATUSES.has(r.status)).length,
    critical: rows.filter((r) => r.priority === "imp_urgent").length,
    urgent: rows.filter((r) => r.priority === "not_imp_urgent").length,
    notRead: rows.filter(
      (r) => PENDING_STATUSES.has(r.status) && r.firstReadAt == null,
    ).length,
  };
}

export function TaskListPage({
  title,
  rows,
  filters,
  employees,
  me,
  statusLabels,
  statusTones,
  subjects,
  clients,
  weeklyGoals = [],
  basePath = "/tasks",
}: {
  title: string;
  rows: TaskListRow[];
  filters: TaskListFilters;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
  /** Bulk-set option rosters, threaded down to the bulk-action bar. */
  subjects?: string[];
  clients?: string[];
  /** This week's goals for the view's scope, surfaced as a pinned group above
   *  the task table (design §10). Display-only; NOT counted in the stat cards. */
  weeklyGoals?: VirtualTaskRow[];
  /** List route the summary cards link into (so Archived keeps its own scope). */
  basePath?: string;
}) {
  // Weekly goals are surfaced as a pinned group above the table but are
  // deliberately EXCLUDED from the task stat-card counts (design §10) — the
  // KPIs stay tasks-only. So `counts` is computed from `rows` alone.
  const counts = computeStatCounts(rows);

  // Each filterable stat card maps to a set of statuses and/or priorities.
  // Clicking a card TOGGLES its set into/out of the current filter (click on /
  // click off — no reload needed), and the sets ACCUMULATE so several cards can
  // be active together (e.g. Pending + Done, or Critical narrowing the rest).
  // Date / employee / department scope always carries over. `notRead` is a
  // derived "unread" metric with no URL filter dimension, so it stays
  // display-only.
  const CARD_FILTER: Partial<Record<KpiKey, { statuses?: TaskStatus[]; priorities?: TaskPriority[] }>> = {
    notApproved: { statuses: ["not_approved"] },
    done: { statuses: ["done", "approved"] },
    pending: { statuses: [...CANONICAL_PENDING_STATUSES] },
    critical: { priorities: ["imp_urgent"] },
    urgent: { priorities: ["not_imp_urgent"] },
  };

  // Active when ALL of the card's statuses + priorities are currently selected.
  function cardActive(key: KpiKey): boolean {
    const cf = CARD_FILTER[key];
    if (!cf) return false;
    const s = new Set(filters.statuses);
    const p = new Set(filters.priorities);
    const sts = cf.statuses ?? [];
    const prs = cf.priorities ?? [];
    if (sts.length + prs.length === 0) return false;
    return sts.every((x) => s.has(x)) && prs.every((x) => p.has(x));
  }

  // Toggle the card's set in/out of the current filter; preserve everything else.
  function cardHref(key: KpiKey): Route {
    const cf = CARD_FILTER[key];
    if (!cf) return basePath as Route;
    const remove = cardActive(key);
    const s = new Set(filters.statuses);
    const p = new Set(filters.priorities);
    for (const x of cf.statuses ?? []) remove ? s.delete(x) : s.add(x);
    for (const x of cf.priorities ?? []) remove ? p.delete(x) : p.add(x);
    const next: TaskListFilters = { ...filters, statuses: [...s], priorities: [...p] };
    const qs = taskFiltersToSearchString(next);
    return (qs ? `${basePath}?${qs}` : basePath) as Route;
  }

  return (
    <main className="relative mx-auto max-w-[1600px] px-12 max-md:px-4 pt-5 max-md:pt-3 pb-16">
      <header className="wg-rise relative mb-3.5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p
            className="mb-1 uppercase font-bold"
            style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--color-ink-subtle)" }}
          >
            WMS · Task Management
          </p>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 2.4vw, 34px)",
              letterSpacing: "-0.028em",
              lineHeight: 1,
            }}
          >
            {title}
          </h1>
          <p
            className="mt-1.5 font-medium tabular-nums"
            style={{ fontSize: 13, color: "var(--color-ink-subtle)" }}
          >
            {rows.length === 1 ? "1 task" : `${rows.length} tasks`} in the current view
          </p>
        </div>
        {me.isAdmin && (
          <Link
            href={"/tasks/kanban" as Route}
            className="brand-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-bold transition-colors hover:bg-surface-soft"
            style={{
              color: "var(--color-altus-red-deep)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
            }}
          >
            <LayoutGrid size={15} strokeWidth={2.4} />
            Kanban View
          </Link>
        )}
      </header>

      {/* KPI summary — a LIGHT inline strip of stat chips (flat, mostly white,
          tiny tone dot). Clickable ones toggle the matching status/priority
          filter; `notRead` is display-only. */}
      <div className="relative mb-3.5 flex flex-wrap gap-2">
        {KPI_SPECS.map((spec, i) => {
          if (!CARD_FILTER[spec.key]) {
            return (
              <div key={spec.key} className="wg-rise" style={{ animationDelay: `${i * 30}ms` }}>
                <StatChip spec={spec} value={counts[spec.key]} active={false} />
              </div>
            );
          }
          const on = cardActive(spec.key);
          return (
            <Link
              key={spec.key}
              href={cardHref(spec.key)}
              aria-pressed={on}
              aria-label={`${on ? "Remove" : "Add"} ${spec.label.toLowerCase()} filter`}
              className="wg-rise block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <StatChip spec={spec} value={counts[spec.key]} active={on} />
            </Link>
          );
        })}
      </div>

      {/* Pinned "This week's goals" group above the table (design §10). Admins
          viewing the unscoped "all" list see each goal's doer name. Excluded
          from the stat-card counts above. */}
      <WeeklyGoalTaskGroup
        goals={weeklyGoals}
        showDoer={me.isAdmin && filters.assigneeMode === "all"}
        className="mb-3"
      />

      {rows.length === 0 ? (
        <div
          className="wg-rise relative overflow-hidden bg-surface-card rounded-section border border-hairline p-14 max-md:p-10 text-center"
          style={{
            boxShadow:
              "0 1px 2px rgba(15, 23, 42, 0.04), 0 14px 32px -20px rgba(15, 23, 42, 0.14)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{
              background:
                "radial-gradient(420px 110px at 50% 0%, color-mix(in srgb, var(--color-altus-red) 5%, transparent), transparent 72%)",
            }}
          />
          <span
            aria-hidden
            className="relative mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-2xl"
            style={{
              background:
                "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
              color: "var(--color-altus-red)",
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 18%, transparent)",
            }}
          >
            <LayoutGrid size={24} strokeWidth={2.2} />
          </span>
          <p
            className="relative font-black"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 21,
              letterSpacing: "-0.015em",
              color: "var(--color-ink-strong)",
            }}
          >
            No tasks match the current filter.
          </p>
          <p
            className="relative mt-2 font-semibold"
            style={{ fontSize: 15, color: "var(--color-ink-muted)" }}
          >
            Try widening your date range or clearing assignee filters.
          </p>
        </div>
      ) : (
        <TaskTable
          rows={rows}
          employees={employees}
          me={me}
          statusLabels={statusLabels}
          statusTones={statusTones}
          subjects={subjects}
          clients={clients}
        />
      )}
    </main>
  );
}

/** A light, flat stat chip: [tone dot] BIG-number Label. No shadows, no washes,
 *  no icon tiles — restraint is what reads "light". Active = subtly tinted. */
function StatChip({
  spec,
  value,
  active,
}: {
  spec: KpiSpec;
  value: number;
  active: boolean;
}) {
  return (
    <div
      title={spec.sublabel}
      className="group inline-flex items-center gap-2.5 rounded-xl transition-colors"
      style={{
        padding: "8px 13px",
        background: active
          ? `color-mix(in srgb, var(--color-${spec.tone}) 8%, var(--color-surface-card))`
          : "var(--color-surface-card)",
        boxShadow: active
          ? `inset 0 0 0 1.5px var(--color-${spec.tone}-deep)`
          : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full shrink-0"
        style={{ background: `var(--color-${spec.tone})` }}
      />
      <span
        className="tabular-nums leading-none text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 20,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span
        className="font-semibold leading-none"
        style={{ fontSize: 12.5, color: active ? `var(--color-${spec.tone}-deep)` : "var(--color-ink-soft)" }}
      >
        {spec.label.charAt(0) + spec.label.slice(1).toLowerCase()}
      </span>
    </div>
  );
}
