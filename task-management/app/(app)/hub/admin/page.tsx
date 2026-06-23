import type { Route } from "next";
import {
  Wrench,
  Calculator,
  ClipboardCheck,
  CalendarCheck,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "Essential Service", Icon: Wrench },
  { label: "Accountant's DCC", Icon: Calculator },
  { label: "Accountant Daily Checklist", Icon: ClipboardCheck },
  { label: "Weekly Checklist", Icon: CalendarCheck },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function AdminHubPage() {
  return (
    <ModuleHub
      index="01"
      title="Admin"
      blurb="People, settings, payroll and the control room — plus checklists landing soon."
      tone="mh-red"
      tiles={TILES}
    />
  );
}
