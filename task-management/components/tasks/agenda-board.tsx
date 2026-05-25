"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle } from "lucide-react";

export interface AgendaTask {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  dueYmd: string; // IST calendar day, yyyy-mm-dd
}

interface DayCol {
  ymd: string;
  label: string;
  sub: string;
}

interface Props {
  firstName: string;
  dueToday: number;
  overdue: number;
  /** Up to 6 upcoming day columns, today first (IST). */
  days: DayCol[];
  overdueTasks: AgendaTask[];
  tasks: AgendaTask[];
}

const DAY_CHOICES = [3, 4, 5, 6] as const;

/**
 * "My Day" agenda (Manan #21). Welcome line with due-today / overdue counts,
 * plus a date-wise board with a selectable 3/4/5/6-day window. Read view —
 * each card opens the focused task.
 */
export function AgendaBoard({
  firstName,
  dueToday,
  overdue,
  days,
  overdueTasks,
  tasks,
}: Props) {
  const [dayCount, setDayCount] = React.useState<number>(5);
  const shownDays = days.slice(0, dayCount);
  const lastYmd = shownDays.length ? shownDays[shownDays.length - 1]!.ymd : "";

  const byDay = React.useMemo(() => {
    const m = new Map<string, AgendaTask[]>();
    for (const t of tasks) {
      const arr = m.get(t.dueYmd) ?? [];
      arr.push(t);
      m.set(t.dueYmd, arr);
    }
    return m;
  }, [tasks]);

  const laterTasks = React.useMemo(
    () => tasks.filter((t) => lastYmd && t.dueYmd > lastYmd),
    [tasks, lastYmd],
  );

  return (
    <div>
      {/* Welcome banner */}
      <div className="mb-6">
        <h1 className="text-display-lg text-ink-strong">
          Welcome, {firstName}
        </h1>
        <p className="text-body-lg text-ink-subtle mt-1">
          You have{" "}
          <span className="font-bold text-ink-strong tabular-nums">{dueToday}</span>{" "}
          {dueToday === 1 ? "task" : "tasks"} due today
          {overdue > 0 && (
            <>
              {" "}and{" "}
              <span className="font-bold tabular-nums" style={{ color: "var(--color-red-deep)" }}>
                {overdue}
              </span>{" "}
              overdue
            </>
          )}
          .
        </p>
      </div>

      {/* Day-count selector */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-subtle mr-1">Show</span>
        {DAY_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDayCount(n)}
            className="px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors"
            style={{
              background: dayCount === n ? "var(--color-ink-strong)" : "var(--color-surface-soft)",
              color: dayCount === n ? "#fff" : "var(--color-ink-soft)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            {n} days
          </button>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {/* Overdue column (only when there are any) */}
        {overdueTasks.length > 0 && (
          <Column
            label="Overdue"
            sub={`${overdueTasks.length} ${overdueTasks.length === 1 ? "task" : "tasks"}`}
            tone="red"
            tasks={overdueTasks}
          />
        )}
        {shownDays.map((d) => (
          <Column
            key={d.ymd}
            label={d.label}
            sub={d.sub}
            tone={d.label === "Today" ? "blue" : "slate"}
            tasks={byDay.get(d.ymd) ?? []}
          />
        ))}
        {laterTasks.length > 0 && (
          <Column label="Later" sub={`${laterTasks.length}`} tone="stone" tasks={laterTasks} />
        )}
      </div>
    </div>
  );
}

function Column({
  label,
  sub,
  tone,
  tasks,
}: {
  label: string;
  sub: string;
  tone: string;
  tasks: AgendaTask[];
}) {
  return (
    <div
      className="flex-shrink-0 w-[280px] rounded-section p-3"
      style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span
          className="inline-flex items-center gap-2 text-[13px] font-bold"
          style={{ color: `var(--color-${tone}-deep)` }}
        >
          {label === "Overdue" && <AlertTriangle size={14} strokeWidth={2.4} />}
          {label}
        </span>
        <span className="text-[12px] font-semibold text-ink-subtle tabular-nums">{sub}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[40px]">
        {tasks.length === 0 ? (
          <p className="text-[12.5px] text-ink-subtle px-1 py-3">Nothing here.</p>
        ) : (
          tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}/focus` as Route}
              className="rounded-chip bg-white border border-hairline p-3 transition-shadow hover:shadow-md block"
            >
              <span
                className="text-[14px] font-semibold text-ink-strong leading-snug block"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description || t.title}
              </span>
              {t.subject && (
                <span className="mt-1.5 text-[11px] font-semibold text-ink-subtle block">
                  {t.subject}
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
