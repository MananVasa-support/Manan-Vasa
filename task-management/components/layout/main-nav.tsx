"use client";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  ClipboardList,
  CalendarDays,
  FolderKanban,
  SquareKanban,
  Target,
  ListChecks,
  CalendarCheck,
  CalendarRange,
  CalendarClock,
  CreditCard,
  Award,
  IndianRupee,
  Compass,
  Receipt,
  Timer,
  Sparkles,
  BookMarked,
  ShieldCheck,
  Handshake,
  GraduationCap,
  LayoutGrid,
  MessageSquareHeart,
  PiggyBank,
  LineChart,
  Banknote,
  Landmark,
  Users,
  CandlestickChart,
  FolderArchive,
  Gauge,
  Gem,
  Share2,
  Star,
  Medal,
  FolderLock,
  Palette,
  PartyPopper,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { MainNavPill } from "./main-nav-pill";
import { MainNavGroup } from "./main-nav-group";
import { workspaceForPath, type WorkspaceId } from "@/lib/workspaces";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
  /** Active workspace from the `aw` cookie (server-resolved). */
  cookieWorkspace?: WorkspaceId;
}

/**
 * One nav destination. `not` lists path prefixes that should NOT count as
 * active even though they start with `href` (e.g. `/tasks` must not light up
 * on `/tasks/agenda`). `exact` matches the pathname exactly (for `/`).
 */
interface NavItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  adminOnly?: boolean;
  exact?: boolean;
  not?: string[];
  /** Special-cased active-tasks badge — only Tasks carries it. */
  countKey?: "activeTasks";
}

interface NavGroup {
  label: string;
  Icon: LucideIcon;
  items: NavItem[];
}

interface WorkspaceNav {
  /** Top-level pills shown directly in the bar. */
  top: NavItem[];
  /** Secondary destinations folded into a "More" dropdown. */
  groups: NavGroup[];
}

/**
 * Per-workspace navigation. Each room exposes ONLY its own modules — entering
 * WMS never shows Attendance/Salary/Outstanding, and vice-versa. Shared platform
 * surfaces (Inbox, Archived, Profile, Admin Panel) intentionally live in the
 * avatar menu, reachable from every workspace, so they don't clutter any one
 * room's bar. Only LIVE routes are listed; new modules join as they ship.
 */
