"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, Archive, Inbox } from "lucide-react";
import type { Route } from "next";
import { MainNavPill } from "./main-nav-pill";

interface Props {
  activeTasks: number;
  archivedTasks: number;
  inboxUnread: number;
}

export function MainNav({
  activeTasks,
  archivedTasks,
  inboxUnread,
}: Props) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-2 max-md:gap-1.5"
    >
      <MainNavPill
        href={"/" as Route}
        label="Dashboard"
        Icon={LayoutDashboard}
        active={isActive("/")}
      />
      <MainNavPill
        href={"/tasks" as Route}
        label="Tasks"
        Icon={ListTodo}
        active={isActive("/tasks")}
        count={activeTasks}
      />
      <MainNavPill
        href={"/archived" as Route}
        label="Archived"
        Icon={Archive}
        active={isActive("/archived")}
        count={archivedTasks}
      />
      <MainNavPill
        href={"/inbox" as Route}
        label="Inbox"
        Icon={Inbox}
        active={isActive("/inbox")}
        badge={inboxUnread > 0 ? inboxUnread : undefined}
      />
    </nav>
  );
}
