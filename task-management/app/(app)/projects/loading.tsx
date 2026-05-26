import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <div className="sticky top-0 z-40 h-[96px] max-md:h-[72px] border-b border-[color:var(--color-hairline,#e5e7eb)] bg-white/70 backdrop-blur" />
      <main className="px-6 max-md:px-4 py-6 max-w-[1400px] mx-auto w-full">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      </main>
    </>
  );
}
