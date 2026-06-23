import type { Route } from "next";
import { Hash, Inbox, ShieldCheck } from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "Index", Icon: Hash, href: "/index-hub" as Route },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function MarketingHubPage() {
  return (
    <ModuleHub
      index="05"
      title="Marketing"
      blurb="The index and your inbox today — campaigns, reach and brand tools land here next."
      tone="mh-amber"
      tiles={TILES}
    />
  );
}
