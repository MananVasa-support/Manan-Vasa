import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { getTaskById } from "@/lib/queries/tasks";
import { listTaskEvents } from "@/lib/queries/audit";
import { listEmployees } from "@/lib/queries/employees";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import {
  canEditTaskFields,
  canApprove,
  canReassign,
  canTransferExternal,
  canCancel,
  canComment,
} from "@/lib/auth/task-permissions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireUser();
  const task = await getTaskById(id);
  if (!task) notFound();

  const [events, all, statusDisplay] = await Promise.all([
    listTaskEvents(id),
    listEmployees(),
    getStatusDisplayMap(),
  ]);
  const employeeOptions = all.map((e) => ({ id: e.id, name: e.name }));
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const permInput = {
    employee: { id: me.id, isAdmin: me.isAdmin },
    task: {
      createdById: task.createdById,
      initiatorId: task.initiatorId,
      doerId: task.doerId,
      status: task.status,
    },
  };

  // Workflow-gated visibility for Approve/Decline. The matrix lets admins
  // jump from any status to "approved" via override, which surfaces those
  // cards on a "Not Started" task — misleading. Restrict the CTA to the
  // moment it's meaningful (doer has marked work done). Admins keep the
  // override at the server level if they ever need to force a verdict.
  const showApproveCard =
    canApprove(permInput) && task.status === "done";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-12 max-md:px-4 pt-10 pb-20">
        <TaskDetailView
          task={task}
          canEdit={canEditTaskFields(permInput)}
          canApproveTask={showApproveCard}
          canReassignTask={canReassign(permInput)}
          canTransferTaskExternal={canTransferExternal(permInput)}
          canCancelTask={canCancel(permInput)}
          canCommentOnTask={canComment(permInput)}
          events={events}
          employees={employeeOptions}
          me={{
            id: me.id,
            name: me.name,
            avatarUrl: me.avatarUrl,
            department: me.department,
            isAdmin: me.isAdmin,
          }}
          statusLabels={statusLabels}
          statusTones={statusTones}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
