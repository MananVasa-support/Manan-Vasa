import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { TaskDetailSkeleton } from "@/components/tasks/task-detail-skeleton";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Task detail — Phase 1.2 streaming shell.
 *
 * Header + main container + footer render synchronously so the user sees
 * a chrome'd page in well under 100ms. The actual content lives behind a
 * `<Suspense>` boundary that the loader fills in once `getTaskById` and
 * the picker fan-outs settle. The five static picker queries are cached
 * (Phase 1.1) so on a warm cache the streamed payload arrives quickly
 * after the per-task readback.
 */
export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  // requireUser is already cached per-request (lib/auth/current uses
  // `cache()`); doing it here keeps auth-gating ahead of any rendering
  // and gives the loader its `me` payload without a second resolve.
  const me = await requireUser();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-12 max-md:px-4 pt-10 pb-20">
        <Suspense key={id} fallback={<TaskDetailSkeleton />}>
          <TaskDetailLoader
            taskId={id}
            me={{
              id: me.id,
              name: me.name,
              avatarUrl: me.avatarUrl,
              department: me.department,
              isAdmin: me.isAdmin,
            }}
          />
        </Suspense>
      </main>
      <DashboardFooter />
    </>
  );
}
