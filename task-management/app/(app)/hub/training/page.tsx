import type { Route } from "next";
import {
  School,
  Brain,
  DoorOpen,
  MessageSquare,
  FileQuestion,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { ModuleHub, type Tile } from "@/components/hub/module-hub";

const TILES: Tile[] = [
  { label: "Training Centre", Icon: School },
  { label: "Attitude / Behaviour / Skill Development + Assessment", Icon: Brain },
  { label: "Induction Training", Icon: DoorOpen },
  { label: "Feedback in WMS", Icon: MessageSquare },
  { label: "Tests – MCQ / Fill-in-blanks", Icon: FileQuestion },
  { label: "Inbox", Icon: Inbox, href: "/inbox" as Route },
  { label: "Admin Panel", Icon: ShieldCheck, href: "/admin" as Route },
];

export default function TrainingHubPage() {
  return (
    <ModuleHub
      index="06"
      title="Training"
      blurb="Onboarding, courses, assessments and tests — this room is being built out now."
      tone="mh-purple"
      tiles={TILES}
    />
  );
}
