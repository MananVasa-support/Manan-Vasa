"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  archiveTask,
  unarchiveTask,
  setTaskStatus,
  setTaskPriority,
  reassignDoer,
  deleteTask,
} from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from "@/db/enums";
import type { TaskListRow } from "@/lib/types";
import {
  canApprove,
  canReassign,
} from "@/lib/auth/task-permissions";

interface Props {
  row: TaskListRow;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
}

const STATUS_ACTIONS: { value: TaskStatus; label: string }[] = [
  { value: "done",         label: "Mark Done" },
  { value: "approved",     label: "Mark Approved" },
  { value: "not_approved", label: "Mark Not Approved" },
  { value: "cancelled",    label: "Mark Cancelled" },
];

export function TaskRowActions({ row, employees, me }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // Result shape every mutating action now returns. `void` is tolerated for
  // any legacy callsite. On failure we toast the reason and skip the success
  // toast — the user keeps their place instead of hitting an error screen.
  type ActionResult =
    | { ok: true }
    | { ok: false; error?: string; message?: string }
    | void;

  function friendlyError(res: { error?: string; message?: string }): string {
    if (res.message) return res.message;
    switch (res.error) {
      case "forbidden":
        return "You're not allowed to make that change.";
      case "stale":
        return "This task changed elsewhere — refreshing.";
      case "not-found":
        return "That task no longer exists.";
      default:
        return res.error ?? "Something went wrong — please try again.";
    }
  }

  function withTransition(label: string, fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await fn();
      } catch {
        fireToast({ message: "Something went wrong — please try again." });
        return;
      }
      if (res && res.ok === false) {
        fireToast({ message: friendlyError(res) });
        if (res.error === "stale") router.refresh();
        return;
      }
      router.refresh();
      fireToast({ message: label });
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({
        message: "Task archived.",
        actionLabel: "Undo",
        action: () => {
          void unarchiveTask(row.id);
        },
      });
    });
  }

  function handleUnarchive() {
    startTransition(async () => {
      const res = await unarchiveTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({
        message: "Task restored.",
        actionLabel: "Undo",
        action: () => {
          void archiveTask(row.id);
        },
      });
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Permanently delete "${row.title}"?\n\nThis removes the task and its history and cannot be undone. Use Archive or Cancel instead if you just want to hide it.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteTask(row.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
      fireToast({ message: "Task deleted." });
    });
  }

  // Row actions are a MANAGEMENT surface. Admins get the full power menu; a
  // task's initiator/reviewer keeps their permission-checked Approve/Reassign
  // links. A plain DOER (no admin, no rights over this task) gets NOTHING — the
  // ⋯ trigger is hidden entirely.
  const permInput = {
    employee: { id: me.id, isAdmin: me.isAdmin },
    task: {
      createdById: row.createdById,
      initiatorId: row.initiatorId,
      doerId: row.doerId,
      status: row.status,
    },
  };
  const showApproveLink = canApprove({ ...permInput, isDoersManager: false });
  const showReassignLink = canReassign(permInput);
  if (!me.isAdmin && !showApproveLink && !showReassignLink) return null;

  // Quick actions sit OUTSIDE the ⋯ menu as one-click icon buttons, so the two
  // things people reach for constantly (archive, delete) don't cost a menu
  // open. Same admin-only rule as before, and they're removed from the menu
  // below so each action has exactly one home.
  const quickBtn =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="inline-flex items-center gap-0.5">
      {me.isAdmin &&
        (row.archived ? (
          <button
            type="button"
            onClick={handleUnarchive}
            disabled={isPending}
            title={`Restore "${row.title}" from the archive`}
            aria-label={`Unarchive ${row.title}`}
            className={`${quickBtn} hover:bg-surface-soft hover:text-ink-strong`}
          >
            <ArchiveRestore size={15} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            title={`Archive "${row.title}"`}
            aria-label={`Archive ${row.title}`}
            className={`${quickBtn} hover:bg-surface-soft hover:text-ink-strong`}
          >
            <Archive size={15} strokeWidth={2.2} />
          </button>
        ))}

      {me.isAdmin && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          title={`Delete "${row.title}" permanently`}
          aria-label={`Delete ${row.title}`}
          className={`${quickBtn} hover:bg-altus-red/10 hover:text-altus-red`}
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${row.title}`}
          title="More actions"
          className="size-7 inline-flex items-center justify-center rounded-lg hover:bg-surface-soft text-ink-subtle hover:text-ink-strong transition-colors disabled:opacity-50"
          disabled={isPending}
        >
          <MoreHorizontal size={16} strokeWidth={2.2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* Archive + Delete deliberately absent — they're the quick-action
            buttons to the left of this trigger now. */}

        {/* Power actions — set any status (incl. approval verdicts), change
            priority, reassign to anyone. ADMIN-ONLY; never shown to doers. */}
        {me.isAdmin && (
          <>
            {STATUS_ACTIONS.map((s) => (
              <DropdownMenuItem
                key={s.value}
                disabled={row.status === s.value}
                onClick={() =>
                  withTransition(`Status set to ${s.label.replace("Mark ", "")}.`, () =>
                    setTaskStatus(row.id, s.value, row.updatedAt.toISOString()),
                  )
                }
              >
                {s.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Change Priority</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuLabel>Eisenhower Priority</DropdownMenuLabel>
                {TASK_PRIORITIES.map((p) => (
                  <DropdownMenuItem
                    key={p}
                    disabled={row.priority === p}
                    danger={p === "imp_urgent"}
                    onClick={() =>
                      withTransition(`Priority set to ${PRIORITY_LABELS[p]}.`, () =>
                        setTaskPriority(row.id, p as TaskPriority),
                      )
                    }
                  >
                    {PRIORITY_LABELS[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Reassign Doer</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>Employees</DropdownMenuLabel>
                {employees.map((e) => (
                  <DropdownMenuItem
                    key={e.id}
                    disabled={e.id === row.doerId}
                    onClick={() =>
                      withTransition(`Doer reassigned to ${e.name}.`, () =>
                        reassignDoer(row.id, e.id),
                      )
                    }
                  >
                    {e.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {/* Permission-checked links for a task's initiator/reviewer (non-admins
            who legitimately own this task). A plain doer has neither. */}
        {(showApproveLink || showReassignLink) && (
          <>
            <DropdownMenuSeparator />
            {showApproveLink && (
              <DropdownMenuItem asChild>
                <Link href={`/tasks/${row.id}#approve` as Route}>Approve / Decline…</Link>
              </DropdownMenuItem>
            )}
            {showReassignLink && (
              <DropdownMenuItem asChild>
                <Link href={`/tasks/${row.id}#reassign` as Route}>Reassign…</Link>
              </DropdownMenuItem>
            )}
          </>
        )}

      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
