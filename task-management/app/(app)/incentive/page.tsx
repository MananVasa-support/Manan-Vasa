import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ComingSoon } from "@/components/layout/coming-soon";
import { Award } from "lucide-react";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function IncentivePage() {
  await requireUser();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <ComingSoon
        Icon={Award}
        title="Incentive"
        description="Performance incentives, rewards, and payouts — all in one place. This space is being built — check back soon."
      />
      <DashboardFooter />
    </>
  );
}