const WORKSPACE_NAV: Record<WorkspaceId, WorkspaceNav> = {
  wms: {
    top: [
      { href: "/dashboard" as Route, label: "Dashboard", Icon: LayoutDashboard, exact: true },
      { href: "/tasks/agenda" as Route, label: "My Day", Icon: CalendarDays },
      {
        href: "/tasks" as Route,
        label: "Tasks",
        Icon: ListTodo,
        not: ["/tasks/agenda", "/tasks/kanban"],
        countKey: "activeTasks",
      },
      { href: "/tasks/kanban" as Route, label: "Kanban", Icon: SquareKanban, adminOnly: true },
      { href: "/projects" as Route, label: "Projects", Icon: FolderKanban },
    ],
    // No "More" dropdown — Documents already lives in the profile/avatar menu.
    groups: [],
  },
  employees: {
    top: [
      { href: "/pms" as Route, label: "Performance", Icon: Target, not: ["/pms/config", "/pms/review", "/pms/signals"] },
      { href: "/pms/review" as Route, label: "360 Review", Icon: Star },
      { href: "/pms/signals" as Route, label: "Signals", Icon: Medal, adminOnly: true },
      {
        href: "/attendance" as Route,
        label: "Attendance",
        Icon: CalendarCheck,
        not: ["/attendance/dashboard", "/attendance/hr-record"],
      },
      { href: "/dcc" as Route, label: "DCC", Icon: Gauge },
      {
        href: "/attendance/hr-record" as Route,
        label: "HR Record",
        Icon: ClipboardList,
        adminOnly: true,
      },
      { href: "/salary" as Route, label: "Salary", Icon: IndianRupee, adminOnly: true },
      { href: "/incentive" as Route, label: "Incentive", Icon: Award },
      {
        href: "/overtime" as Route,
        label: "Overtime",
        Icon: Timer,
        not: ["/overtime/dashboard"],
      },
      { href: "/reimbursements" as Route, label: "Reimbursements", Icon: Receipt },
      { href: "/dossier" as Route, label: "Dossier", Icon: FolderLock },
    ],
    groups: [],
  },
  sales: {
    top: [
      { href: "/ambassadors" as Route, label: "Ambassadors", Icon: Gem },
      { href: "/people-gives" as Route, label: "People Gives", Icon: Handshake },
      { href: "/outstanding" as Route, label: "Outstanding", Icon: IndianRupee },
      { href: "/participant-breakthrough" as Route, label: "Breakthrough", Icon: Sparkles },
      { href: "/record-reference" as Route, label: "References", Icon: BookMarked },
    ],
    groups: [],
  },
  marketing: {
    top: [{ href: "/index-hub" as Route, label: "Index", Icon: Compass }],
    groups: [],
  },
  admin: {
    top: [{ href: "/admin" as Route, label: "Admin Panel", Icon: ShieldCheck }],
    groups: [],
  },
  training: {
    top: [
      {
        href: "/training" as Route,
        label: "Library",
        Icon: GraduationCap,
        not: [
          "/training/feedback", "/training/induction", "/training/dashboard",
          "/training/calendar", "/training/self-learning", "/training/share", "/training/obligations",
        ],
      },
      { href: "/training/calendar" as Route, label: "Calendar", Icon: CalendarClock },
      { href: "/training/self-learning" as Route, label: "Self-Learning", Icon: BookMarked },
      { href: "/training/share" as Route, label: "Share", Icon: Share2 },
      { href: "/training/obligations" as Route, label: "Obligations", Icon: Gauge },
    ],
    groups: [
      {
        label: "More",
        Icon: LayoutGrid,
        items: [
          { href: "/training/induction" as Route, label: "Induction", Icon: ListChecks },
          { href: "/training/feedback" as Route, label: "Feedback", Icon: MessageSquareHeart },
          { href: "/training/dashboard" as Route, label: "Dashboard", Icon: LayoutDashboard },
        ],
      },
    ],
  },
  accounts: {
    // The Accounts module owns its own bar — never the WMS pills. "Index" is the
    // full section directory; the live sections sit beside it. New sections join
    // here as they ship.
    top: [
      // "Back to Admin" removed — the Admin control-room is reached only via the
      // profile menu. "Task List" removed — migrated into the WMS task list.
      { href: "/accounts" as Route, label: "Index", Icon: LayoutGrid, exact: true },
      { href: "/accounts/weekly-checklist" as Route, label: "Weekly Checklist", Icon: CalendarCheck },
      { href: "/accounts/monthly-quarterly-annual" as Route, label: "Monthly Checklist", Icon: CalendarRange },
      { href: "/accounts/cc-tracker" as Route, label: "CC Master", Icon: CreditCard },
      { href: "/accounts/due-dates" as Route, label: "Due Dates", Icon: CalendarClock },
      { href: "/accounts/sip-tracker" as Route, label: "SIP", Icon: PiggyBank },
      { href: "/accounts/fno-income" as Route, label: "FNO Income", Icon: LineChart },
      { href: "/accounts/cash-withdrawal" as Route, label: "Cash Withdrawal", Icon: Banknote },
      { href: "/accounts/bank-balance" as Route, label: "Bank Balance", Icon: Landmark },
      { href: "/accounts/vasa-family-interpersonal" as Route, label: "Vasa Family", Icon: Users },
      { href: "/accounts/shares-register" as Route, label: "Shares", Icon: CandlestickChart },
      { href: "/accounts/income-tax-master-folder" as Route, label: "IT Folder", Icon: FolderArchive },
      { href: "/accounts/ca-handover" as Route, label: "CA Handover", Icon: ShieldCheck },
    ],
    groups: [],
  },
  events: {
    // Monthly Events Master — the calendar is the hero; masters/batches/
    // holidays/obligations are admin surfaces.
    top: [
      { href: "/events" as Route, label: "Overview", Icon: LayoutGrid, exact: true },
      { href: "/events/calendar" as Route, label: "Calendar", Icon: CalendarDays },
      { href: "/events/masters" as Route, label: "Masters", Icon: Palette, adminOnly: true },
      { href: "/events/batches" as Route, label: "Batches", Icon: CalendarClock, adminOnly: true },
      {
        href: "/events/holidays" as Route,
        label: "Holidays",
        Icon: PartyPopper,
        adminOnly: true,
        not: ["/events/holidays/list"],
      },
      { href: "/events/obligations" as Route, label: "Obligations", Icon: Gauge, adminOnly: true },
    ],
    groups: [],
  },
  goals: {
    // Goals Cascade — the year board is the hero; the re-parented Weekly Goals +
    // Daily Checklist modules, plan-your-day, review, and the Saturday-commit /
    // Monday-approve gate surfaces sit beside it. (The old /goals/weekly pill is
    // dropped — Weekly Goals at /weekly-goals is the canonical weekly board.)
    top: [
      { href: "/goals" as Route, label: "Cascade", Icon: Target, exact: true },
      { href: "/weekly-goals" as Route, label: "Weekly Goals", Icon: Target, not: ["/weekly-goals/team"] },
      { href: "/weekly-goals/team" as Route, label: "Team", Icon: Users },
      { href: "/daily-checklist" as Route, label: "Daily Checklist", Icon: ListChecks },
      { href: "/goals/plan" as Route, label: "Plan Your Day", Icon: CalendarDays },
      { href: "/goals/review" as Route, label: "Review", Icon: ClipboardList },
      { href: "/goals/commit" as Route, label: "Commit", Icon: CalendarCheck },
      { href: "/goals/approve" as Route, label: "Approve", Icon: CalendarRange },
    ],
    groups: [],
  },
};

