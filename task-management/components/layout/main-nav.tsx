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
  Wallet,
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
  FolderLock,
  Palette,
  PartyPopper,
  FileSignature,
  Trash2,
  Trophy,
  ScrollText,
  Mail,
  BellRing,
  LifeBuoy,
  UserSearch,
  ClipboardCheck,
  DoorOpen,
  Briefcase,
  Home,
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
  /**
   * Whether GOALS_CANVAS_ON is set (server-resolved in MainNavServer — the env
   * var is not NEXT_PUBLIC, so it is ALWAYS falsy client-side). Gates the Goals
   * level items, which server-redirect to /goals when the flag is off (bug #11).
   */
  goalsCanvasEnabled?: boolean;
  /** Active Goals space (mig 0150). "personal" swaps the goals nav for the
   *  private admin set (levels + Recycle Bin, no team rituals). */
  goalsSpace?: "professional" | "personal";
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
  /** Item exists only when GOALS_CANVAS_ON is set — hidden when off (bug #11). */
  canvasOnly?: boolean;
  /** Fallback destination when GOALS_CANVAS_ON is off (bug #11) — the item is
   *  repointed there instead of bouncing off the level page's redirect. */
  canvasOffHref?: Route;
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

/* ── HR room: per-sub-module sidebars ────────────────────────────────────────
 * HR is a two-tier room. The front door (`/hr`) offers seven cards; the four
 * lifecycle STAGES each own a separate sidebar, swapped in by hrSectionForPath.
 * Everything else (Overview, Holiday List, Help Desk) keeps the hub rail.       */
type HrSection = "hub" | "pre-interview" | "post-interview" | "pre-joining" | "post-joining";

/** The front-door rail — the seven stages, so the rail is also the switcher. */
const HR_HUB_NAV: WorkspaceNav = {
  top: [
    { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true },
    { href: "/hr/pre-interview" as Route, label: "Pre-Interview", Icon: UserSearch },
    { href: "/hr/post-interview" as Route, label: "Post-Interview", Icon: ClipboardCheck },
    { href: "/hr/pre-joining" as Route, label: "Pre-Joining", Icon: DoorOpen },
    { href: "/hr/post-joining" as Route, label: "Post-Joining", Icon: Briefcase },
    { href: "/hr/overview" as Route, label: "Overview", Icon: LayoutGrid },
    { href: "/holidays" as Route, label: "Holiday List", Icon: PartyPopper },
    { href: "/support" as Route, label: "Help Desk", Icon: LifeBuoy },
  ],
  groups: [],
};

/** Post-Joining — the working employee's file. HR Record stays admin-only. */
const HR_POST_JOINING_NAV: WorkspaceNav = {
  top: [
    { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true },
    { href: "/hr/post-joining" as Route, label: "Post-Joining", Icon: Briefcase, exact: true },
    { href: "/attendance/hr-record" as Route, label: "HR Record", Icon: ClipboardList, adminOnly: true },
    { href: "/agreements" as Route, label: "Agreements", Icon: FileSignature },
    { href: "/dossier" as Route, label: "Dossier", Icon: FolderLock },
    { href: "/policies" as Route, label: "Policies", Icon: ScrollText },
    { href: "/hr-docs" as Route, label: "Letters", Icon: Mail },
  ],
  groups: [],
};

/** The three stages awaiting their real build — a minimal back + self rail. */
const HR_PRE_INTERVIEW_NAV: WorkspaceNav = {
  top: [
    { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true },
    { href: "/hr/pre-interview" as Route, label: "Pre-Interview", Icon: UserSearch, exact: true },
  ],
  groups: [],
};
const HR_POST_INTERVIEW_NAV: WorkspaceNav = {
  top: [
    { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true },
    { href: "/hr/post-interview" as Route, label: "Post-Interview", Icon: ClipboardCheck, exact: true },
  ],
  groups: [],
};
const HR_PRE_JOINING_NAV: WorkspaceNav = {
  top: [
    { href: "/hr" as Route, label: "HR Home", Icon: Home, exact: true },
    { href: "/hr/pre-joining" as Route, label: "Pre-Joining", Icon: DoorOpen, exact: true },
  ],
  groups: [],
};

