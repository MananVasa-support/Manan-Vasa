"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  BarChart3,
  Trash2,
  Loader2,
  CheckCircle2,
  Flag,
  Target,
} from "lucide-react";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/db/enums";
import { MultiSelect } from "@/components/ui/multi-select";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalCard } from "@/components/weekly-goals/goal-card";
import { GoalQuickAdd } from "@/components/weekly-goals/goal-quick-add";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { weeklyScore } from "@/lib/weekly-goals/effective";
import { deleteWeeklyGoal } from "@/app/(app)/weekly-goals/actions";
import { fireToast } from "@/lib/toast";

/* Editorial design tokens (scoped to this board — a warm cream canvas with
 * near-black warm ink; Altus red used only as the goal-card accent + score
 * ring). Kept local so the rest of the app's cooler palette is untouched. */
const EDITORIAL = {
  canvas: "#F6F3EC",
  surface: "#FFFFFF",
  inkStrong: "#171411",
  inkSoft: "#6B6560",
  inkSubtle: "#9A938B",
  hairline: "rgba(23,20,17,0.08)",
} as const;
const SERIF = "var(--font-editorial), Georgia, serif";

/** Up-to-two-letter initials for the avatar, from the member's display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface Props {
  me: { id: string; isAdmin: boolean; canReview: boolean };
  weekStart: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  scopeEmp: string;
  /** True for admins AND managers (anyone who can pick a person / see a team). */
  canPickTeam: boolean;
  /** "all" for admins (manage anyone); otherwise the set of ids the user may
   *  edit (self + downline for managers, just self for everyone else). */
  manageableIds: "all" | string[];
  employees: { id: string; name: string }[];
  /** Member id → role/designation label (e.g. "Head of Tech"); absent = no badge. */
  roleById?: Record<string, string>;
  rows: BoardGoal[];
  statusDisplay: StatusDisplayMap;
  clientOptions: string[];
  subjectOptions: string[];
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  focusId: string | null;
}

