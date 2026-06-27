import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import {
  ShieldCheck,
  LayoutGrid,
  Users,
  TrendingUp,
  Megaphone,
  GraduationCap,
  ArrowRight,
  Lock,
  Search,
  Feather,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { HubSignOut } from "@/components/hub/hub-signout";
import { GlobalSearch } from "@/components/header/global-search";

/**
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Clean modern SaaS card grid: soft white cards with a tinted icon tile + a
 * per-card accent on the "Enter workspace" link, a personalised welcome, and a
 * global-search bar across the bottom. Server Component; the only interactive
 * islands are the sign-out button and the ⌘K search trigger.
 */

type Card = {
  ws: WorkspaceId;
  label: string;
  desc: string;
  href: Route;
  Icon: LucideIcon;
  tile: string;
  fg: string;
};

const CARDS: Card[] = [
  { ws: "admin", label: "Admin", desc: "People, settings, payroll & the control room.", href: "/ws/admin" as Route, Icon: ShieldCheck, tile: "rgba(225,6,0,0.08)", fg: "var(--color-altus-red)" },
  { ws: "wms", label: "WMS", desc: "The work dashboard — tasks, goals & the daily loop.", href: "/ws/wms" as Route, Icon: LayoutGrid, tile: "#eef0fb", fg: "#4f46e5" },
  { ws: "employees", label: "Employees", desc: "Attendance, leave, salary & the team roster.", href: "/ws/employees" as Route, Icon: Users, tile: "#e7f5ec", fg: "#15803d" },
  { ws: "sales", label: "Sales", desc: "Collections, references & breakthroughs — and more.", href: "/ws/sales" as Route, Icon: TrendingUp, tile: "#f1ebfb", fg: "#7c3aed" },
  { ws: "marketing", label: "Marketing", desc: "The index today — campaigns & reach landing next.", href: "/ws/marketing" as Route, Icon: Megaphone, tile: "#fdf0e2", fg: "#ea7a17" },
  { ws: "training", label: "Training", desc: "Material library, tests, induction & feedback.", href: "/ws/training" as Route, Icon: GraduationCap, tile: "#e9f1fd", fg: "#2563eb" },
];

const CARD_BASE = "wg-rise wg-sheen group flex flex-col items-center overflow-hidden rounded-3xl border border-hairline bg-white px-7 py-10 text-center shadow-sm max-md:py-8";
const CARD_HOVER = "transition duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red focus-visible:ring-offset-2";

function WorkspaceCard({ c, locked, i }: { c: Card; locked: boolean; i: number }) {
  const Icon = c.Icon;
  const tileBg = locked ? "var(--color-surface-soft)" : c.tile;
  const iconColor = locked ? "var(--color-ink-subtle)" : c.fg;
  const delay = { animationDelay: `${i * 70}ms` } as const;

  const content = (
    <>
      <span className="inline-flex size-[76px] items-center justify-center rounded-[22px] transition-transform duration-300 group-hover:scale-105" style={{ background: tileBg }}>
        <Icon size={36} strokeWidth={2.1} style={{ color: iconColor }} />
      </span>
      <h3 className="mt-6 text-[28px] font-extrabold tracking-tight text-ink-strong">{c.label}</h3>
      <p className="mt-2.5 max-w-[280px] text-[16px] leading-snug text-ink-muted">{c.desc}</p>
      {locked ? (
        <span className="mt-7 inline-flex items-center gap-1.5 text-[15px] font-bold text-ink-subtle">
          <Lock size={15} strokeWidth={2.4} /> No access
        </span>
      ) : (
        <span className="mt-7 inline-flex items-center gap-1.5 text-[15.5px] font-bold" style={{ color: c.fg }}>
          Enter workspace
          <ArrowRight size={16} strokeWidth={2.6} className="transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      )}
    </>
  );

  if (locked) {
    return (
      <div className={`${CARD_BASE} opacity-75`} style={delay} aria-disabled="true">
        {content}
      </div>
    );
  }
  return (
    <Link href={c.href} aria-label={`Open ${c.label}`} className={`${CARD_BASE} ${CARD_HOVER}`} style={delay}>
      {content}
    </Link>
  );
}

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;
  const access = accessFor(me);

  return (
    <main className="min-h-[100dvh] w-full" style={{ background: "linear-gradient(180deg, #f6f7f9 0%, #fbfbfc 38%, #ffffff 100%)" }}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-9 max-md:px-5 max-md:py-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <Image src="/logo.png" alt="Altus Corp" width={86} height={95} priority className="h-[72px] w-auto max-md:h-[60px]" />
          <div className="flex items-center gap-4">
            <span className="text-[15px] text-ink-soft max-sm:hidden">
              Hi, <strong className="font-bold text-ink-strong">{firstName}</strong>
            </span>
            <HubSignOut />
          </div>
        </header>

        {/* Hero — centered */}
        <section className="mt-12 mb-10 flex flex-col items-center text-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red)" }}>
            Altus&nbsp;/&nbsp;Workspaces
          </span>
          <h1 className="mt-2.5 font-extrabold tracking-tight text-ink-strong" style={{ fontSize: "clamp(38px, 4.8vw, 58px)", lineHeight: 1.03 }}>
            Welcome back, {firstName}
          </h1>
          <p className="mt-3 text-[18px] text-ink-muted">Choose your workspace to get started</p>
        </section>

        {/* Workspace grid */}
        <section className="grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1" aria-label="Workspaces">
          {CARDS.map((c, i) => (
            <WorkspaceCard key={c.label} c={c} locked={!canAccessWorkspace(c.ws, access)} i={i} />
          ))}
        </section>

        {/* Global search bar */}
        <section className="mt-6 rounded-2xl border border-hairline bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-5 max-md:flex-col max-md:items-stretch">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "#eef1f6" }}>
                <Feather size={20} strokeWidth={2.1} style={{ color: "var(--color-ink-soft)" }} />
              </span>
              <div>
                <div className="text-[15.5px] font-bold text-ink-strong">Need something specific?</div>
                <div className="text-[13.5px] text-ink-muted">Use global search to find anything across workspaces.</div>
              </div>
            </div>
            <GlobalSearch
              trigger={
                <button
                  type="button"
                  aria-label="Search across workspaces"
                  className="flex h-12 w-[440px] max-w-full items-center gap-3 rounded-xl border border-hairline-strong bg-surface-soft px-4 text-ink-subtle transition-colors hover:border-altus-red hover:bg-white max-md:w-full"
                >
                  <Search size={18} strokeWidth={2.2} className="shrink-0" />
                  <span className="flex-1 text-left text-[14.5px]">Search across workspaces…</span>
                  <kbd className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-white px-1.5 py-0.5 text-[11.5px] font-bold text-ink-subtle">⌘K</kbd>
                </button>
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}