const HR_SECTION_NAV: Record<HrSection, WorkspaceNav> = {
  hub: HR_HUB_NAV,
  "pre-interview": HR_PRE_INTERVIEW_NAV,
  "post-interview": HR_POST_INTERVIEW_NAV,
  "pre-joining": HR_PRE_JOINING_NAV,
  "post-joining": HR_POST_JOINING_NAV,
};

/**
 * Which HR sub-module a path belongs to. The Post-Joining stage claims not only
 * `/hr/post-joining` but the reparented document routes it contains (dossier,
 * agreements, policies, hr-record, letters) so the rail stays put as you work.
 */
function hrSectionForPath(p: string): HrSection {
  if (
    p.startsWith("/hr/post-joining") ||
    p.startsWith("/dossier") ||
    p.startsWith("/agreements") ||
    p.startsWith("/policies") ||
    p.startsWith("/attendance/hr-record") ||
    p.startsWith("/letters") ||
    p.startsWith("/hr-docs")
  ) return "post-joining";
  if (p.startsWith("/hr/pre-interview")) return "pre-interview";
  if (p.startsWith("/hr/post-interview")) return "post-interview";
  if (p.startsWith("/hr/pre-joining")) return "pre-joining";
  return "hub";
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
      // Important Links — the curated directory (was the Marketing room's only
      // surface; Marketing retired as a workspace 2026-07).
      { href: "/index-hub" as Route, label: "Important Links", Icon: Compass },
    ],
    // No "More" dropdown — Documents already lives in the profile/avatar menu.
    groups: [],
  },
  employees: {
    top: [
      // Appraisal (mig 0146) — consolidates Performance (/pms) + 360 Review
      // (/pms/review) + Signals (/pms/signals) into ONE surface. The old pages
      // still exist (and /appraisal redirects to /pms while APPRAISAL_OFF=true
      // — see lib/pms/appraisal-flag.ts); they're just de-linked here.
      // Order (Sir, 2026-07): Attendance · DCC · Incentive · My Salary ·
      // Reimbursements · Appraisal. HR Record moved to the HR room; the admin
      // Salary module + Overtime moved to the Accounts room.
      {
        href: "/attendance" as Route,
        label: "Attendance",
        Icon: CalendarCheck,
        not: ["/attendance/dashboard", "/attendance/hr-record"],
      },
      { href: "/dcc" as Route, label: "DCC", Icon: Gauge },
      { href: "/incentive" as Route, label: "Incentive", Icon: Award },
      { href: "/my-salary" as Route, label: "My Salary", Icon: Wallet },
      { href: "/reimbursements" as Route, label: "Reimbursements", Icon: Receipt },
      { href: "/appraisal" as Route, label: "Appraisal", Icon: Target },
      // Queries & Notifications — re-parented here from the HR room (2026-07):
      // it's an employee-facing surface (raise a query, track company notices).
      { href: "/queries" as Route, label: "Queries & Notifications", Icon: BellRing },
    ],
    groups: [],
  },
  // HR — the lifecycle room. Its rail is CONTEXT-AWARE (see HR_SECTION_NAV +
  // hrSectionForPath): the front door shows the seven stages; entering a stage
  // swaps the rail to that stage's own sidebar. This entry is the hub default.
  hr: HR_HUB_NAV,
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
      // Payroll — the admin Salary module + Overtime, re-parented from Employees
      // (2026-07). Gated by the Accounts room + each page's own finance guard.
      { href: "/salary" as Route, label: "Salary", Icon: IndianRupee },
      { href: "/overtime" as Route, label: "Overtime", Icon: Timer, not: ["/overtime/dashboard"] },
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
    // One button per planning level — each opens a dedicated level page (the
    // weekly-goals BOARD design), locked to that level; the sidebar IS the
    // level navigator. The rituals sit below. Level pages need GOALS_CANVAS_ON
    // (they redirect to /goals when off).
    top: [
      // yearly rootView — the FY's YEAR objectives themselves (drill → Quarterly).
      { href: "/goals/yearly" as Route, label: "Yearly Goals", Icon: Trophy, canvasOnly: true },
      { href: "/goals/quarterly" as Route, label: "Quarterly Goals", Icon: Target, canvasOnly: true },
      { href: "/goals/monthly" as Route, label: "Monthly Goals", Icon: CalendarRange, canvasOnly: true },
      // Weekly = the REAL weekly board (WeeklyCascadeBoard over weekly_goals,
      // its own week nav). /goals/week is a permanent redirect alias to it.
      { href: "/goals/weekly" as Route, label: "Weekly Goals", Icon: CalendarCheck },
      { href: "/goals/plan" as Route, label: "Plan my Day", Icon: CalendarDays },
      // "Cascade" removed — the canvas is retired as the UI; the four level
      // pages (board design) + rituals below are the whole module. Cross-level
      // moves live in each card's "Move to…" drawer (the drag-to-sidebar
      // bridge left with the canvas).
      { href: "/weekly-goals/team" as Route, label: "Team Dashboard", Icon: Users },
      { href: "/goals/review" as Route, label: "Review", Icon: ClipboardList },
      { href: "/goals/approve" as Route, label: "Approve", Icon: CalendarRange },
      { href: "/goals/recycle-bin" as Route, label: "Recycle Bin", Icon: Trash2, adminOnly: true },
    ],
    groups: [],
  },
};

