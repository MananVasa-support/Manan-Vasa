import { formatDistanceToNow } from "date-fns";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { TaskEventType } from "@/lib/events";
import type { TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";

type StatusLabels = Record<TaskStatus, string>;

function statusLabel(
  s: string | undefined,
  labels: StatusLabels,
): string {
  if (!s) return "—";
  return labels[s as TaskStatus] ?? s;
}

function readField(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === "string" ? v : v == null ? undefined : String(v);
  }
  return undefined;
}

interface Props {
  row: AuditFeedRow;
  /** When true the row renders with a "Just now" badge in the meta line. */
  fresh?: boolean;
  /** Admin-overridable status labels. Falls back to STATUS_LABELS_FALLBACK. */
  statusLabels?: StatusLabels;
}

/**
 * A single audit-feed row, in body-only form.  The surrounding timeline
 * frame (vertical line + dot) lives in `AuditFeed` so it can layer extra
 * UI like the "fresh" ring pulse.
 */
export function AuditEvent({ row, fresh, statusLabels }: Props) {
  const when = formatDistanceToNow(row.createdAt, { addSuffix: true });
  const who = row.actorName ?? "Someone";
  const labels = statusLabels ?? STATUS_LABELS_FALLBACK;

  return (
    <div className="text-[14.5px] text-ink break-words" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
      <Body row={row} who={who} labels={labels} />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[12.5px] text-ink-subtle tabular-nums">{when}</span>
        {fresh && (
          <span
            className="text-[11px] uppercase tracking-[0.08em] font-bold px-2 py-0.5 rounded-full"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              color: "#ffffff",
              letterSpacing: "0.06em",
            }}
          >
            Just now
          </span>
        )}
      </div>
    </div>
  );
}

function Body({
  row,
  who,
  labels,
}: {
  row: AuditFeedRow;
  who: string;
  labels: StatusLabels;
}) {
  const e = row.eventType;
  switch (e) {
    case "created":
      return (
        <>
          <strong>{who}</strong> created the task
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );

    case "status_changed": {
      const from = statusLabel(readField(row.fromValue, "status"), labels);
      const to = statusLabel(readField(row.toValue, "status"), labels);
      return (
        <>
          <strong>{who}</strong> moved status:{" "}
          <span className="font-medium">{from}</span> →{" "}
          <span className="font-medium">{to}</span>
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );
    }

    case "field_updated": {
      const field = readField(row.toValue, "field");
      const fromVal = readField(row.fromValue, "value");
      const toVal = readField(row.toValue, "value");
      return (
        <>
          <strong>{who}</strong> updated <code className="text-[13px]">{field}</code>
          {fromVal !== undefined && toVal !== undefined ? (
            <span className="text-ink-subtle">
              {" "}({fromVal || "—"} → {toVal || "—"})
            </span>
          ) : null}
        </>
      );
    }

    case "reassigned": {
      const fromDoer = readField(row.fromValue, "doerId");
      const toDoer = readField(row.toValue, "doerId");
      const resetStatus = readField(row.toValue, "resetStatus");
      return (
        <>
          <strong>{who}</strong> reassigned the task
          {fromDoer && toDoer ? (
            <span className="text-ink-subtle"> (doer {fromDoer.slice(0, 6)} → {toDoer.slice(0, 6)})</span>
          ) : null}
          {resetStatus === "true" ? (
            <span className="text-ink-subtle"> · status reset</span>
          ) : null}
        </>
      );
    }

    case "transferred_external":
      return (
        <>
          <strong>{who}</strong> transferred the task externally
          {row.note ? <span className="text-ink-subtle"> — {row.note}</span> : null}
        </>
      );

    case "priority_changed": {
      const from = readField(row.fromValue, "priority");
      const to = readField(row.toValue, "priority");
      return (
        <>
          <strong>{who}</strong> changed priority
          {from && to ? <span className="text-ink-subtle"> ({from} → {to})</span> : null}
        </>
      );
    }

    case "due_changed":
      return (
        <>
          <strong>{who}</strong> changed the due date
        </>
      );

    case "archived":
      return (
        <>
          <strong>{who}</strong> archived the task
        </>
      );

    case "restored":
      return (
        <>
          <strong>{who}</strong> restored the task
        </>
      );

    case "commented": {
      const body = readField(row.toValue, "body") ?? "";
      return (
        <>
          <strong>{who}</strong> commented:
          <div
            className="mt-2 whitespace-pre-wrap text-ink-soft rounded-md p-3"
            style={{
              background: "rgba(15, 23, 42, 0.03)",
              borderLeft: "2px solid color-mix(in srgb, var(--color-green) 50%, transparent)",
              fontSize: 14.5,
              lineHeight: 1.55,
            }}
          >
            {body}
          </div>
        </>
      );
    }

    default: {
      // Exhaustiveness fallback for unknown event types.
      const _exhaustive: TaskEventType = e;
      return <span>{_exhaustive}</span>;
    }
  }
}

export function dotColorFor(e: TaskEventType): string {
  switch (e) {
    case "created":
      return "var(--color-blue)";
    case "status_changed":
      return "var(--color-amber)";
    case "field_updated":
      return "var(--color-ink-subtle)";
    case "reassigned":
      return "var(--color-purple)";
    case "transferred_external":
      return "var(--color-purple-deep)";
    case "priority_changed":
    case "due_changed":
      return "var(--color-amber)";
    case "archived":
    case "restored":
      return "var(--color-rose)";
    case "commented":
      return "var(--color-green)";
  }
}

/** Maps an event type to one of the audit-feed filter buckets. */
export function eventFilterBucket(
  e: TaskEventType,
): "comments" | "status" | "edits" {
  switch (e) {
    case "commented":
      return "comments";
    case "status_changed":
    case "reassigned":
    case "transferred_external":
    case "archived":
    case "restored":
      return "status";
    case "created":
    case "field_updated":
    case "priority_changed":
    case "due_changed":
      return "edits";
  }
}
