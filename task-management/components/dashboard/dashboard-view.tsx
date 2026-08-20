"use client";

import * as React from "react";

export type DashboardViewId = "overview" | "performance";

const VIEWS: { id: DashboardViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
];

const Ctx = React.createContext<{
  view: DashboardViewId;
  setView: (v: DashboardViewId) => void;
} | null>(null);

/**
 * Shared state for the dashboard's Overview / Performance switch.
 *
 * It lives in a context because the control and the content it drives are no
 * longer neighbours: the pills sit in the Task Summary header at the TOP of the
 * page, and the panel they select renders at the BOTTOM. Their nearest common
 * ancestor is a plain div in a SERVER component, which cannot hold useState —
 * so the provider is this client component, wrapped around that region.
 *
 * The pills used to be part of the analytics box itself, with the state private
 * to it. Moving them into the summary header is what forced the split.
 */
export function DashboardViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<DashboardViewId>("overview");
  const value = React.useMemo(() => ({ view, setView }), [view]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Throws outside the provider — a silent default would desync the pills from
 *  the panel, which is the one failure this context exists to prevent. */
export function useDashboardView() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useDashboardView must be used inside <DashboardViewProvider>");
  return ctx;
}

/** The segmented pill switcher, rendered in the Task Summary section header. */
export function DashboardViewTabs() {
  const { view, setView } = useDashboardView();
  return (
    <div
      role="tablist"
      aria-label="Dashboard views"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1"
    >
      {VIEWS.map((v) => {
        const isActive = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`dashboard-tab-${v.id}`}
            aria-selected={isActive}
            aria-controls={`dashboard-panel-${v.id}`}
            onClick={() => setView(v.id)}
            className={`px-3 py-1 text-xs transition-colors ${
              isActive
                ? "rounded-md bg-white font-semibold text-red-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
