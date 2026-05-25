"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, Archive, Inbox, CalendarDays, FolderKanban, FileText } from "lucide-react";
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
      className="flex items-center gap-2.5 w-full max-md:gap-1.5"
    >
      <MainNavPill
        href={"/" as Route}
        label="Dashboard"
        Icon={LayoutDashboard}
        active={isActive("/")}
        grow
      />
      <MainNavPill
        href={"/tasks/agenda" as Route}
        label="My Day"
        Icon={CalendarDays}
        active={isActive("/tasks/agenda")}
        grow
      />
      <MainNavPill
        href={"/tasks" as Route}
        label="Tasks"
        Icon={ListTodo}
        active={isActive("/tasks") && !pathname.startsWith("/tasks/agenda")}
        count={activeTasks}
        grow
      />
      <MainNavPill
        href={"/projects" as Route}
        label="Projects"
        Icon={FolderKanban}
        active={isActive("/projects")}
        grow
      />
      <MainNavPill
        href={"/documents" as Route}
        label="Docs"
        Icon={FileText}
        active={isActive("/documents")}
        grow
      />
      <MainNavPill
        href={"/archived" as Route}
        label="Archived"
        Icon={Archive}
        active={isActive("/archived")}
        count={archivedTasks}
        grow
      />
      <MainNavPill
        href={"/inbox" as Route}
        label="Inbox"
        Icon={Inbox}
        active={isActive("/inbox")}
        badge={inboxUnread > 0 ? inboxUnread : undefined}
        grow
      />
    </nav>
  );
}
