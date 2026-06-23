import type { Route } from "next";
import {
  LayoutDashboard,
  ListTodo,
  Columns3,
  FolderKanban,
  Target,
  CheckSquare,
  UserCircle,
  Inbox,
  Archive,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "Dashboard", Icon: LayoutDashboard, href: "/" as Route },
  { label: "Tasks", Icon: ListTodo, href: "/tasks" as Route },
  { label: "Kanban", Icon: Columns3, href: "/tasks/kanban" as Route },
  { label: "Projects", Icon: FolderKanban, href: "/projects" as Route },
  { label: "Weekly Goals", Icon: Target, href: "/weekly-goals" as Route },
  { label: "Daily Checklist", Icon: CheckSquare, href: "/daily-checklist" as Route },
  { label: "Profile", Icon: UserCircle, href: "/profile" as Route },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Archived", Icon: Archive, href: "/archived" as Route },
  { label: "Documents", Icon: FileText, href: "/documents" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function WmsHubPage() {
  return (
    <ModuleHub
      index="02"
      title="WMS"
      blurb="The work dashboard — tasks, goals and the daily loop, all in one room."
      tone="mh-ink"
      tiles={TILES}
    />
  );
}
