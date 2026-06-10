import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ComingSoon } from "@/components/layout/coming-soon";
import { CalendarCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  await requireUser();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <ComingSoon
        Icon={CalendarCheck}
        title="Attendance"
        description="Daily attendance, leaves, and presence at a glance. This space is being built — check back soon."
      />
      <DashboardFooter />
    </>
  );
}
