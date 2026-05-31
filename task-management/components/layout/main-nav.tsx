"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, Archive, Inbox, CalendarDays, FolderKanban, FileText, SquareKanban } from "lucide-react";
import type { Route } from "next";
import { MainNavPill } from "./main-nav-pill";

interface Props {
  activeTasks: number;
  archivedTasks: number;
  inboxUnread: number;
  variant?: "drawer";
}

export function MainNav({
  activeTasks,
  archivedTasks,
  inboxUnread,
  variant,
}: Props) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className={
        variant === "drawer"
          ? "flex flex-col gap-1.5 w-full"
          : "flex items-center gap-1.5 2xl:gap-2 max-md:gap-1.5"
      }
    >
      <MainNavPill
        href={"/" as Route}
        label="Dashboard"
        Icon={LayoutDashboard}
        active={isActive("/")}
        variant={variant}      />
      <MainNavPill
        href={"/tasks/agenda" as Route}
        label="My Day"
        Icon={CalendarDays}
        active={isActive("/tasks/agenda")}
        variant={variant}      />
      <MainNavPill
        href={"/tasks" as Route}
        label="Tasks"
        Icon={ListTodo}
        active={
          isActive("/tasks") &&
          !pathname.startsWith("/tasks/agenda") &&
          !pathname.startsWith("/tasks/kanban")
        }
        count={activeTasks}
        variant={variant}      />
      <MainNavPill
        href={"/tasks/kanban" as Route}
        label="Kanban"
        Icon={SquareKanban}
        active={pathname.startsWith("/tasks/kanban")}
        variant={variant}      />
      <MainNavPill
        href={"/projects" as Route}
        label="Projects"
        Icon={FolderKanban}
        active={isActive("/projects")}
        variant={variant}      />
      <MainNavPill
        href={"/documents" as Route}
        label="Docs"
        Icon={FileText}
        active={isActive("/documents")}
        variant={variant}      />
      <MainNavPill
        href={"/archived" as Route}
        label="Archived"
        Icon={Archive}
        active={isActive("/archived")}
        count={archivedTasks}
        variant={variant}      />
      <MainNavPill
        href={"/inbox" as Route}
        label="Inbox"
        Icon={Inbox}
        active={isActive("/inbox")}
        badge={inboxUnread > 0 ? inboxUnread : undefined}
        variant={variant}      />
    </nav>
  );
}
