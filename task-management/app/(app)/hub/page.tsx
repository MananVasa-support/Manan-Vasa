import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { MODULE_THEME, MODULE_ORDER, type ModuleTheme } from "@/lib/module-theme";
import { HubSignOut } from "@/components/hub/hub-signout";
import { ModuleLogo } from "@/components/hub/module-logos";
import { GlobalSearch } from "@/components/header/global-search";
import type { ReactNode } from "react";
import { isManagerWithReports, managerDailyTaskGate } from "@/lib/manager-gates";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { gateSkipActive } from "@/lib/auth/gate-skip";
import { SkipGateButton } from "@/components/layout/skip-gate-button";
import { needsDailyChecklistPlan } from "@/lib/daily-checklist/gate";
import { loginPlanGateOn, loginDccGateOn, managerTaskGateOn, dccReviewGateOn } from "@/lib/goals/flag";
import { dccGateTarget, dccManagerReviewState } from "@/lib/dcc/gate";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";
import { ManagerDailyTaskGate } from "@/components/manager-gates/manager-daily-task-gate";
import { DccGateView } from "@/components/dcc/dcc-gate-view";
import { DccManagerReviewGate } from "@/components/dcc/dcc-manager-review-gate";

// The hub is the post-login landing and MUST run the (app) layout's daily-ritual
// gate on every request — never a cached/prerendered copy that would let someone
// past the wall. Force dynamic so the gate is always evaluated per-user.
export const dynamic = "force-dynamic";

/**
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Each workspace is a SOLID module-colour card with that module's cut-out
 * artwork (background removed) sitting on the right, fully visible — NO colour
 * scrim over the image. Text lives on the left so it never overlaps the art.
 * Colour, image and copy come from the single MODULE_THEME source of truth.
 * WMS has no art (the founder is designing its logo) → its icon stands in.
 * Server Component; the only interactive islands are sign-out + ⌘K search.
 */

/**
 * HUB-ONLY pastel palette. Scoped to the front-door cards so each module's own
 * strong identity colour (MODULE_THEME) stays intact everywhere inside it.
 * Order maps to MODULE_ORDER: WMS→Red, Admin→Blue, Employees→Green, HR→Teal,
 * Sales→Yellow, Training→Grey. `ink` is the deep tone used
 * for text/icons/button so it stays readable on the light pastel fill.
 */
const HUB_PASTEL: Record<WorkspaceId, { from: string; to: string; ink: string; inkSoft: string }> = {
  wms:       { from: "#FEE2E2", to: "#FECACA", ink: "#B91C1C", inkSoft: "#DC2626" }, // red
  admin:     { from: "#DBEAFE", to: "#BFDBFE", ink: "#1D4ED8", inkSoft: "#2563EB" }, // blue
  employees: { from: "#DCFCE7", to: "#BBF7D0", ink: "#15803D", inkSoft: "#16A34A" }, // green
  hr:        { from: "#CCFBF1", to: "#99F6E4", ink: "#0F766E", inkSoft: "#0D9488" }, // teal
  sales:     { from: "#EDE9FE", to: "#DDD6FE", ink: "#6D28D9", inkSoft: "#7C3AED" }, // violet
  training:  { from: "#FCE7F3", to: "#FBCFE8", ink: "#BE185D", inkSoft: "#DB2777" }, // pink
  accounts:  { from: "#DBEAFE", to: "#BFDBFE", ink: "#1D4ED8", inkSoft: "#2563EB" }, // (not shown on hub)
  events:    { from: "#CFFAFE", to: "#A5F3FC", ink: "#0E7490", inkSoft: "#0891B2" }, // cyan
  goals:     { from: "#FEF3C7", to: "#FDE68A", ink: "#B45309", inkSoft: "#D97706" }, // amber-gold
};

