import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ComingSoon } from "@/components/layout/coming-soon";
import { Target } from "lucide-react";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function WeeklyGoalsPage() {
  await requireUser();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <ComingSoon
        Icon={Target}
        title="Weekly Goals"
        description="Set, track, and review weekly goals for you and your team. This space is being built — check back soon."
      />
      <DashboardFooter />
    </>
  );
}
