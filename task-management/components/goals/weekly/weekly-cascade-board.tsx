"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowRightLeft,
  Target,
  CheckCircle2,
  BadgeCheck,
  ClipboardList,
  Snowflake,
} from "lucide-react";
import { motion } from "motion/react";
import { fireToast } from "@/lib/toast";
import { carryAllUnfinishedForward } from "@/app/(app)/goals/weekly/actions";
import { CascadeGoalCard } from "./cascade-goal-card";
import { GoalTableView } from "@/components/goals/board/goal-table-view";
import { WEEKLY_TABLE_ACTIONS } from "@/components/goals/board/weekly-table-actions";
import { CommitDialog } from "@/components/goals/commit/commit-dialog";
import type { CommitMember } from "@/components/goals/commit/types";
import type { GoalDTO } from "@/components/goals/cascade/util";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption, RosterMember } from "./types";

/** Map a weekly cascade row onto the shared inline table's GoalDTO shape. */
function weeklyToGoalDTO(g: CascadeWeeklyGoal): GoalDTO {
  return {
    id: g.id,
    employeeId: g.employeeId,
    period: "week",
    periodKey: g.weekStart,
    parentGoalId: g.monthGoalId ?? null,
    position: g.position,
    area: g.area,
    title: (g.targetDone ?? "").trim() || (g.subject ?? "").trim() || "Untitled",
    uom: g.uom,
    targetQty: g.targetQty,
    actualQty: g.actualQty,
    targetAmount: g.targetAmount,
    actualAmount: g.actualAmount,
    notes: null,
    teamInvolved: g.teamInvolved?.map((m) => ({ employeeId: m.employeeId, name: m.name })) ?? null,
    teamDependencyPct: g.teamDependencyPct,
    pctDone: g.pctDone,
    acceptPct: g.acceptPct,
    reviewNotes: null,
    evidenceUrl: g.evidenceUrl,
    weight: g.weight,
    adopted: g.adopted,
    source: "manual",
    category: "goal",
    clonedFromId: g.carriedFromId ?? null,
    incentiveEnabled: false,
    incentiveAmount: null,
    incentiveKind: null,
    monthlyMasterRef: null,
    shareWithTeam: false,
  };
}

// Goals module identity (amber-gold). Read from the `--goals-accent` token when
// present, else fall back to the module-theme hex. Kept as CSS-var strings so the
// whole surface themes automatically if the root token lands.
const ACCENT = "var(--goals-accent, #E10600)";
const ACCENT_DEEP = "var(--goals-accent-deep, #A80400)";
const ACCENT_TINT = "color-mix(in srgb, var(--goals-accent, #E10600) 12%, transparent)";

/**
 * The Goals-workspace Weekly board (client shell). Week-nav labels weeks
 * **W1..W52** (FY calendar) with the Mon–Sun range; a person picker (admins /
 * managers) drills into a downline member; each row renders the cascade card
 * (monthly linkage + adopt + new fields + team + carry-forward). A "carry all
 * unfinished forward" action clones every incomplete goal into next week (the
 * opt-in auto-forward ritual).
 */
