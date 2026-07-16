"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { RELIGIONS, RELIGION_LABELS } from "@/db/enums";
import type { ReligionCode } from "@/lib/monthly-events/types";
import { setEmployeeReligion } from "@/app/(app)/events/holidays/actions";

export interface EmployeeReligionRow {
  id: string;
  name: string;
  religion: ReligionCode | null;
}

const UNSET = "__unset__";
const OPTIONS = [
  { value: UNSET, label: "— Not set —" },
  ...RELIGIONS.map((r) => ({ value: r, label: RELIGION_LABELS[r] })),
];

/**
 * Compact admin control to set each employee's religion — drives the
 * personalised holiday list (design §7). One Select per employee; saves inline.
 */
export function ReligionEditor({ employees }: { employees: EmployeeReligionRow[] }) {
  const [rows, setRows] = React.useState(employees);
  const [query, setQuery] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const filtered = query.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  function save(id: string, raw: string) {
    const religion = raw === UNSET ? null : (raw as ReligionCode);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, religion } : r)));
    setSavingId(id);
    startTransition(async () => {
      const res = await setEmployeeReligion({ employeeId: id, religion });
      setSavingId(null);
      if (!res.ok) {
        setRows(prev);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Religion updated." });
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 17,
            }}
          >
            Employee religion
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Sets each person&apos;s personalised holiday list. Blank = base
            (Everyone) set only.
          </p>
        </div>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 w-52 rounded-chip border border-hairline bg-surface-card pl-8 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </div>
      </div>

      <div className="max-h-[26rem] divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-[14px] text-ink-soft">
            No employees match.
          </p>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="truncate text-[14.5px] font-medium text-ink-strong">
                {r.name}
                {savingId === r.id && (
                  <span className="ml-2 text-[12px] text-ink-soft">saving…</span>
                )}
              </span>
              <div className="w-44 shrink-0">
                <Select
                  options={OPTIONS}
                  value={r.religion ?? UNSET}
                  onValueChange={(v) => save(r.id, v)}
                  searchable={false}
                  className="h-9 text-[14px]"
                  ariaLabel={`Religion for ${r.name}`}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
