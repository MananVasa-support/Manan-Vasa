import { TaskTable } from "./task-table";
import type { TaskListRow } from "@/lib/types";
import {
  PENDING_STATUSES as CANONICAL_PENDING_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";

const DONE_STATUSES = new Set<TaskStatus>(["done", "approved"]);
// Sourced from the canonical export so Tier-3 statuses count correctly.
const PENDING_STATUSES = new Set<TaskStatus>(CANONICAL_PENDING_STATUSES);

interface KpiSpec {
  key: "total" | "done" | "pending" | "critical";
  label: string;
  sublabel: string;
  tone: "blue" | "green" | "amber" | "red";
}

const KPI_SPECS: KpiSpec[] = [
  { key: "total",    label: "TOTAL",    sublabel: "All matching tasks", tone: "blue"  },
  { key: "done",     label: "DONE",     sublabel: "Done + Approved",    tone: "green" },
  { key: "pending",  label: "PENDING",  sublabel: "Open work",          tone: "amber" },
  { key: "critical", label: "CRITICAL", sublabel: "Important & Urgent", tone: "red"   },
];

export function TaskListPage({
  title,
  rows,
  employees,
  me,
  statusLabels,
  statusTones,
}: {
  title: string;
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
}) {
  const counts = {
    total: rows.length,
    done: rows.filter((r) => DONE_STATUSES.has(r.status)).length,
    pending: rows.filter((r) => PENDING_STATUSES.has(r.status)).length,
    critical: rows.filter((r) => r.priority === "imp_urgent").length,
  };

  return (
    <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
      <header className="mb-7">
        <h1
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(40px, 4.2vw, 56px)",
            letterSpacing: "-0.025em",
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
        <p
          className="mt-2 text-ink-muted tabular-nums font-semibold"
          style={{ fontSize: 18 }}
        >
          {rows.length} {rows.length === 1 ? "task" : "tasks"} match your
          current filter
        </p>
      </header>

      {/* KPI summary — 4 stat cards in the same visual language as the
          main dashboard tiles. Each card has a top channel-color bar,
          font-black label, big count, sublabel. */}
      <div className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {KPI_SPECS.map((spec) => (
          <StatCard
            key={spec.key}
            spec={spec}
            value={counts[spec.key]}
          />
        ))}
      </div>

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
        />
      )}
    </main>
  );
}

function StatCard({ spec, value }: { spec: KpiSpec; value: number }) {
  return (
    <div
      className="relative bg-surface-card rounded-section overflow-hidden"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "24px 24px 22px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 5,
          background: `linear-gradient(90deg, var(--color-${spec.tone}), var(--color-${spec.tone}-deep))`,
        }}
      />
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 15,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        {spec.label}
      </span>
      <span
        className="block mt-2 leading-[0.85] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(48px, 4.6vw, 72px)",
        }}
      >
        {value}
      </span>
      <span
        className="block mt-2 font-bold leading-tight"
        style={{ fontSize: 15, color: "var(--color-ink-soft)" }}
      >
        {spec.sublabel}
      </span>
    </div>
  );
}
