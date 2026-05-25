import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { AgendaBoard, type AgendaTask } from "@/components/tasks/agenda-board";
import { listAgendaTasks } from "@/lib/queries/tasks";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

/** yyyy-mm-dd for a Date in IST. */
function istYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export default async function AgendaPage() {
  const me = await requireUser();
  const tasks = await listAgendaTasks(me.id);

  const now = new Date();
  const todayYmd = istYmd(now);

  // Build up to 6 upcoming day columns (today first), IST.
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const ymd = istYmd(d);
    const label =
      i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
    const sub = d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: TZ });
    return { ymd, label, sub };
  });

  // Decorate each task with its IST due-day, then split overdue vs upcoming.
  const decorated: AgendaTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    subject: t.subject,
    description: t.description,
    dueYmd: istYmd(t.dueAt),
  }));

  const overdueTasks = decorated.filter((t) => t.dueYmd < todayYmd);
  const upcoming = decorated.filter((t) => t.dueYmd >= todayYmd);
  const dueToday = decorated.filter((t) => t.dueYmd === todayYmd).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-8 max-md:px-4 pt-8 pb-16">
        <AgendaBoard
          firstName={me.name.split(" ")[0] ?? me.name}
          dueToday={dueToday}
          overdue={overdueTasks.length}
          days={days}
          overdueTasks={overdueTasks}
          tasks={upcoming}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
