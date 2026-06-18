"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, CalendarDays, FolderKanban, SquareKanban, Target, CalendarCheck, CalendarRange, Award, IndianRupee, Compass, Receipt, Sparkles, BookMarked } from "lucide-react";
import type { Route } from "next";
import { MainNavPill } from "./main-nav-pill";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
}

export function MainNav({ activeTasks, isAdmin, variant }: Props) {
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
          : "flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
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
      {/* Kanban is an admin-only board — hidden from doers. */}
      {isAdmin && (
        <MainNavPill
          href={"/tasks/kanban" as Route}
          label="Kanban"
          Icon={SquareKanban}
          active={pathname.startsWith("/tasks/kanban")}
          variant={variant}
        />
      )}
      <MainNavPill
        href={"/projects" as Route}
        label="Projects"
        Icon={FolderKanban}
        active={isActive("/projects")}
        variant={variant}      />
      {/* Weekly Goals (coming soon) · Attendance · Incentive · Outstanding.
          Documents / Archived / Inbox moved into the user menu. */}
      <MainNavPill
        href={"/weekly-goals" as Route}
        label="Weekly Goals"
        Icon={Target}
        active={isActive("/weekly-goals")}
        variant={variant}      />
      <MainNavPill
        href={"/attendance" as Route}
        label="Attendance"
        Icon={CalendarCheck}
        active={
          isActive("/attendance") &&
          !pathname.startsWith("/attendance/dashboard")
        }
        variant={variant}      />
      {/* Admin-only monthly attendance report (Task A6). */}
      {isAdmin && (
        <MainNavPill
          href={"/attendance/dashboard" as Route}
          label="Att Report"
          Icon={CalendarRange}
          active={pathname.startsWith("/attendance/dashboard")}
          variant={variant}
        />
      )}
      {/* Admin-only salary report (Phase C). */}
      {isAdmin && (
        <MainNavPill
          href={"/salary" as Route}
          label="Salary"
          Icon={IndianRupee}
          active={isActive("/salary")}
          variant={variant}
        />
      )}
      <MainNavPill
        href={"/incentive" as Route}
        label="Incentive"
        Icon={Award}
        active={isActive("/incentive")}
        variant={variant}      />
      <MainNavPill
        href={"/outstanding" as Route}
        label="Outstanding"
        Icon={IndianRupee}
        active={isActive("/outstanding")}
        variant={variant}      />
      {/* Ecosystem Index + the dynamic-form modules (ported from the
          Ecosystem WMS). Index is a link hub; the three form modules are
          request/approval flows. */}
      <MainNavPill
        href={"/index" as Route}
        label="Index"
        Icon={Compass}
        active={isActive("/index")}
        variant={variant}      />
      <MainNavPill
        href={"/reimbursements" as Route}
        label="Reimbursements"
        Icon={Receipt}
        active={isActive("/reimbursements")}
        variant={variant}      />
      <MainNavPill
        href={"/participant-breakthrough" as Route}
        label="Breakthrough"
        Icon={Sparkles}
        active={isActive("/participant-breakthrough")}
        variant={variant}      />
      <MainNavPill
        href={"/record-reference" as Route}
        label="References"
        Icon={BookMarked}
        active={isActive("/record-reference")}
        variant={variant}      />
    </nav>
  );
}
