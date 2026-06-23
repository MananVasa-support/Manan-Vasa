import { PageBuffering } from "@/components/ui/spinner";
import { DashboardBodySkeleton } from "@/components/dashboard/dashboard-body-skeleton";

/**
 * Dashboard skeleton — sits behind `/` while the server component
 * resolves all of the home-page rollups + charts. The shapes match the
 * editorial-minimal hero layout (big number row, then chart blocks)
 * so the visual jump on data arrival is minimal. Also the fallback
 * skeleton for app routes without their own loading.tsx (profile,
 * documents, agenda, import, new, focus, projects/[id]).
 */
export default function DashboardLoading() {
  return (
    <>
      <PageBuffering label="Loading…" />
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <DashboardBodySkeleton />
    </>
  );
}
