"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  FolderKanban,
  SquareKanban,
  Target,
  ListChecks,
  CalendarCheck,
  CalendarRange,
  Award,
  IndianRupee,
  Compass,
  Receipt,
  Sparkles,
  BookMarked,
  FileText,
  ShieldCheck,
  LayoutGrid,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { MainNavPill } from "./main-nav-pill";
import { MainNavGroup } from "./main-nav-group";
import {
  WORKSPACE_LABEL,
  workspaceForPath,
  type WorkspaceId,
} from "@/lib/workspaces";

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
      { href: "/" as Route, label: "Dashboard", Icon: LayoutDashboard, exact: true },
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
      { href: "/weekly-goals" as Route, label: "Weekly Goals", Icon: Target },
      { href: "/daily-checklist" as Route, label: "Daily Checklist", Icon: ListChecks },
    ],
    groups: [
      {
        label: "More",
        Icon: LayoutGrid,
        items: [{ href: "/documents" as Route, label: "Documents", Icon: FileText }],
      },
    ],
  },
  employees: {
    top: [
      {
        href: "/attendance" as Route,
        label: "Attendance",
        Icon: CalendarCheck,
        not: ["/attendance/dashboard"],
      },
      {
        href: "/attendance/dashboard" as Route,
        label: "Att Report",
        Icon: CalendarRange,
        adminOnly: true,
      },
      { href: "/salary" as Route, label: "Salary", Icon: IndianRupee, adminOnly: true },
      { href: "/incentive" as Route, label: "Incentive", Icon: Award },
      { href: "/reimbursements" as Route, label: "Reimbursements", Icon: Receipt },
    ],
    groups: [],
  },
  sales: {
    top: [
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
  training: { top: [], groups: [] },
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
        <WorkspaceSwitcher workspace={workspace} variant="drawer" />
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
      <WorkspaceSwitcher workspace={workspace} />
      <span aria-hidden className="nav-group-divider" />
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

/**
 * The "which room am I in / take me back to the hub" control. Doubles as the
 * workspace label so the user always knows their context. Links to /hub (the
 * switchboard) — the one place to hop rooms. Inline-styled to avoid touching
 * the shared globals.css nav rules.
 */
function WorkspaceSwitcher({
  workspace,
  variant,
}: {
  workspace: WorkspaceId;
  variant?: "drawer";
}) {
  const label = WORKSPACE_LABEL[workspace];
  return (
    <Link
      href="/hub"
      title="Switch workspace"
      aria-label={`${label} workspace — switch`}
      className={
        variant === "drawer"
          ? "flex items-center gap-2 rounded-xl px-3 py-2.5 font-extrabold"
          : "inline-flex items-center gap-1.5 rounded-full font-extrabold whitespace-nowrap"
      }
      style={
        variant === "drawer"
          ? {
              border: "2px solid var(--color-ink-strong)",
              color: "var(--color-ink-strong)",
              fontSize: 14,
            }
          : {
              padding: "6px 12px",
              fontSize: 13,
              letterSpacing: "0.01em",
              color: "#fff",
              background: "var(--color-ink-strong)",
              border: "1.5px solid var(--color-ink-strong)",
            }
      }
    >
      <LayoutGrid size={15} strokeWidth={2.6} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
