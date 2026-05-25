import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ProjectTree } from "@/components/projects/project-tree";
import { listProjectTree } from "@/lib/queries/projects";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireUser();
  const tree = await listProjectTree();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[960px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">Projects</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Break work down: Project → Milestone → Result. Connect any task to a
            node from the task's form.
          </p>
        </header>
        <ProjectTree tree={tree} />
      </main>
      <DashboardFooter />
    </>
  );
}
