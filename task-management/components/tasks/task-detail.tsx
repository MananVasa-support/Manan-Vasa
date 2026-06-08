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
  // The TITLE is always the headline — that's what the user actually
  // typed when creating the task.  Subject (e.g. "Marketing") is a short
  // category and now lives in the meta strip, not as the hero text.
  const headline = task.title.trim();
  const subjectChip = task.subject?.trim() || null;
  const overdue =
    task.dueAt.getTime() < Date.now() &&
    !["approved", "cancelled", "transferred"].includes(task.status);

  return (
    <article className="relative">
      {/* Eyebrow row — overdue/due pill + created-ago text + subject chip.
          Matches the design comp where small meta sits ABOVE the title. */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <DuePill dueAt={task.dueAt} overdue={overdue} />
        <span className="text-[14px] text-ink-subtle">
          Created {formatDistanceToNow(task.createdAt, { addSuffix: true })}
        </span>
        {subjectChip && (
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[12.5px] font-bold uppercase tracking-[0.08em] border"
            style={{
              background: "var(--color-surface-soft)",
              color: "var(--color-ink-muted)",
              borderColor: "var(--color-hairline-strong)",
            }}
          >
            {subjectChip}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-bold tracking-[0.08em] uppercase"
          style={{
            background: `rgba(${eyebrow.rgb}, 0.10)`,
            color: eyebrow.toneVar,
            border: `1px solid rgba(${eyebrow.rgb}, 0.25)`,
          }}
        >
          <Sparkles size={12} strokeWidth={2.6} />
          {eyebrow.label}
        </span>
      </div>

      {/* HEADLINE — the user's actual task title. Serif italic, sized
          to read comfortably without dominating the page. Clamp keeps
          it legible at all column widths. */}
      <h1
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: "clamp(32px, 3.4vw, 44px)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        {headline}
      </h1>

      {/* Attribution strip — created-by / initiator → doer avatars */}
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
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

      {/* Description body — 17px, comfortable prose line-height. */}
      {task.description && (
        <div className="mt-8" style={{ maxWidth: "68ch" }}>
          <p
            className="text-ink whitespace-pre-wrap"
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              fontWeight: 400,
            }}
          >
            {task.description}
          </p>
        </div>
      )}

      {/* Internal notes — boxed sub-card, distinct from the body. The
          design comp shows it as its own clear region with a labeled
          header inside the main task card. */}
      {task.notes && (
        <div
          className="mt-9 rounded-chip px-6 py-5"
          style={{
            background: "var(--color-surface-soft)",
            border: "1px solid var(--color-hairline)",
            maxWidth: "68ch",
          }}
        >
          <h2
            className="text-ink-subtle font-bold mb-3"
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Internal Notes
          </h2>
          <p
            className="text-ink whitespace-pre-wrap"
            style={{ fontSize: 17, lineHeight: 1.6 }}
          >
            {task.notes}
          </p>
        </div>
      )}
    </article>
  );
}

function DuePill({ dueAt, overdue }: { dueAt: Date; overdue: boolean }) {
  const rgb = overdue ? "225, 6, 0" : "100, 116, 139";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] tabular-nums"
      style={{
        background: `rgba(${rgb}, 0.08)`,
        color: overdue ? "var(--color-red-deep)" : "var(--color-ink-soft)",
        border: `1px solid rgba(${rgb}, ${overdue ? 0.30 : 0.16})`,
        fontWeight: 700,
      }}
      title={format(dueAt, "EEE, MMM d, yyyy")}
    >
      <Calendar size={14} strokeWidth={2.4} />
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
    <span className="inline-flex items-center gap-2.5 text-ink-soft">
      <Avatar name={name} size={28} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {label}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {name}
          {relative && (
            <span className="ml-1.5 text-ink-subtle font-normal text-[13.5px]">
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
    <span className="inline-flex items-center gap-2.5">
      <Avatar name={fromName ?? "?"} size={28} title={`${fromLabel}: ${fromName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {fromLabel}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {fromName ?? "—"}
        </span>
      </span>
      <ArrowRight
        size={16}
        strokeWidth={2.4}
        className="text-ink-subtle mx-1.5"
      />
      <Avatar name={toName ?? "?"} size={28} title={`${toLabel}: ${toName ?? "—"}`} />
      <span className="leading-tight">
        <span className="block text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold">
          {toLabel}
        </span>
        <span className="block text-ink-strong font-semibold mt-0.5" style={{ fontSize: 15.5 }}>
          {toName ?? "—"}
        </span>
      </span>
    </span>
  );
}
