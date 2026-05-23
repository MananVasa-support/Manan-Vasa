"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Route } from "next";
import type { InboxNotificationRow as NotificationRowData } from "@/lib/queries/notifications";
import { markNotificationRead } from "./actions";

interface Props {
  row: NotificationRowData;
}

/**
 * One inbox row.  Unread = full opacity + blue dot + bold title.
 * Read   = 60% opacity + no dot.
 *
 * Click anywhere on the card → fire the markRead Server Action and
 * push to the underlying task in the same gesture.  We use a
 * <button> (not <Link>) so the click handler reliably owns the
 * navigation; the inner task link is intentionally NOT rendered as
 * a nested anchor (which would be invalid HTML).
 */
export function NotificationRow({ row }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = row.readAt === null;
  const href = (row.taskId ? `/tasks/${row.taskId}` : "/inbox") as Route;
  const when = formatDistanceToNow(row.createdAt, { addSuffix: true });
  const who = row.actorName ?? "Someone";

  function onActivate() {
    startTransition(async () => {
      if (unread) {
        // Fire-and-forget — server revalidates; we don't need to wait.
        await markNotificationRead(row.id);
      }
      router.push(href);
    });
  }

  return (
    <li
      className="relative border-b border-hairline last:border-b-0"
      style={{ opacity: unread ? 1 : 0.6 }}
    >
      <button
        type="button"
        onClick={onActivate}
        disabled={isPending}
        className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-[rgba(15,23,42,0.03)] disabled:opacity-70"
      >
        <span
          aria-hidden
          className="mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: unread ? "var(--color-blue)" : "transparent",
          }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-body text-ink-strong"
            style={{ fontWeight: unread ? 600 : 400 }}
          >
            {row.title}
          </p>
          {row.body && (
            <p className="mt-1 text-body text-ink-subtle line-clamp-2">
              {row.body}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-subtle tabular-nums">
            <span>{when}</span>
            <span aria-hidden>·</span>
            <span>{who}</span>
          </div>
        </div>
      </button>
    </li>
  );
}
