"use client";

import * as React from "react";
import {
  Search,
  X,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  MoveRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TeamPunchButton } from "@/components/attendance/team-punch-button";

/** One punch, pre-formatted on the server so the roster stays render-only. */
export interface RosterPunch {
  label: string; // "09:42"
  verify: "biometric" | "gps_only" | "none";
  distanceM: number | null;
}

export interface RosterRow {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  in: RosterPunch | null;
  out: RosterPunch | null;
  note: string;
}

/**
 * Premium team roster: searchable, checked-in progress header, status rows.
 * Quick-punch (super-admin, today only) keeps the existing TeamPunchButton.
 */
export function AttTeamRoster({
  rows,
  date,
  tz,
  canQuickPunch,
}: {
  rows: RosterRow[];
  date: string;
  tz: string;
  canQuickPunch: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  const present = rows.filter((r) => r.in).length;
  const pct = rows.length > 0 ? present / rows.length : 0;

  return (
    <div>
      {/* ── Progress + search header ── */}
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="tabular-nums text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {present}
            </span>
            <span className="text-[13.5px] font-semibold text-ink-subtle">
              of {rows.length} checked in
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full max-w-[300px] overflow-hidden rounded-full"
            style={{ background: "var(--color-surface-soft)" }}
            role="progressbar"
            aria-valuenow={present}
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-label={`${present} of ${rows.length} checked in`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.round(pct * 100)}%`,
                background: "linear-gradient(90deg, #22c55e, #15803d)",
              }}
            />
          </div>
        </div>

        <label
          className="relative flex h-10 w-[240px] items-center max-sm:w-full"
          aria-label="Search team members"
        >
          <Search
            size={15}
            strokeWidth={2.4}
            className="pointer-events-none absolute left-3 text-ink-subtle"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Search people…"
            className="h-full w-full rounded-xl border-2 border-hairline-strong bg-white pl-9 pr-8 text-[14px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-[var(--color-altus-red)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 inline-grid size-6 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </label>
      </div>

      {/* ── Roster rows ── */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[14.5px] text-ink-subtle">
          No one matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {filtered.map((r, i) => (
            <RosterItem
              key={r.employeeId}
              row={r}
              date={date}
              tz={tz}
              canQuickPunch={canQuickPunch}
              index={i}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RosterItem({
  row: r,
  date,
  tz,
  canQuickPunch,
  index,
}: {
  row: RosterRow;
  date: string;
  tz: string;
  canQuickPunch: boolean;
  index: number;
}) {
  const status = r.in && r.out
    ? { label: "Checked out", accent: "#334155", live: false }
    : r.in
      ? { label: "In office", accent: "#16a34a", live: true }
      : { label: "Absent", accent: "var(--color-altus-red)", live: false };

  return (
    <li
      className="wg-rise relative flex items-center gap-3 rounded-xl py-2.5 pl-5 pr-3 transition-colors hover:bg-surface-soft max-md:flex-wrap"
      style={{ animationDelay: `${Math.min(index, 10) * 20}ms` }}
    >
      {/* status stripe */}
      <span
        aria-hidden
        className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full"
        style={{
          background: `linear-gradient(180deg, ${status.accent}, color-mix(in srgb, ${status.accent} 45%, transparent))`,
        }}
      />

      <Avatar name={r.name} avatarUrl={r.avatarUrl} size={36} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-bold text-ink-strong">{r.name}</div>
        {r.note ? (
          <div className="truncate text-[12px] text-ink-subtle" title={r.note}>
            {r.note}
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold"
            style={{ color: status.accent }}
          >
            {status.live && (
              <span aria-hidden className="relative inline-flex size-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
                  style={{ background: status.accent }}
                />
                <span
                  className="relative inline-flex size-1.5 rounded-full"
                  style={{ background: status.accent }}
                />
              </span>
            )}
            {status.label}
          </div>
        )}
      </div>

      {/* in → out */}
      <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:justify-end">
        {r.in ? (
          <RosterChip kind="in" punch={r.in} />
        ) : canQuickPunch ? (
          <TeamPunchButton employeeId={r.employeeId} logDate={date} kind="in" name={r.name} tz={tz} />
        ) : (
          <span
            className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-bold"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
              color: "var(--color-altus-red)",
            }}
          >
            Absent
          </span>
        )}

        <MoveRight aria-hidden size={13} strokeWidth={2.2} className="text-ink-subtle max-sm:hidden" />

        {r.out ? (
          <RosterChip kind="out" punch={r.out} />
        ) : canQuickPunch && r.in ? (
          <TeamPunchButton employeeId={r.employeeId} logDate={date} kind="out" name={r.name} tz={tz} />
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold text-ink-subtle"
            style={{ background: "var(--color-surface-soft)" }}
          >
            <LogOut size={12} strokeWidth={2.4} /> —
          </span>
        )}
      </div>
    </li>
  );
}

function RosterChip({ kind, punch }: { kind: "in" | "out"; punch: RosterPunch }) {
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  const dist = punch.distanceM != null ? ` · ${Math.round(punch.distanceM)}m from office` : "";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}
    >
      <Icon size={12} strokeWidth={2.6} />
      {punch.label}
      {punch.verify === "biometric" ? (
        <span title={`Biometric-verified${dist}`} aria-label={`Biometric-verified${dist}`} className="inline-flex">
          <ShieldCheck size={12} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} />
        </span>
      ) : punch.verify === "gps_only" ? (
        <span title={`Location-verified${dist}`} aria-label={`Location-verified${dist}`} className="inline-flex">
          <MapPin size={12} strokeWidth={2.6} style={{ color: "var(--color-blue-deep)" }} />
        </span>
      ) : null}
    </span>
  );
}