/** Admin PERSONAL goals space — the private set: five level pages + Recycle
 *  Bin, no team-accountability rituals. Same routes as professional; the pages
 *  render personal-scoped data based on the goals_space cookie. */
const GOALS_PERSONAL_NAV: WorkspaceNav = {
  top: [
    { href: "/goals/yearly" as Route, label: "Yearly Goals", Icon: Trophy },
    { href: "/goals/quarterly" as Route, label: "Quarterly Goals", Icon: Target },
    { href: "/goals/monthly" as Route, label: "Monthly Goals", Icon: CalendarRange },
    { href: "/goals/weekly" as Route, label: "Weekly Goals", Icon: CalendarCheck },
    { href: "/goals/plan" as Route, label: "Plan my Day", Icon: CalendarDays },
    { href: "/goals/recycle-bin" as Route, label: "Recycle Bin", Icon: Trash2, adminOnly: true },
  ],
  groups: [],
};

export function MainNav({
  activeTasks,
  isAdmin,
  variant,
  cookieWorkspace,
  goalsCanvasEnabled,
  goalsSpace,
}: Props) {
  const pathname = usePathname();

  // Path wins (keeps the bar in sync with the page you're actually on); the
  // cookie covers shared surfaces; WMS is the floor.
  const workspace: WorkspaceId =
    workspaceForPath(pathname) ?? cookieWorkspace ?? "wms";
  // In the admin's PERSONAL goals space, the nav is the private set: the level
  // pages + Recycle Bin (no Team / Review / Commit / Approve rituals). The HR
  // room is two-tier: the rail swaps per lifecycle stage (hrSectionForPath).
  const { top, groups } =
    workspace === "goals" && goalsSpace === "personal"
      ? GOALS_PERSONAL_NAV
      : workspace === "hr"
        ? HR_SECTION_NAV[hrSectionForPath(pathname)]
        : WORKSPACE_NAV[workspace];

  /** bug #11 — with GOALS_CANVAS_ON off the level pages server-redirect to
   *  /goals, so their pills read as dead: hide the canvas-only items and
   *  repoint the ones with a working legacy destination. The repointed item
   *  drops its `not` list (it must highlight on its own fallback path). */
  function resolveCanvasItems(items: NavItem[]): NavItem[] {
    if (goalsCanvasEnabled) return items;
    return items.flatMap((it) => {
      if (it.canvasOnly) return [];
      if (it.canvasOffHref) return [{ ...it, href: it.canvasOffHref, not: undefined }];
      return [it];
    });
  }

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    // Segment-aware: only match the exact path or a true sub-path, so
    // `/goals/week` never lights up on `/goals/weekly` (prefix collision).
    if (pathname !== item.href && !pathname.startsWith(item.href + "/")) return false;
    if (item.not?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
    return true;
  }

  function visible(items: NavItem[]): NavItem[] {
    return resolveCanvasItems(items).filter((it) => !it.adminOnly || isAdmin);
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
