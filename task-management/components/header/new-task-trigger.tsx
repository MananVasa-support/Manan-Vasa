import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { getCurrentEmployee } from "@/lib/auth/current";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";

export async function NewTaskTrigger() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  const [all, clients] = await Promise.all([
    listEmployees(),
    listActiveClientNames(),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));
  return (
    <NewTaskDialog
      employees={options}
      clients={clients}
      defaultInitiatorId={me.id}
    />
  );
}