function WorkspaceCard({ m, locked, i }: { m: ModuleTheme; locked: boolean; i: number }) {
  const p = HUB_PASTEL[m.id];
  const delay = { animationDelay: `${i * 70}ms` } as const;

  const inner = (
    <>
      {/* Faint oversized logo bottom-right for depth/texture. */}
      <ModuleLogo
        id={m.id}
        size={104}
        className="pointer-events-none absolute -bottom-5 -right-5 opacity-[0.07]"
      />

      {/* Content — fully centred (logo + text) with no wasted middle gap. */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 p-5 text-center max-md:p-4">
        <ModuleLogo id={m.id} size={56} className="drop-shadow-[0_7px_16px_rgba(15,23,42,0.22)]" />
        <div className="w-full">
          <h3 className="text-[22px] font-extrabold leading-none tracking-tight max-md:text-[20px]" style={{ color: p.ink }}>
            {m.label}
          </h3>
          {/* Clamp to 2 lines so the tagline can never push the button off-card. */}
          <p className="mt-1.5 line-clamp-2 text-[12.5px] font-medium leading-snug" style={{ color: p.inkSoft }}>
            {m.tagline}
          </p>
          {locked ? (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill bg-black/10 px-3 py-1 text-[12.5px] font-bold" style={{ color: p.ink }}>
              <Lock size={13} strokeWidth={2.5} /> No access
            </span>
          ) : (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-bold text-white" style={{ background: p.ink }}>
              Enter
              <ArrowRight size={14} strokeWidth={2.8} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const base =
    "wg-rise group relative block h-[236px] overflow-hidden rounded-[28px] shadow-md max-md:h-[204px]";
  const bg = { background: `linear-gradient(145deg, ${p.from}, ${p.to})` };

  if (locked) {
    return (
      <div className={`${base} grayscale`} style={{ ...bg, ...delay }} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={m.href}
      aria-label={`Open ${m.label}`}
      className={`${base} transition duration-200 hover:-translate-y-1.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
      style={{ ...bg, ...delay, "--tw-ring-color": p.ink } as React.CSSProperties}
    >
      {inner}
    </Link>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

  // COMPULSORY DAILY WALL — enforced HERE on the hub (the post-login landing) in
  // addition to the (app) layout, because the layout's gate return wasn't
  // reliably taking effect for the /hub route on prod. Same policy: fail-open,
  // day-scoped, super-admin-skippable, kill-switchable (DCC_GATE_OFF /
  // MANAGER_GATES_OFF). Employees must commit ≥5 checklist items + log goal
  // progress; managers get their task-give gate; everyone fills DCC.
  {
    // Keep in LOCK-STEP with app/(app)/layout.tsx. COMPULSORY: plan gate + own-DCC.
    // SKIPPABLE by super-admins: manager (assign) + DCC-review gates.
    // All four login walls are now OFF by default (Sir) — kept behind kill-switches,
    // restorable per-gate: LOGIN_PLAN_GATE_ON / LOGIN_DCC_GATE_ON / MANAGER_TASK_GATE_ON
    // / DCC_REVIEW_GATE_ON. Kept in lock-step with app/(app)/layout.tsx.
    const isManager = await isManagerWithReports(me.id).catch(() => false);
    if (loginPlanGateOn() && !isManager) {
      const mustPlan = await needsDailyChecklistPlan(me.id).catch(() => false);
      if (mustPlan) return <DailyChecklistView employeeId={me.id} greetingName={firstName} mode="gate" />;
    }
    if (loginDccGateOn()) {
      const dccTarget = await dccGateTarget(me.id).catch(() => null);
      if (dccTarget) return <DccGateView greetingName={firstName} date={dccTarget.date} items={dccTarget.items} entries={dccTarget.entries} />;
    }
    const canSkip = isSuperAdmin(me.email);
    const skipDuties = canSkip && (await gateSkipActive(me).catch(() => false));
    const withSkip = (node: ReactNode) => (canSkip ? <>{node}<SkipGateButton /></> : node);
    if (!skipDuties) {
      if (managerTaskGateOn()) {
        const dailyGate = await managerDailyTaskGate(me.id).catch(() => null);
        if (dailyGate && !dailyGate.satisfied) return withSkip(<ManagerDailyTaskGate greetingName={firstName} state={dailyGate} />);
      }
      if (dccReviewGateOn()) {
        const dccReview = await dccManagerReviewState(me).catch(() => null);
        if (dccReview && !dccReview.satisfied) return withSkip(<DccManagerReviewGate greetingName={firstName} state={dccReview} />);
      }
    }
  }

  const access = await accessFor(me);

  return (
    <main
      className="flex min-h-[100dvh] w-full flex-col"
      style={{ background: "linear-gradient(180deg, #f6f7f9 0%, #fbfbfc 38%, #ffffff 100%)" }}
    >
      <div className="mx-auto flex w-full max-w-[1140px] flex-col px-8 py-6 max-md:px-5 max-md:py-5">
        {/* ONE BAND — logo (extreme left) · welcome hero (page-centered) · Hi over
            Sign out (right). Both side clusters are flex-1 so the centre block is
            truly centered on the page regardless of their differing widths. */}
        <header className="flex shrink-0 items-center gap-6 max-md:flex-col max-md:gap-4 max-md:text-center">
          <div className="flex flex-1 justify-start max-md:justify-center">
            <Image
              src="/logo.png"
              alt="Altus Corp"
              width={170}
              height={188}
              priority
              className="h-[84px] w-auto shrink-0 max-md:h-[64px]"
            />
          </div>

          <div className="shrink-0 text-center">
            <span className="text-[12px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red)" }}>
              Altus&nbsp;/&nbsp;Workspaces
            </span>
            <h1 className="mt-1 font-extrabold tracking-tight text-ink-strong" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.02 }}>
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-[15px] text-ink-muted">Choose your workspace to get started</p>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3 max-md:justify-center">
            <GlobalSearch />
            {/* "Hi, Hetesh" stacked directly above a compact Sign out button. */}
            <div className="flex flex-col items-end gap-1 max-md:items-center">
              <span className="text-[14px] text-ink-soft">
                Hi, <strong className="font-bold text-ink-strong">{firstName}</strong>
              </span>
              <HubSignOut />
            </div>
          </div>
        </header>

        {/* Workspace grid — 8 modules. On xl the 4×2 grid fills the viewport with
            no scroll; below xl it flows into fewer columns and the page scrolls. */}
        <section
          className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Workspaces"
        >
          {MODULE_ORDER.map((id, i) => (
            <WorkspaceCard key={id} m={MODULE_THEME[id]} locked={!canAccessWorkspace(id, access)} i={i} />
          ))}
        </section>
      </div>
    </main>
  );
}
