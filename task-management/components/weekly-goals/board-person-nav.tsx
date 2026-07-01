"use client";

import * as React from "react";
import { Search, X, Users, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

export interface PersonNavItem {
  id: string;
  name: string;
  role: string | null;
  goalCount: number;
  score: number;
  /** How many of their goals are still behind (<50%) — drives the alert dot. */
  behindCount: number;
}

/** Score → dot colour (attainment vs target: green ≥60, amber ≥30, else red). */
function scoreTone(score: number): { fg: string; bg: string } {
  if (score >= 60) return { fg: "var(--color-green-deep)", bg: "color-mix(in srgb, var(--color-green) 16%, transparent)" };
  if (score >= 30) return { fg: "var(--color-amber-deep)", bg: "color-mix(in srgb, var(--color-amber) 18%, transparent)" };
  return { fg: "var(--color-altus-red-deep)", bg: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)" };
}

/**
 * The sticky "jump to person" rail for the admin/manager whole-team board — the
 * cure for "I can't find the names." A searchable, avatar-led directory of every
 * person in the current view; each row shows their week score + goal count and a
 * red dot when they have goals still behind. Clicking a person scrolls the board
 * to their section (and expands it if collapsed) via the `onJump` callback the
 * board owns. Keyboard-first: type to filter, arrow/Tab through rows, Enter jumps.
 */
export function BoardPersonNav({
  people,
  activeId,
  onJump,
}: {
  people: PersonNavItem[];
  /** The person section currently in view (highlights the row); null = none. */
  activeId: string | null;
  onJump: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      query
        ? people.filter(
            (p) => p.name.toLowerCase().includes(query) || (p.role ?? "").toLowerCase().includes(query),
          )
        : people,
    [people, query],
  );

  return (
    <aside
      className="wg-rise hidden lg:flex lg:flex-col sticky top-4 max-h-[calc(100dvh-2rem)] w-[248px] shrink-0 rounded-2xl border overflow-hidden"
      style={{
        background: "var(--color-surface-card)",
        borderColor: "var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05), 0 12px 32px -24px rgba(15,23,42,0.25)",
        animationDelay: "40ms",
      }}
      aria-label="Jump to a team member"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-hairline">
        <span
          className="inline-flex size-7 items-center justify-center rounded-lg"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          <Users size={15} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink-strong leading-tight">Team</div>
          <div className="text-[11px] font-semibold text-ink-subtle tabular-nums leading-tight">
            {people.length} {people.length === 1 ? "person" : "people"}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="relative">
          <Search size={14} strokeWidth={2.4} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a person…"
            aria-label="Find a person in the team list"
            className={`w-full rounded-full border border-hairline bg-surface-soft pl-8 pr-8 py-1.5 text-[13px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear person search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-ink-subtle hover:text-ink-strong cursor-pointer ${FOCUS_RING}`}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] font-medium text-ink-subtle">
            No one matches “{q}”.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((p) => {
              const active = p.id === activeId;
              const tone = scoreTone(p.score);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onJump(p.id)}
                    aria-current={active ? "true" : undefined}
                    className={`group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors cursor-pointer ${FOCUS_RING}`}
                    style={{
                      background: active ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--color-surface-soft)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span className="relative shrink-0">
                      <Avatar name={p.name} size={32} />
                      {p.behindCount > 0 && (
                        <span
                          aria-hidden
                          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2"
                          style={{
                            background: "var(--color-altus-red)",
                            borderColor: "var(--color-surface-card)",
                          }}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13px] font-bold leading-tight"
                        style={{ color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
                      >
                        {p.name}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-ink-subtle leading-tight tabular-nums">
                        {p.goalCount} {p.goalCount === 1 ? "goal" : "goals"}
                        {p.role ? ` · ${p.role}` : ""}
                      </span>
                    </span>
                    <span
                      className="shrink-0 inline-flex min-w-[34px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {p.score}%
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-ink-subtle opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