export function WeeklyCascadeBoard({
  me,
  weekStart,
  weekNo,
  weekLabel,
  isCurrentWeek,
  prevWeek,
  nextWeek,
  thisWeek,
  scopeEmp,
  canPickPerson,
  people,
  rows,
  roster,
  monthGoalOptions,
  areaOptions,
  measureOptions,
  typeOptions,
  customLookups,
  fyStartYear,
  commit,
}: {
  me: BoardMe;
  weekStart: string;
  weekNo: number;
  weekLabel: string;
  isCurrentWeek: boolean;
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  scopeEmp: string;
  canPickPerson: boolean;
  people: { id: string; name: string }[];
  rows: CascadeWeeklyGoal[];
  roster: RosterMember[];
  monthGoalOptions: MonthGoalOption[];
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  fyStartYear: number;
  /** Self "freeze next week" ritual, surfaced as a popup (null when not self). */
  commit: { member: CommitMember; nextWeekLabel: string; weekStart: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [commitOpen, setCommitOpen] = React.useState(false);

  function goWeek(w: string) {
    const params = new URLSearchParams();
    params.set("week", w);
    if (scopeEmp !== me.id) params.set("emp", scopeEmp);
    router.push(`/goals/weekly?${params.toString()}`);
  }

  function goPerson(emp: string) {
    const params = new URLSearchParams();
    params.set("week", weekStart);
    if (emp !== me.id) params.set("emp", emp);
    router.push(`/goals/weekly?${params.toString()}`);
  }

  const unfinishedCount = rows.filter((r) => r.adopted && (r.acceptPct ?? r.pctDone) < 100).length;

  function carryAll() {
    startTransition(async () => {
      const res = await carryAllUnfinishedForward({ employeeId: scopeEmp, weekStart });
      if (res.ok) {
        fireToast({
          message: res.carried === 0 ? "Nothing to carry — all done." : `Carried ${res.carried} goal(s) into next week.`,
          type: "success",
        });
        if (res.carried > 0) router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const adopted = rows.filter((r) => r.adopted);
  const dropped = rows.filter((r) => !r.adopted);

  // Ritual state IN CONTEXT — mirrors of committed_at / approved_by_manager_at
  // (the pages own the logic; these chips only read the stamps + deep-link).
  const committedCount = adopted.filter((r) => r.committed).length;
  const approvedCount = adopted.filter((r) => r.approvedByManager).length;

  return (
    <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
      {/* Header — module masthead: glossy amber icon tile + gradient eyebrow + display H1 */}
      <header className="mb-6 flex items-start gap-4 wg-rise">
        <span
          aria-hidden
          className="module-wordmark-icon relative hidden h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-section text-white sm:inline-flex"
          style={{
            background: `linear-gradient(150deg, color-mix(in srgb, #ffffff 22%, ${ACCENT}) 0%, ${ACCENT} 46%, ${ACCENT_DEEP} 100%)`,
            border: "1px solid color-mix(in srgb, var(--goals-accent-deep, #A80400) 55%, transparent)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 24px -10px color-mix(in srgb, var(--goals-accent, #E10600) 60%, transparent)",
          }}
        >
          <Target size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Target size={12} /> Weekly board
          </span>
          <h1
            className="mt-2 text-display-md text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.02em" }}
          >
            This week, laddered to the year
          </h1>
          <p className="mt-1.5 text-body font-medium text-ink-muted" style={{ maxWidth: "64ch" }}>
            Each weekly goal below carries from its monthly parent. Cross out what you&apos;re dropping,
            fill the target &amp; actuals, tag the team you depend on, and carry the unfinished forward.
          </p>
        </div>
      </header>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3 wg-rise" style={{ animationDelay: "0.06s" }}>
        <div
          className="flex items-center gap-1 rounded-pill border border-hairline bg-surface-card p-1"
          style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.6)" }}
        >
          <button
            type="button"
            onClick={() => goWeek(prevWeek)}
            aria-label="Previous week"
            className="wg-btn inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
          >
            <ChevronLeft size={17} />
          </button>
          <div className="flex items-center gap-2 px-2">
            <CalendarDays size={15} style={{ color: ACCENT }} />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  className="rounded-chip px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white"
                  style={{
                    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)",
                  }}
                >
                  W{weekNo}
                </span>
                <span className="text-[13px] font-bold text-ink-strong">{weekLabel}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => goWeek(nextWeek)}
            aria-label="Next week"
            className="wg-btn inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
          >
            <ChevronRight size={17} />
          </button>
        </div>

        {!isCurrentWeek && (
          <button
            type="button"
            onClick={() => goWeek(thisWeek)}
            className="wg-btn rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:border-hairline-strong hover:text-ink-strong"
          >
            Jump to this week
          </button>
        )}

        {canPickPerson && people.length > 0 && (
          <select
            value={scopeEmp}
            onChange={(e) => goPerson(e.target.value)}
            className="rounded-pill border border-hairline bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-strong outline-none transition-colors focus:border-hairline-strong"
            style={{ outlineColor: ACCENT }}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === me.id ? `${p.name} (me)` : p.name}
              </option>
            ))}
          </select>
        )}

        {/* Ritual state — Saturday commit / Monday approve, reachable in context.
            The chips read the existing stamps; the ritual pages keep the logic. */}
        {adopted.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Weekly ritual status">
            {commit ? (
              <button
                type="button"
                onClick={() => setCommitOpen(true)}
                title="Freeze next week (Saturday commit)"
                className="wg-btn inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-bold"
                style={
                  committedCount === adopted.length
                    ? { borderColor: "#15803d", color: "#166534", background: "rgba(21,128,61,0.10)" }
                    : { borderColor: ACCENT, color: ACCENT_DEEP, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }
                }
              >
                <Snowflake size={13} strokeWidth={2.4} />
                {committedCount === adopted.length ? "Next week frozen" : "Commit next week"}
              </button>
            ) : (
              <RitualChip
                href={"/goals/commit" as Route}
                icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
                label={`Committed ${committedCount}/${adopted.length}`}
                done={committedCount === adopted.length}
                title="Open the Saturday commit ritual"
              />
            )}
            {(me.isAdmin || canPickPerson) && (
              <RitualChip
                href={"/goals/approve" as Route}
                icon={<BadgeCheck size={13} strokeWidth={2.4} />}
                label={`Approved ${approvedCount}/${adopted.length}`}
                done={approvedCount === adopted.length}
                title="Open the Monday approve ritual"
              />
            )}
            {(me.isAdmin || canPickPerson) && (
              <RitualChip
                href={"/goals/review" as Route}
                icon={<ClipboardList size={13} strokeWidth={2.4} />}
                label="Review"
                done={false}
                title="Open the weekly review scorecard"
              />
            )}
          </div>
        )}

        {unfinishedCount > 0 && (
          <button
            type="button"
            onClick={carryAll}
            disabled={pending}
            className="wg-btn wg-sheen ml-auto inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              boxShadow: "0 8px 20px -10px color-mix(in srgb, var(--goals-accent, #E10600) 65%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <ArrowRightLeft size={13} />
            {pending ? "Carrying…" : `Carry ${unfinishedCount} unfinished → next week`}
          </button>
        )}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center"
        >
          <span
            className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: ACCENT_TINT, color: ACCENT_DEEP }}
          >
            <Target size={28} strokeWidth={2.2} />
          </span>
          <p className="text-[15px] font-semibold text-ink-strong">No weekly goals for W{weekNo}</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-ink-muted">
            Adopt a monthly goal from the cascade to generate this week&apos;s rows, or add one on the
            main weekly board.
          </p>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          <GoalTableView
            goals={adopted.map(weeklyToGoalDTO)}
            canWrite
            isAdmin={me.isAdmin}
            roster={roster}
            areaOptions={areaOptions}
            measureOptions={measureOptions}
            typeOptions={typeOptions}
            customLookups={customLookups}
            fyStartYear={fyStartYear}
            level="week"
            variant="weekly"
            actions={WEEKLY_TABLE_ACTIONS}
            detailKind="weekly"
          />

          {dropped.length > 0 && (
            <>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  Crossed out ({dropped.length})
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
              {dropped.map((g, i) => (
                <CascadeGoalCard
                  key={g.id}
                  goal={g}
                  me={me}
                  roster={roster}
                  monthGoalOptions={monthGoalOptions}
                  index={i}
                />
              ))}
            </>
          )}
        </div>
      )}

      {commit && (
        <CommitDialog
          open={commitOpen}
          onClose={() => setCommitOpen(false)}
          member={commit.member}
          nextWeekLabel={commit.nextWeekLabel}
          weekStart={commit.weekStart}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Ritual chip — a stamp-state pill that deep-links to its ritual page  */
/* (Commit / Approve / Review). Green when fully stamped, amber-tinted  */
/* while pending — no logic duplicated, the pages own the gates.        */
/* ------------------------------------------------------------------ */

function RitualChip({
  href,
  icon,
  label,
  done,
  title,
}: {
  href: Route;
  icon: React.ReactNode;
  label: string;
  done: boolean;
  title: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
      style={
        done
          ? {
              background: "rgba(21,128,61,0.10)",
              borderColor: "rgba(21,128,61,0.35)",
              color: "#15803d",
            }
          : {
              background: ACCENT_TINT,
              borderColor: "color-mix(in srgb, var(--goals-accent, #E10600) 35%, transparent)",
              color: ACCENT_DEEP,
            }
      }
    >
      {icon}
      {label}
    </Link>
  );
}
