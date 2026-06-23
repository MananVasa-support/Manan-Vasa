import type { Route } from "next";
import {
  Gauge,
  Fingerprint,
  BarChart3,
  CalendarOff,
  Wallet,
  Award,
  Receipt,
  ClipboardList,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "PMS – Performance Mgmt", Icon: Gauge },
  { label: "Attendance", Icon: Fingerprint, href: "/attendance" as Route },
  { label: "Attendance Report", Icon: BarChart3, href: "/attendance/dashboard" as Route },
  { label: "Leave", Icon: CalendarOff, href: "/attendance/leave" as Route },
  { label: "Salary", Icon: Wallet, href: "/salary" as Route },
  { label: "Incentives", Icon: Award, href: "/incentive" as Route },
  { label: "Reimbursements", Icon: Receipt, href: "/reimbursements" as Route },
  { label: "Employee's DCC", Icon: ClipboardList },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function EmployeesHubPage() {
  return (
    <ModuleHub
      index="03"
      title="Employees"
      blurb="Attendance, leave, salary and the team roster — everyone's HR room."
      tone="mh-blue"
      tiles={TILES}
    />
  );
}
