import { format, formatDistanceToNow } from "date-fns";
import { Calendar, Sparkles, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { TaskDetail as TaskDetailModel } from "@/lib/queries/tasks";
import type { TaskPriority } from "@/db/enums";

const PRIORITY_PILL: Record<
  TaskPriority,
  { label: string; rgb: string; toneVar: string }
> = {
  imp_urgent: {
    label: "Urgent · Important",
    rgb: "225, 6, 0",
    toneVar: "var(--color-red-deep)",
  },
  imp_not_urgent: {
    label: "Important · Not urgent",
    rgb: "59, 130, 246",
    toneVar: "var(--color-blue-deep)",
  },
  not_imp_urgent: {
    label: "Not important · Urgent",
    rgb: "245, 158, 11",
    toneVar: "var(--color-amber-deep)",
  },
  not_imp_not_urgent: {
    label: "Not important · Not urgent",
    rgb: "100, 116, 139",
    toneVar: "var(--color-ink-soft)",
  },
};

/**
 * Read-mode hero treatment for a task.  Editorial-document feel:
 * eyebrow priority chip, oversized serif subject, meta avatars row,
 * then the description body and (when present) internal notes.
 */
export function TaskDetail({ task }: { task: TaskDetailModel }) {
  const eyebrow = PRIORITY_PILL[task.priority];
  // Subject promoted to display title when present.  Title is the fallback
  // headline.  This matches editorial practice — the subject is the
  // headline, the title is the slug.
  const headline = (task.subject?.trim() || task.title).trim();
  const slug = task.subject ? task.title : null;
  const overdue =
    task.dueAt.getTime() < Date.now() &&
    !["approved", "cancelled", "transferred"].includes(task.status);

  return (
    <article className="relative">
      {/* Eyebrow: priority quadrant pill */}
      <div className="flex items-center gap-2 mb-5">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold tracking-[0.08em] uppercase"
          style={{
            background: `rgba(${eyebrow.rgb}, 0.10)`,
            color: eyebrow.toneVar,
            border: `1px solid rgba(${eyebrow.rgb}, 0.25)`,
          }}
        >
          <Sparkles size={12} strokeWidth={2.6} />
          {eyebrow.label}
        </span>
        {slug && (
          <span className="text-[13px] text-ink-subtle font-mono tracking-tight truncate">
            {slug}
          </span>
        )}
      </div>

      {/* Headline subject — Instrument Serif italic, balanced wrap */}
      <h1
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: "clamp(40px, 5vw, 60px)",
          lineHeight: 1.04,
          letterSpacing: "-0.03em",
          textWrap: "balance",
        }}
      >
        {headline}
      </h1>

      {/* Meta strip — due / created-by / doer / initiator */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <DuePill dueAt={task.dueAt} overdue={overdue} />
        {task.creatorName && (
          <PersonChip
            label="Created by"
            name={task.creatorName}
            relative={task.createdAt}
          />
        )}
        <RolePair
          fromName={task.initiatorName}
          fromLabel="Initiator"
          toName={task.doerName}
          toLabel="Doer"
        />
      </div>

      {/* Description body — Inter 17px, generous line-height, capped width */}
      {task.description && (
        <div className="mt-8" style={{ maxWidth: "65ch" }}>
          <p
            className="text-ink whitespace-pre-wrap"
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              fontWeight: 400,
            }}
          >
            {task.description}
          </p>
        </div>
      )}

      {/* Internal notes — separated by a hairline, italic eyebrow */}
      {task.notes && (
        <div
          className="mt-8 pt-6 border-t border-hairline"
          style={{ maxWidth: "65ch" }}
        >
          <h2 className="text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold mb-2">
            Internal notes
          </h2>
          <p
            className="text-ink whitespace-pre-wrap"
            style={{ fontSize: 16, lineHeight: 1.6 }}
          >
            {task.notes}
          </p>
        </div>
      )}

      {/* When the subject IS the headline, surface the title slug at the
          bottom as a small footer reference so it isn't entirely hidden. */}
      {slug && (
        <div className="mt-8 pt-5 border-t border-hairline text-[13px] text-ink-subtle">
          Task title: <span className="text-ink-soft">{slug}</span>
        </div>
      )}
    </article>
  );
}

function DuePill({ dueAt, overdue }: { dueAt: Date; overdue: boolean }) {
  const rgb = overdue ? "225, 6, 0" : "100, 116, 139";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] tabular-nums"
      style={{
        background: `rgba(${rgb}, 0.06)`,
        color: overdue ? "var(--color-red-deep)" : "var(--color-ink-soft)",
        border: `1px solid rgba(${rgb}, ${overdue ? 0.28 : 0.12})`,
        fontWeight: 600,
      }}
      title={format(dueAt, "EEE, MMM d, yyyy")}
    >
      <Calendar size={13} strokeWidth={2.4} />
      {overdue ? "Overdue · " : "Due "}
      {format(dueAt, "MMM d")}
    </span>
  );
}

function PersonChip({
  label,
  name,
  relative,
}: {
  label: string;
  name: string;
  relative?: Date;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
      <Avatar name={name} size={26} />
      <span className="leading-tight">
        <span className="block text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold">
          {label}
        </span>
        <span className="block text-ink-strong font-medium" style={{ fontSize: 14.5 }}>
          {name}
          {relative && (
            <span className="ml-1 text-ink-subtle font-normal">
              · {formatDistanceToNow(relative, { addSuffix: true })}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

function RolePair({
  fromName,
  fromLabel,
  toName,
  toLabel,
}: {
  fromName: string | null;
  fromLabel: string;
  toName: string | null;
  toLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <Avatar name={fromName ?? "?"} size={26} title={`${fromLabel}: ${fromName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold">
          {fromLabel}
        </span>
        <span className="block text-ink-strong font-medium" style={{ fontSize: 14.5 }}>
          {fromName ?? "—"}
        </span>
      </span>
      <ArrowRight
        size={13}
        strokeWidth={2.4}
        className="text-ink-subtle mx-1"
      />
      <Avatar name={toName ?? "?"} size={26} title={`${toLabel}: ${toName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold">
          {toLabel}
        </span>
        <span className="block text-ink-strong font-medium" style={{ fontSize: 14.5 }}>
          {toName ?? "—"}
        </span>
      </span>
    </span>
  );
}