export function WeeklyGoalsBoard(props: Props) {
  const router = useRouter();
  const showingAll = props.scopeEmp === "all";

  // Whether the signed-in user may edit a given goal. Admins ("all") can edit
  // anyone; managers can edit self + downline; everyone else only their own
  // (self is always in manageableIds for non-admins, so owners keep edit).
  const canEditGoal = React.useCallback(
    (employeeId: string) =>
      props.manageableIds === "all" || props.manageableIds.includes(employeeId),
    [props.manageableIds],
  );

  // Client-side filters (priority) + a reviewer-only "show archived" toggle.
  const [priorityFilter, setPriorityFilter] = React.useState<string[]>([]);
  const [showArchived, setShowArchived] = React.useState(false);

  // Shared two-step delete dialog state (one dialog for every card).
  const [deleteTarget, setDeleteTarget] = React.useState<BoardGoal | null>(null);

  function go(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/weekly-goals?${sp.toString()}` as Route);
  }

  const visible = React.useMemo(() => {
    return props.rows.filter((r) => {
      if (!showArchived && r.archived) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(r.priority)) return false;
      return true;
    });
  }, [props.rows, showArchived, priorityFilter]);

  // Group by employee for the admin "all" overview.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { name: string; rows: BoardGoal[] }>();
    for (const r of visible) {
      if (!map.has(r.employeeId)) map.set(r.employeeId, { name: r.employeeName, rows: [] });
      map.get(r.employeeId)!.rows.push(r);
    }
    return [...map.entries()];
  }, [visible]);

  const totalCount = visible.length;
  const activeVisible = React.useMemo(() => visible.filter((r) => !r.archived), [visible]);
  const overallScore = weeklyScore(activeVisible);

  // Premium stat strip + the mandatory-5 enforcement. Effective % is the
  // manager's accepted number once set, else the doer's self-report.
  const effPct = (r: BoardGoal) => (r.acceptPct ?? r.pctDone);
  const doneCount = activeVisible.filter((r) => effPct(r) >= 100).length;
  const pendingCount = activeVisible.length - doneCount;
  const weightTotal = activeVisible.reduce((s, r) => s + (r.weight || 0), 0);
  // Min-5 rule applies per person; only meaningful when one person is scoped.
  const TARGET_GOALS = 5;
  const scopedCount = showingAll ? null : activeVisible.length;
  const shortBy = scopedCount == null ? 0 : Math.max(0, TARGET_GOALS - scopedCount);

  // Props shared by every card (the card-specific srNo / goal / canEdit /
  // autoFocus are passed per-card at the render site).
  const sharedCardProps = {
    canReview: props.me.canReview,
    isAdmin: props.me.isAdmin,
    statusDisplay: props.statusDisplay,
    clientOptions: props.clientOptions,
    subjectOptions: props.subjectOptions,
    onRequestDelete: setDeleteTarget,
  };

  return (
    <main
      className="min-h-screen"
      style={{ background: EDITORIAL.canvas, color: EDITORIAL.inkStrong }}
    >
      <div className="mx-auto max-w-[1280px] px-12 max-md:px-4 pt-8 pb-24">
      {/* ── HERO BAND ───────────────────────────────────────────────── */}
      <section
        className="wg-rise relative overflow-hidden rounded-[28px] px-9 py-8 max-md:px-5 max-md:py-6 mb-5"
        style={{
          background:
            "radial-gradient(130% 150% at 88% -10%, rgba(225,6,0,0.34) 0%, transparent 55%), linear-gradient(135deg, #1C1511 0%, #0E0B09 100%)",
          boxShadow: "0 30px 60px -28px rgba(14,11,9,0.55)",
        }}
      >
        {/* faint ruled texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 76px)",
          }}
        />
        <div className="relative flex items-center justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <div
              className="text-[11px] font-black uppercase tracking-[0.22em]"
              style={{ color: "rgba(251,191,36,0.92)" }}
            >
              Accountability · {props.weekLabel}
            </div>
            <h1
              className="mt-2"
              style={{
                fontFamily: SERIF,
                fontWeight: 800,
                color: "#F7F4ED",
                fontSize: "clamp(40px, 5vw, 64px)",
                letterSpacing: "-0.025em",
                lineHeight: 0.98,
              }}
            >
              Weekly Goals
            </h1>
            <p
              className="mt-3 max-w-[46ch] font-medium"
              style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(247,244,237,0.66)" }}
            >
              The handful of priorities each person commits to — weighted, scored,
              and reviewed. Five is the floor.
            </p>
            <div className="mt-5 flex items-center gap-2.5 flex-wrap">
              <Link
                href={"/weekly-goals?view=dashboard" as Route}
                className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14.5px] font-bold text-white cursor-pointer"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  boxShadow: "0 10px 24px -8px rgba(225, 6, 0, 0.7)",
                }}
              >
                <BarChart3 size={16} strokeWidth={2.4} />
                Performance Dashboard
              </Link>
              <span className="[&_button]:!border-white/15 [&_button]:!bg-white/[0.06] [&_button]:!text-white/90">
                <WeeklyGoalsImport
                  employeeId={props.scopeEmp}
                  weekStart={props.weekStart}
                  weekLabel={props.weekLabel}
                  isAdmin={props.me.isAdmin}
                />
              </span>
            </div>
          </div>

          {/* Signature: the weekly-score ring (gold glow when it clears target) */}
          {totalCount > 0 && (
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`inline-flex items-center justify-center rounded-full p-2 ${overallScore >= 60 ? "wg-ring-glow" : ""}`}
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(6px)" }}
              >
                <ScoreRing
                  value={overallScore}
                  size={132}
                  label={`${overallScore}% ${showingAll ? "team " : ""}weekly score`}
                />
              </div>
              <span
                className="mt-3 text-[11px] font-black uppercase tracking-[0.16em]"
                style={{ color: "rgba(247,244,237,0.55)" }}
              >
                {showingAll ? "Team" : "Weekly"} score · {doneCount}/{totalCount} done
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── STAT STRIP ──────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <StatCard i={0} label="Goals" value={String(totalCount)} tone="slate" hint={showingAll ? `${grouped.length} people` : "this week"} />
        <StatCard i={1} label="Weekly score" value={`${overallScore}%`} tone="red" hint="weighted average" />
        <StatCard i={2} label="Done" value={String(doneCount)} tone="green" hint={`${pendingCount} pending`} />
        <StatCard
          i={3}
          label="Total weight"
          value={`${weightTotal}`}
          tone={weightTotal === 100 || showingAll ? "amber" : "red"}
          hint={showingAll ? "across team" : weightTotal === 100 ? "balanced · 100" : `must total 100`}
        />
      </div>

      {/* ── MANDATORY-5 TRACKER (single-person scope only) ──────────── */}
      {scopedCount != null && (
        <Min5Tracker count={scopedCount} target={TARGET_GOALS} shortBy={shortBy} />
      )}

      {/* Controls: week nav + employee scope + filters --------------- */}
      <div
        className="wg-rise mb-5 flex items-center gap-3 flex-wrap rounded-2xl border border-hairline bg-surface-card px-4 py-3"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", animationDelay: "60ms" }}
      >
        <div className="inline-flex items-center rounded-full border border-hairline bg-surface-card overflow-hidden">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => go({ week: props.prevWeek, emp: props.scopeEmp })}
            className="wg-btn cursor-pointer px-3 py-2 hover:bg-black/[0.05]"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-4 py-2 inline-flex items-center gap-2 font-bold text-ink-strong text-[15px] tabular-nums border-x border-hairline">
            <CalendarDays size={16} className="text-ink-muted" />
            {props.weekLabel}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => go({ week: props.nextWeek, emp: props.scopeEmp })}
            className="wg-btn cursor-pointer px-3 py-2 hover:bg-black/[0.05]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!props.isCurrentWeek && (
          <button
            type="button"
            onClick={() => go({ week: props.thisWeek, emp: props.scopeEmp })}
            className="wg-btn cursor-pointer px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-soft hover:text-ink-strong"
          >
            This week
          </button>
        )}

        <div className="min-w-[200px]">
          <MultiSelect
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            selected={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="All priorities"
          />
        </div>

        {props.me.canReview && (
          <button
            type="button"
            role="switch"
            aria-checked={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="wg-btn cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px] font-bold transition-colors"
            style={
              showArchived
                ? { background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", borderColor: "var(--color-altus-red)", color: "var(--color-altus-red-deep)" }
                : { borderColor: "var(--color-hairline)", color: "var(--color-ink-soft)" }
            }
          >
            <span
              aria-hidden
              className="inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors"
              style={{ background: showArchived ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
            >
              <span
                className="size-[14px] rounded-full bg-white transition-transform"
                style={{ transform: showArchived ? "translateX(14px)" : "translateX(0)" }}
              />
            </span>
            Archived
          </button>
        )}

        {props.canPickTeam && (
          <select
            value={props.scopeEmp}
            onChange={(e) => go({ week: props.weekStart, emp: e.target.value })}
            className="wg-btn cursor-pointer ml-auto px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-strong"
          >
            <option value="all">
              {props.canPickTeam && !props.me.isAdmin ? "My team" : "All team members"}
            </option>
            {props.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Body --------------------------------------------------------- */}
      {showingAll ? (
        grouped.length === 0 ? (
          <EmptyState />
        ) : (
          <div>
            {grouped.map(([empId, g], gi) => (
              <section
                key={empId}
                className={gi > 0 ? "mt-12 pt-12" : ""}
                style={gi > 0 ? { borderTop: `1px solid ${EDITORIAL.hairline}` } : undefined}
              >
                <MemberHeader
                  name={g.name}
                  role={props.roleById?.[empId] ?? null}
                  goalCount={g.rows.length}
                  score={weeklyScore(g.rows.filter((r) => !r.archived))}
                />
                <div className="grid gap-4 xl:grid-cols-2">
                  {g.rows.map((goal, i) => (
                    <div key={goal.id} className="wg-rise" style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}>
                      <GoalCard
                        goal={goal}
                        srNo={i + 1}
                        canEdit={canEditGoal(goal.employeeId)}
                        autoFocus={props.focusId === goal.id}
                        {...sharedCardProps}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((goal, i) => (
            <div key={goal.id} className="wg-rise" style={{ animationDelay: `${Math.min(i * 45, 360)}ms` }}>
              <GoalCard
                goal={goal}
                srNo={i + 1}
                canEdit={props.me.isAdmin || goal.employeeId === props.me.id}
                autoFocus={props.focusId === goal.id}
                {...sharedCardProps}
              />
            </div>
          ))}
          <div className="xl:col-span-2">
            <GoalQuickAdd
              employeeId={props.scopeEmp}
              weekStart={props.weekStart}
              clientOptions={props.clientOptions}
              subjectOptions={props.subjectOptions}
            />
          </div>
        </div>
      )}

      {/* One shared delete dialog for the whole board. */}
      <DeleteGoalDialog
        goal={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          router.refresh();
        }}
      />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Premium stat card (gradient top strip + serif number)                */
/* ------------------------------------------------------------------ */

function StatCard({
  i,
  label,
  value,
  hint,
  tone,
}: {
  i: number;
  label: string;
  value: string;
  hint?: string;
  tone: "slate" | "red" | "green" | "amber";
}) {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl bg-white p-4"
      style={{
        border: `1px solid ${EDITORIAL.hairline}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
        animationDelay: `${120 + i * 70}ms`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
      />
      <div className="text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: EDITORIAL.inkSubtle }}>
        {label}
      </div>
      <div
        className="mt-1.5 tabular-nums"
        style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 34, lineHeight: 1, color: EDITORIAL.inkStrong }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[12px] font-bold" style={{ color: `var(--color-${tone}-deep)` }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mandatory-5 tracker — five pips that fill; nudges until met          */
/* ------------------------------------------------------------------ */

function Min5Tracker({ count, target, shortBy }: { count: number; target: number; shortBy: number }) {
  const met = shortBy === 0;
  return (
    <div
      className={`wg-rise mb-6 flex items-center justify-between gap-4 flex-wrap rounded-2xl p-4 sm:p-5 ${met ? "" : "wg-nudge"}`}
      style={{
        background: met
          ? "color-mix(in srgb, var(--color-green) 7%, #fff)"
          : "color-mix(in srgb, var(--color-altus-red) 6%, #fff)",
        border: `1px solid ${met ? "color-mix(in srgb, var(--color-green) 30%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 28%, transparent)"}`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: met
              ? "color-mix(in srgb, var(--color-green) 16%, transparent)"
              : "color-mix(in srgb, var(--color-altus-red) 14%, transparent)",
            color: met ? "var(--color-green-deep)" : "var(--color-altus-red)",
          }}
        >
          {met ? <CheckCircle2 size={20} strokeWidth={2.4} /> : <Flag size={19} strokeWidth={2.4} />}
        </span>
        <div className="min-w-0">
          <div className="font-bold text-ink-strong" style={{ fontSize: 15 }}>
            {met
              ? "Weekly minimum met"
              : `Add ${shortBy} more goal${shortBy === 1 ? "" : "s"} to meet the weekly minimum`}
          </div>
          <div className="text-[13px] font-semibold" style={{ color: EDITORIAL.inkSoft }}>
            Everyone commits at least {target} goals each week · {count} of {target} set.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: target }).map((_, i) => {
          const filled = i < count;
          return (
            <span
              key={i}
              className={filled ? "wg-pip-pop" : ""}
              style={{
                width: 26,
                height: 8,
                borderRadius: 999,
                animationDelay: `${i * 60}ms`,
                background: filled
                  ? met
                    ? "linear-gradient(90deg, var(--color-green), var(--color-green-deep))"
                    : "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))"
                  : "rgba(0,0,0,0.08)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-member editorial section header                                  */
/* ------------------------------------------------------------------ */

function MemberHeader({
  name,
  role,
  goalCount,
  score,
}: {
  name: string;
  role: string | null;
  goalCount: number;
  score: number;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
      {/* Identity: avatar + serif name + role badge + subline */}
      <div className="flex items-center gap-4 min-w-0">
        <span
          aria-hidden
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-black tabular-nums text-white"
          style={{ background: EDITORIAL.inkStrong }}
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2
              className="truncate"
              style={{
                fontFamily: SERIF,
                fontWeight: 600,
                fontSize: 24,
                lineHeight: 1.1,
                color: EDITORIAL.inkStrong,
                letterSpacing: "-0.01em",
              }}
            >
              {name}
            </h2>
            {role && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.08em]"
                style={{
                  background: EDITORIAL.canvas,
                  color: EDITORIAL.inkSoft,
                  border: `1px solid ${EDITORIAL.hairline}`,
                }}
              >
                {role}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13.5px] font-semibold" style={{ color: EDITORIAL.inkSubtle }}>
            {goalCount} {goalCount === 1 ? "goal" : "goals"} · committed Monday
          </p>
        </div>
      </div>

      {/* Weekly score ring (moves below the identity on narrow screens). */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p
            className="text-[10.5px] font-black uppercase tracking-[0.1em]"
            style={{ color: EDITORIAL.inkSubtle }}
          >
            Weekly Score
          </p>
          <p
            className="tabular-nums leading-none"
            style={{
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 34,
              color: score >= 60 ? "var(--color-altus-red)" : EDITORIAL.inkStrong,
            }}
          >
            {score}%
          </p>
        </div>
        <ScoreRing value={score} size={64} label={`${score}% weekly score for ${name}`} />
      </div>
    </div>
  );
}

function ScorePill({
  label,
  score,
  compact = false,
}: {
  label: string;
  score: number;
  compact?: boolean;
}) {
  const tone = score >= 100 ? "green" : score >= 50 ? "amber" : score > 0 ? "orange" : "slate";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full ${compact ? "px-3 py-1" : "px-4 py-2"} font-bold`}
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
        fontSize: compact ? 13 : 14,
      }}
    >
      <span className="font-semibold opacity-80">{label}</span>
      <span className="tabular-nums font-black">{score}%</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="wg-rise relative overflow-hidden bg-surface-card rounded-section border border-hairline px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {/* faint concentric target rings behind the icon */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 opacity-[0.06]"
        style={{
          width: 260,
          height: 260,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, transparent 38%, var(--color-altus-red) 39%, transparent 41%, transparent 58%, var(--color-altus-red) 59%, transparent 61%)",
        }}
      />
      <div className="relative">
        <span
          className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          <Target size={30} strokeWidth={2.2} />
        </span>
        <h3
          className="text-ink-strong"
          style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 28, letterSpacing: "-0.01em" }}
        >
          No weekly goals yet
        </h3>
        <p
          className="mx-auto mt-2 max-w-[44ch] font-medium"
          style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--color-ink-soft)" }}
        >
          Pick a team member from the toolbar above, then add their top priorities
          for the week — five is the floor, weights total 100.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two-step delete confirmation (shared across cards)                   */
/* ------------------------------------------------------------------ */

function DeleteGoalDialog({
  goal,
  onClose,
  onDeleted,
}: {
  goal: BoardGoal | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [typed, setTyped] = React.useState("");
  const open = goal != null;
  const name = goal
    ? goal.client || goal.subject || goal.targetDone || "this goal"
    : "this goal";

  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  const confirmable = typed.trim().toLowerCase() === name.trim().toLowerCase();

  function performDelete() {
    if (!goal) return;
    start(async () => {
      const res = await deleteWeeklyGoal({ id: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      onDeleted();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                color: "var(--color-altus-red)",
              }}
            >
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                }}
              >
                Delete weekly goal?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                {step === 1
                  ? "Step 1 of 2 — review what will be removed."
                  : "Step 2 of 2 — confirm to finish."}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div
                className="rounded-chip p-4 mb-4"
                style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
              >
                <p className="text-[15px] text-ink-strong font-semibold break-words">“{name}”</p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
                  <li>• Removes this goal and its % progress history.</li>
                  <li>• Any linked incentive entry is handled separately.</li>
                  <li>
                    • This <strong>cannot be undone</strong>.
                  </li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft mb-2" style={{ lineHeight: 1.55 }}>
                Type <span className="font-bold text-ink-strong">{name}</span> to confirm deletion.
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmable && !pending) performDelete();
                }}
                placeholder={name}
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none focus:border-altus-red mb-4"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={performDelete}
                  disabled={!confirmable || pending}
                  className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {pending && <Loader2 size={14} className="animate-spin" />}
                  {pending ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
