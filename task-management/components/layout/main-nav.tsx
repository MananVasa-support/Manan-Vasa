"use client";
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
  Users,
  Wallet,
  LayoutGrid,
} from "lucide-react";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { MainNavPill } from "./main-nav-pill";
import { MainNavGroup } from "./main-nav-group";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
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

// First 7 stay top-level: the daily drivers + the admin Kanban board.
const TOP_LEVEL: NavItem[] = [
  { href: "/" as Route, label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/tasks/agenda" as Route, label: "My Day", Icon: CalendarDays },
  {
    href: "/tasks" as Route,
    label: "Tasks",
    Icon: ListTodo,
    not: ["/tasks/agenda", "/tasks/kanban"],
    countKey: "activeTasks",
  },
  {
    href: "/tasks/kanban" as Route,
    label: "Kanban",
    Icon: SquareKanban,
    adminOnly: true,
  },
  { href: "/projects" as Route, label: "Projects", Icon: FolderKanban },
  { href: "/weekly-goals" as Route, label: "Weekly Goals", Icon: Target },
  { href: "/daily-checklist" as Route, label: "Daily Checklist", Icon: ListChecks },
];

// The remaining destinations, folded into three dropdown groups. Reorder /
// rehome any item by moving it between these arrays — nothing else changes.
const GROUPS: NavGroup[] = [
  {
    label: "People",
    Icon: Users,
    items: [
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
      {
        href: "/salary" as Route,
        label: "Salary",
        Icon: IndianRupee,
        adminOnly: true,
      },
      { href: "/incentive" as Route, label: "Incentive", Icon: Award },
    ],
  },
  {
    label: "Finance",
    Icon: Wallet,
    items: [
      { href: "/outstanding" as Route, label: "Outstanding", Icon: IndianRupee },
      { href: "/reimbursements" as Route, label: "Reimbursements", Icon: Receipt },
    ],
  },
  {
    label: "Ecosystem",
    Icon: LayoutGrid,
    items: [
      { href: "/index-hub" as Route, label: "Index", Icon: Compass },
      {
        href: "/participant-breakthrough" as Route,
        label: "Breakthrough",
        Icon: Sparkles,
      },
      {
        href: "/record-reference" as Route,
        label: "References",
        Icon: BookMarked,
      },
    ],
  },
];

export function MainNav({ activeTasks, isAdmin, variant }: Props) {
  const pathname = usePathname();

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

  const topPills = visible(TOP_LEVEL);

  // Everything that isn't a top-level work pill folds into one sectioned "More"
  // dropdown (People / Finance / Ecosystem) — keeps the top bar to the 7 work
  // destinations so it never overflows.
  const moreSections = GROUPS.map((g) => ({
    label: g.label,
    items: visible(g.items).map((it) => ({
      href: it.href,
      label: it.label,
      Icon: it.Icon,
      active: isActive(it),
    })),
  })).filter((s) => s.items.length > 0);

  // ── Mobile drawer: flat, with a labelled section per group. Dropdowns are
  // awkward in a vertical list, so each group becomes a header + its pills.
  if (variant === "drawer") {
    return (
      <nav aria-label="Primary" className="flex flex-col gap-1.5 w-full">
        {topPills.map(renderPill)}
        {GROUPS.map((group) => {
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

  // ── Desktop: top-level pills · divider · group dropdowns.
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
