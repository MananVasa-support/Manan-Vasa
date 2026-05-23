import { listEmployees } from "@/lib/queries/employees";
import { getCurrentEmployee } from "@/lib/auth/current";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";

export async function NewTaskTrigger() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  const all = await listEmployees();
  const options = all.map((e) => ({ id: e.id, name: e.name }));
  return <NewTaskDialog employees={options} defaultInitiatorId={me.id} />;
}
