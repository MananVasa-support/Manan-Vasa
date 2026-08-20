"use client";
import { Network } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";
import { DEPARTMENTS } from "@/db/enums";

/**
 * Team scope — "My Team" plus the department groups.
 *
 * MY TEAM IS THE FIRST OPTION on purpose: it is the one selection whose members
 * cannot be listed here, because it is resolved from the org chart server-side
 * (the viewer plus everyone beneath them at any depth, not just direct
 * reports). Everything below it is a static department.
 *
 * This is NOT a duplicate of the Department filter beside it, though they share
 * option labels. Department narrows by the DOER's department; Team matches a
 * task whose doer OR INITIATOR is in scope, so it catches work a team handed
 * out as well as work it is doing. Setting both means the intersection.
 */
export const MY_TEAM = "mine";

const OPTIONS = [
  { value: MY_TEAM, label: "My Team (me + my reports)" },
  ...DEPARTMENTS.map((d) => ({ value: d as string, label: d as string })),
];

export function TeamFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <MultiSelect
      options={OPTIONS}
      selected={selected}
      onChange={onChange}
      renderTrigger={({ selectedLabels }) => (
        <FilterPill
          icon={<Network size={16} strokeWidth={2} />}
          name="Team"
          value={summarizeSelection(selectedLabels, "All Teams")}
          tint="#0d9488"
          active={selected.length > 0}
        />
      )}
    />
  );
}
