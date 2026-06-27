import { getCurrentEmployee } from "@/lib/auth/current";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";

/**
 * Header "New Task" trigger. Deliberately does NOT fetch the modal's option
 * rosters (employees / clients / subjects / projects) — those load lazily on
 * first open inside NewTaskDialog (loadNewTaskOptions). Fetching them here ran
 * 4 DB queries on every header render AND every realtime `router.refresh()`,
 * and handed the OPEN modal fresh array identities that re-synced its dropdowns
 * mid-edit (the New Task modal instability). This component now only resolves
 * the cheap, request-cached current employee for the initiator default.
 */
export async function NewTaskTrigger() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  return <NewTaskDialog defaultInitiatorId={me.id} isAdmin={me.isAdmin} />;
}
