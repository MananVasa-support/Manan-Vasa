import type { Route } from "next";
import {
  HandHeart,
  Users,
  IndianRupee,
  Sparkles,
  BookMarked,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "People's Gives", Icon: HandHeart },
  { label: "Ambassadors", Icon: Users },
  { label: "Outstanding Collection", Icon: IndianRupee, href: "/outstanding" as Route },
  { label: "Breakthrough", Icon: Sparkles, href: "/participant-breakthrough" as Route },
  { label: "References", Icon: BookMarked, href: "/record-reference" as Route },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function SalesHubPage() {
  return (
    <ModuleHub
      index="04"
      title="Sales"
      blurb="Collections, references and breakthroughs — with more pipeline tools landing soon."
      tone="mh-green"
      tiles={TILES}
    />
  );
}
