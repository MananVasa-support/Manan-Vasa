import Link from "next/link";
import type { Route } from "next";
import {
  LayoutGrid,
  CheckCircle2,
  Loader,
  Flame,
  AlarmClock,
  XCircle,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
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
    <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-4 max-md:pt-3 pb-16">
      <header className="mb-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 2.5vw, 34px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {title}
          </h1>
        </div>
        {me.isAdmin && (
          <Link
            href={"/tasks/kanban" as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 18px -6px rgba(225, 6, 0, 0.55)",
            }}
          >
            <LayoutGrid size={16} strokeWidth={2.4} />
            Kanban View
          </Link>
        )}
      </header>

      {/* KPI summary — 4 stat cards in the same visual language as the
          main dashboard tiles. Each card has a top channel-color bar,
          font-black label, big count, sublabel. */}
      <div className="mb-3 grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {KPI_SPECS.map((spec) => {
          // notRead is a derived "unread" metric with no URL filter dimension →
          // display-only. The rest toggle on/off and can be combined.
          if (!CARD_FILTER[spec.key]) {
            return (
              <div key={spec.key} className="block rounded-section">
                <StatCard spec={spec} value={counts[spec.key]} active={false} />
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
              className="block rounded-section focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
            >
              <StatCard spec={spec} value={counts[spec.key]} active={on} />
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
          className="bg-surface-card rounded-section border border-hairline p-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-bold"
            style={{ fontSize: 20, color: "var(--color-ink-strong)" }}
          >
            No tasks match the current filter.
          </p>
          <p
            className="mt-2 font-semibold"
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

const KPI_ICONS: Record<KpiKey, LucideIcon> = {
  notApproved: XCircle,
  done: CheckCircle2,
  pending: Loader,
  critical: Flame,
  urgent: AlarmClock,
  notRead: EyeOff,
};

function StatCard({
  spec,
  value,
  active,
}: {
  spec: KpiSpec;
  value: number;
  active: boolean;
}) {
  const Icon = KPI_ICONS[spec.key];
  return (
    <div
      className="group relative bg-surface-card rounded-section overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
      style={{
        border: active
          ? `1.5px solid var(--color-${spec.tone}-deep)`
          : "1px solid var(--color-hairline)",
        boxShadow: active
          ? `0 0 0 3px color-mix(in srgb, var(--color-${spec.tone}) 16%, transparent)`
          : "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "10px 14px 10px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 4,
          background: `linear-gradient(90deg, var(--color-${spec.tone}), var(--color-${spec.tone}-deep))`,
        }}
      />
      {/* Tinted icon chip — adds colour + visual anchor without hurting
          the white card's readability. */}
      <span
        aria-hidden
        className="absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
        style={{
          background: `color-mix(in srgb, var(--color-${spec.tone}) 14%, transparent)`,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        <Icon size={15} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 11.5,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        {spec.label}
      </span>
      <span
        className="block mt-1 leading-[0.85] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(25px, 1.9vw, 33px)",
        }}
      >
        {value}
      </span>
      <span
        className="block mt-1 font-bold leading-tight"
        style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}
      >
        {spec.sublabel}
      </span>
    </div>
  );
}
