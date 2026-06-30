import {
  ShieldCheck,
  LayoutGrid,
  Users,
  TrendingUp,
  Megaphone,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * THE module identity + color system (meeting 2026-06-29: "every module has a
 * specific color so we know which module we're in"). One source of truth for
 * each workspace's accent, deep accent, hero photo, icon, label and tagline —
 * consumed by the Hub front door AND by each module's own bespoke chrome, so a
 * module is instantly recognizable by color everywhere inside it.
 *
 * WMS keeps the Altus red identity (its existing look is unchanged). Every other
 * module gets a distinct, accessible accent.
 */
export interface ModuleTheme {
  id: WorkspaceId;
  label: string;
  tagline: string;
  href: Route;
  Icon: LucideIcon;
  /** Primary accent (buttons, active states, headers). */
  accent: string;
  /** Darker accent for text-on-tint + gradients. */
  accentDeep: string;
  /** Hero photo for the Hub card (public/hub/*). WMS has none — the founder is
   *  designing its logo treatment, so its card stays a branded logo card. */
  image: string | null;
}

export const MODULE_THEME: Record<WorkspaceId, ModuleTheme> = {
  wms: {
    id: "wms",
    label: "WMS",
    tagline: "The work dashboard — tasks, goals & the daily loop.",
    href: "/ws/wms" as Route,
    Icon: LayoutGrid,
    accent: "#E10600",
    accentDeep: "#A80400",
    image: null,
  },
  admin: {
    id: "admin",
    label: "Admin",
    tagline: "Accounts, compliance & the control room.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3730a3",
    image: "/hub/admin.jpg",
  },
  employees: {
    id: "employees",
    label: "Employees",
    tagline: "Attendance, leave, salary & the team roster.",
    href: "/ws/employees" as Route,
    Icon: Users,
    accent: "#16a34a",
    accentDeep: "#15803d",
    image: "/hub/employees.jpg",
  },
  sales: {
    id: "sales",
    label: "Sales",
    tagline: "Collections, references & breakthroughs.",
    href: "/ws/sales" as Route,
    Icon: TrendingUp,
    accent: "#7c3aed",
    accentDeep: "#5b21b6",
    image: "/hub/sales.jpg",
  },
  marketing: {
    id: "marketing",
    label: "Marketing",
    tagline: "Campaigns, reach & lead generation.",
    href: "/ws/marketing" as Route,
    Icon: Megaphone,
    accent: "#ea7a17",
    accentDeep: "#c2620f",
    image: "/hub/marketing.jpg",
  },
  training: {
    id: "training",
    label: "Training",
    tagline: "Material library, tests, induction & feedback.",
    href: "/ws/training" as Route,
    Icon: GraduationCap,
    accent: "#2563eb",
    accentDeep: "#1d4ed8",
    image: "/hub/training.jpg",
  },
  // Accounts is no longer a top-level hub card — it now lives INSIDE the Admin
  // module (which opens to it). It inherits Admin's indigo identity so the two
  // read as one module. Kept here so MODULE_THEME covers every WorkspaceId.
  accounts: {
    id: "accounts",
    label: "Accounts",
    tagline: "Compliance, trackers & the accountant's checklist.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
    accent: "#4f46e5",
    accentDeep: "#3730a3",
    image: null,
  },
};

/** Hub display order. */
export const MODULE_ORDER: WorkspaceId[] = [
  "wms",
  "admin",
  "employees",
  "sales",
  "marketing",
  "training",
];
