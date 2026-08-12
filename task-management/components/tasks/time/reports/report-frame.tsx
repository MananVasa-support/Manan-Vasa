import type { ReactNode } from "react";
import { Timer } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { TimeReportTabs } from "./report-tabs";
import { ReportHero, EmptyState } from "./report-ui";

/**
 * Shared chrome for the /tasks/time report pages — header, PageShell, glass
 * hero, the report tab-switcher, then the page's own body. Keeps the four
 * report routes DRY (the Overview hub renders its own body directly).
 */
export function TimeReportFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <ReportHero
          eyebrow="WMS · Task Time Intelligence"
          title={title}
          subtitle={subtitle}
          Icon={Timer}
          actions={actions}
        />
        <TimeReportTabs />
        {children}
      </PageShell>
    </>
  );
}

/** Full-page "feature disabled" screen (TIME_INTEL_OFF). */
export function TimeIntelDisabledScreen() {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <ReportHero
          eyebrow="WMS · Task Time Intelligence"
          title="Time Intelligence"
          Icon={Timer}
        />
        <EmptyState
          Icon={Timer}
          title="Time Intelligence is turned off"
          hint="This feature is disabled (TIME_INTEL_OFF). Ask an administrator to enable it."
        />
      </PageShell>
    </>
  );
}
