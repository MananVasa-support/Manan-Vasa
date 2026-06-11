import Link from "next/link";
import type { Route } from "next";
import {
  AlarmClockOff,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  LayoutDashboard,
} from "lucide-react";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import type { MyTodayTask } from "@/lib/queries/my-day";

const TZ = "Asia/Kolkata";

/**
 * Mobile-only "Today" home — the opening screen on phones. Shows the
 * signed-in user's overdue + due-today tasks, priority-first (Critical →
 * Normal). Server component: pure render, links into /tasks/[id].
 *
 * Readability rules (non-negotiable): body ≥ 15px, titles 17px, touch
 * targets ≥ 48px, no emoji icons, brand tokens only.
 */
export function MobileToday({
  firstName,
  tasks,
  doneToday,
  statusLabels,
  statusTones,
}: {
  firstName: string;
  tasks: MyTodayTask[];
  doneToday: number;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const now = new Date();
  const hourIst = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(now),
  );
  const greeting =
    hourIst < 12 ? "Good morning" : hourIst < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const overdue = tasks.filter((t) => t.overdue);
  const dueToday = tasks.filter((t) => !t.overdue);

  const summary = [
    `${dueToday.length} due today`,
    overdue.length > 0 ? `${overdue.length} overdue` : null,
    doneToday > 0 ? `${doneToday} done` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="px-4 pt-5 pb-8" aria-label="Your tasks for today">
      {/* Greeting */}
      <p
        className="text-ink-subtle uppercase"
        style={{
          fontFamily: "var(--font-mono-display)",
          fontSize: 12,
          letterSpacing: "0.12em",
        }}
      >
        {dateLabel}
      </p>
      <h1
        className="text-ink-strong mt-1"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
        }}
      >
        {greeting}, {firstName}
      </h1>
      <p className="text-ink-soft mt-1.5" style={{ fontSize: 15.5 }}>
        {summary}
      </p>

      {tasks.length === 0 ? (
        <div
          className="mt-6 rounded-section border border-hairline bg-surface-card px-6 py-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <CheckCircle2
            size={36}
            strokeWidth={1.8}
            className="mx-auto"
            style={{ color: "var(--color-green-deep)" }}
            aria-hidden
          />
          <p className="text-ink-strong mt-3 font-semibold" style={{ fontSize: 17 }}>
            You&rsquo;re all clear for today
          </p>
          <p className="text-ink-soft mt-1" style={{ fontSize: 15 }}>
            Nothing due or overdue right now.
          </p>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <TaskGroup
              icon={<AlarmClockOff size={15} strokeWidth={2.2} aria-hidden />}
              label="Overdue"
              count={overdue.length}
              tone="red"
            >
              {overdue.map((t) => (
                <TodayCard key={t.id} task={t} statusLabels={statusLabels} statusTones={statusTones} />
              ))}
            </TaskGroup>
          )}
          {dueToday.length > 0 && (
            <TaskGroup
              icon={<CalendarCheck2 size={15} strokeWidth={2.2} aria-hidden />}
              label="Due today"
              count={dueToday.length}
              tone="blue"
            >
              {dueToday.map((t) => (
                <TodayCard key={t.id} task={t} statusLabels={statusLabels} statusTones={statusTones} />
              ))}
            </TaskGroup>
          )}
        </>
      )}

      {/* Footer actions — 48px targets */}
      <div className="mt-7 grid gap-2.5">
        <Link
          href={"/attendance" as Route}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-altus-red font-semibold text-white transition-colors hover:bg-altus-red-deep"
          style={{ fontSize: 15.5 }}
        >
          <Fingerprint size={18} strokeWidth={2.2} aria-hidden />
          Attendance
        </Link>
        <Link
          href={"/?full=1" as Route}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-pill border border-hairline-strong bg-surface-card font-semibold text-ink-strong transition-colors hover:bg-surface-soft"
          style={{ fontSize: 15.5 }}
        >
          <LayoutDashboard size={18} strokeWidth={2.2} aria-hidden />
          Company dashboard
        </Link>
      </div>
    </section>
  );
}

function TaskGroup({
  icon,
  label,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "red" | "blue";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-1.5 px-0.5">
        <span style={{ color: `var(--color-${tone}-deep)` }}>{icon}</span>
        <h2
          className="font-bold uppercase"
          style={{
            fontSize: 12.5,
            letterSpacing: "0.08em",
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {label}
        </h2>
        <span className="text-ink-subtle font-semibold tabular-nums" style={{ fontSize: 12.5 }}>
          {count}
        </span>
      </div>
      <ul className="mt-2.5 grid gap-2.5">{children}</ul>
    </div>
  );
}

function TodayCard({
  task,
  statusLabels,
  statusTones,
}: {
  task: MyTodayTask;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const title =
    task.title?.trim() || task.description?.trim() || task.subject?.trim() || "Untitled task";
  const meta = [task.client?.trim(), task.subject?.trim()].filter(Boolean).join(" · ");
  const tone = statusTones[task.status] ?? "slate";
  const dueLabel = task.overdue
    ? task.dueAt
      ? `Due ${new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" }).format(task.dueAt)}`
      : "Overdue"
    : "Due today";

  return (
    <li>
      <Link
        href={`/tasks/${task.id}` as Route}
        className="block rounded-section border bg-surface-card p-4 transition-colors active:bg-surface-soft"
        style={{
          borderColor: task.overdue
            ? "color-mix(in srgb, var(--color-red) 35%, transparent)"
            : "var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className="text-ink-strong min-w-0 flex-1 font-semibold"
            style={{
              fontSize: 17,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {task.taskNo != null && (
              <span className="text-ink-subtle font-bold tabular-nums" style={{ fontSize: 14 }}>
                #{task.taskNo}{" "}
              </span>
            )}
            {title}
          </p>
          <ChevronRight size={18} strokeWidth={2.2} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden />
        </div>

        {meta && (
          <p className="text-ink-muted mt-1 truncate" style={{ fontSize: 14.5 }}>
            {meta}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {task.priority === "imp_urgent" ? (
            <CriticalBadge />
          ) : (
            <span className="text-ink-soft font-semibold" style={{ fontSize: 13 }}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}
          <span
            className="inline-flex items-center rounded-pill px-2.5 py-1 font-semibold"
            style={{
              fontSize: 12.5,
              background: `var(--color-${tone}-bg)`,
              color: `var(--color-${tone}-deep)`,
            }}
          >
            {statusLabels[task.status] ?? task.status}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{
              fontSize: 13,
              color: task.overdue ? "var(--color-red-deep)" : "var(--color-ink-soft)",
            }}
          >
            {dueLabel}
          </span>
        </div>
      </Link>
    </li>
  );
}