export function MainNav({ activeTasks, isAdmin, variant, cookieWorkspace }: Props) {
  const pathname = usePathname();

  // Path wins (keeps the bar in sync with the page you're actually on); the
  // cookie covers shared surfaces; WMS is the floor.
  const workspace: WorkspaceId =
    workspaceForPath(pathname) ?? cookieWorkspace ?? "wms";
  const { top, groups } = WORKSPACE_NAV[workspace];

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    if (!pathname.startsWith(item.href)) return false;
    if (item.not?.some((p) => pathname.startsWith(p))) return false;
    return true;
  }

  function visible(items: NavItem[]): NavItem[] {
    return items.filter((it) => !it.adminOnly || isAdmin);
  }

  function renderPill(item: NavItem) {
    return (
      <MainNavPill
        key={item.href}
        href={item.href}
        label={item.label}
        Icon={item.Icon}
        active={isActive(item)}
        count={item.countKey === "activeTasks" ? activeTasks : undefined}
        variant={variant}
      />
    );
  }

  const topPills = visible(top);

  const moreSections = groups
    .map((g) => ({
      label: g.label,
      items: visible(g.items).map((it) => ({
        href: it.href,
        label: it.label,
        Icon: it.Icon,
        active: isActive(it),
      })),
    }))
    .filter((s) => s.items.length > 0);

  // ── Mobile drawer: switcher on top, then flat pills (+ "More" group inline).
  if (variant === "drawer") {
    return (
      <nav aria-label="Primary" className="flex flex-col gap-1.5 w-full">
        {topPills.map(renderPill)}
        {groups.map((group) => {
          const items = visible(group.items);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-2 flex flex-col gap-1.5">
              <div className="nav-drawer-section">{group.label}</div>
              {items.map(renderPill)}
            </div>
          );
        })}
      </nav>
    );
  }

  // ── Desktop: workspace switcher · top pills · "More" dropdown.
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
    >
      {topPills.map(renderPill)}
      {moreSections.length > 0 && (
        <>
          <span aria-hidden className="nav-group-divider" />
          <MainNavGroup
            label="More"
            Icon={LayoutGrid}
            sections={moreSections}
            active={moreSections.some((s) => s.items.some((it) => it.active))}
          />
        </>
      )}
    </nav>
  );
}
