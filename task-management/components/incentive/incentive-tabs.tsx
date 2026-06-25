"use client";

import { useState } from "react";
import { LayoutDashboard, ListChecks, IndianRupee, Target, Table2 } from "lucide-react";
import type {
  IncentiveDashboard as DashboardData,
  IncentiveTargetVsActual,
  IncentiveEntryAdminRow,
} from "@/lib/queries/incentives";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import type { BillingSummary } from "@/lib/billing/sheet";
import type { EmployeeOption } from "@/lib/queries/employees";
import { IncentiveDashboard } from "./incentive-dashboard";
import { BillingDashboard } from "./billing-dashboard";
import { IncentiveFormDialog } from "./incentive-form-dialog";
import { IncentiveList } from "./incentive-list";
import { IncentiveTargets } from "./incentive-targets";
import { IncentiveEntries } from "./incentive-entries";

type TabKey = "dashboard" | "targets" | "billing" | "requests" | "entries";

export function IncentiveTabs({
  dashboard,
  targetVsActual,
  billing,
  years,
  year,
  requests,
  entries,
  employees,
  isAdmin,
  pendingCount,
}: {
  dashboard: DashboardData;
  targetVsActual: IncentiveTargetVsActual;
  billing: BillingSummary & { error?: string };
  years: number[];
  year: number;
  requests: IncentiveRequestRow[];
  entries: IncentiveEntryAdminRow[];
  employees: EmployeeOption[];
  isAdmin: boolean;
  pendingCount: number;
}) {
  const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "targets", label: "Targets", icon: Target },
    { key: "billing", label: "Billing", icon: IndianRupee },
    { key: "requests", label: "Requests", icon: ListChecks },
    ...(isAdmin ? [{ key: "entries" as const, label: "Entries", icon: Table2 }] : []),
  ];

  const [active, setActive] = useState<TabKey>("dashboard");

  function onYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const url = new URL(window.location.href);
    url.searchParams.set("year", next);
    window.location.assign(url.toString());
  }

  return (
    <div>
      {/* Tab strip + (dashboard-only) year selector */}
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-hairline-strong mb-7">
        <div role="tablist" aria-label="Incentive views" className="flex gap-1">
          {TABS.map((t) => {
            const isActive = t.key === active;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.key)}
                className="relative inline-flex items-center gap-2 px-5 py-3 transition-colors"
                style={{
                  fontSize: 16,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Icon size={16} strokeWidth={2.2} />
                {t.label}
                {t.key === "requests" && pendingCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center rounded-full font-bold tabular-nums"
                    style={{
                      minWidth: 20,
                      height: 20,
                      padding: "0 6px",
                      fontSize: 11,
                      color: "#fff",
                      background: "var(--color-altus-red)",
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: 12,
                      right: 12,
                      height: 3,
                      background: "var(--color-altus-red)",
                      borderRadius: 3,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {active !== "requests" && (
          <label className="flex items-center gap-2 pb-2.5">
            <span
              className="uppercase font-bold tracking-[0.06em] text-ink-subtle"
              style={{ fontSize: 11 }}
            >
              Year
            </span>
            <select
              value={year}
              onChange={onYearChange}
              className="rounded-md border border-hairline-strong bg-surface-card font-semibold text-ink-strong"
              style={{ fontSize: 14, padding: "6px 10px" }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {active === "dashboard" ? (
        <IncentiveDashboard data={dashboard} year={year} />
      ) : active === "targets" ? (
        <IncentiveTargets data={targetVsActual} year={year} isAdmin={isAdmin} />
      ) : active === "billing" ? (
        <BillingDashboard data={billing} />
      ) : active === "entries" && isAdmin ? (
        <IncentiveEntries rows={entries} employees={employees} year={year} />
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <IncentiveFormDialog />
          </div>
          <IncentiveList rows={requests} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
