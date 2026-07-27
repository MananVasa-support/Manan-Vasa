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
  Plus,
  Loader2,
  Check,
  List,
  Columns3,
} from "lucide-react";
import { motion } from "motion/react";
import { fireToast } from "@/lib/toast";
import { addWeekGoal, carryAllUnfinishedForward } from "@/app/(app)/goals/weekly/actions";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { Select } from "@/components/ui/select";
import { TeamWeightsField, type TeamMemberWeight } from "@/components/goals/board/team-weights-field";
import { CascadeGoalCard } from "./cascade-goal-card";
import { GoalTableView } from "@/components/goals/board/goal-table-view";
import { WEEKLY_TABLE_ACTIONS } from "@/components/goals/board/weekly-table-actions";
import { CommitDialog } from "@/components/goals/commit/commit-dialog";
import type { CommitMember } from "@/components/goals/commit/types";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { WeeklyKanban } from "./weekly-kanban";
import type { BoardMe, CascadeWeeklyGoal, MonthGoalOption, RosterMember } from "./types";

/** localStorage key for the weekly board's List ⇄ Kanban preference. */
const WEEKLY_VIEW_STORE_KEY = "goals-weekly-view";

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
  const quickAddRef = React.useRef<WeeklyQuickAddHandle>(null);

  // ── View: classic list ⇄ Kanban (persisted). SSR renders "list"; the stored
  //    preference applies after mount so hydration stays clean. ─────────
  const [view, setView] = React.useState<"list" | "kanban">("list");
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(WEEKLY_VIEW_STORE_KEY) === "kanban") setView("kanban");
    } catch {
      /* storage unavailable — stay on list */
    }
  }, []);
  const pickView = React.useCallback((v: "list" | "kanban") => {
    setView(v);
    try {
      window.localStorage.setItem(WEEKLY_VIEW_STORE_KEY, v);
    } catch {
      /* non-fatal */
    }
  }, []);
  // Who may create a weekly goal here: self, an admin, or a manager viewing a
  // downline member (the server re-asserts this on addWeekGoal).
  const canWrite = me.isAdmin || scopeEmp === me.id || canPickPerson;

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

  // Whose board — self vs. a downline member (drives the header eyebrow +
  // the "VIEWING" avatar pill). people[] is empty when the picker is hidden,
  // so fall back to the first row's employeeName, then a neutral label.
  const isSelf = scopeEmp === me.id;
  const viewedName =
    people.find((p) => p.id === scopeEmp)?.name ?? rows[0]?.employeeName ?? (isSelf ? "My goals" : "Teammate");

  return (
    <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
      {/* ── HEADER — level-board style: one compact pastel-red command band.
          LEFT = identity (eyebrow + "Weekly Goals"); RIGHT = week stepper +
          person selector (moved out of the toolbar). Mirrors goals-level-board. ── */}
      <section
        className="wg-rise relative mb-5 overflow-hidden rounded-[26px]"
        style={{
          background:
            "linear-gradient(105deg, color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card)) 0%, var(--color-surface-card) 44%, color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-card)) 100%)",
          border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, var(--color-hairline))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 6px rgba(15,23,42,0.05), 0 26px 60px -34px color-mix(in srgb, var(--color-altus-red) 44%, transparent)",
        }}
      >
        {/* aurora washes + left accent rail */}
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 15%, transparent), transparent 66%)" }} />
        <span aria-hidden className="pointer-events-none absolute -left-24 -bottom-28 h-60 w-60 rounded-full" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 8%, transparent), transparent 70%)" }} />
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-1.5" style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />

        <div className="relative flex min-h-[68px] items-center gap-6 px-7 py-3.5 max-xl:flex-wrap max-md:gap-4 max-md:px-4">
          {/* 1 · identity — eyebrow + compact title only */}
          <div className="min-w-0 flex-1 max-xl:w-full max-xl:flex-none">
            <div className="text-[10.5px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Goals · {weekLabel} · {isSelf ? "My goals" : viewedName}
            </div>
            <h1
              className="mt-0.5"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, color: "var(--color-ink-strong)", fontSize: "clamp(24px, 2.3vw, 34px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
            >
              Weekly Goals
            </h1>
          </div>

          {/* 2 · person + week — side by side on one horizontal band */}
          <div
            className="flex shrink-0 flex-row items-center gap-3 border-l pl-6 max-xl:w-full max-xl:justify-between max-xl:border-l-0 max-xl:pl-0"
            style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 16%, var(--color-hairline))" }}
          >
            {/* Person selector — glowing "VIEWING" avatar pill wrapping the
                existing native select (goPerson). */}
            {canPickPerson && people.length > 0 && (
              <div className="group relative w-[236px] max-md:w-full">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-[2px] rounded-2xl opacity-55 blur-[7px] transition-opacity duration-300 group-hover:opacity-90"
                  style={{ background: "linear-gradient(120deg, var(--color-altus-red), #ff5560, var(--color-altus-red-deep))" }}
                />
                <div
                  className="relative flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 12%, var(--color-surface-card)), var(--color-surface-card) 70%)",
                    border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 32%, transparent)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78), 0 9px 24px -13px color-mix(in srgb, var(--color-altus-red) 60%, transparent)",
                  }}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px var(--color-altus-red)" }}
                  >
                    {viewedName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--color-altus-red-deep)" }}>
                      Viewing
                    </div>
                    <Select
                      value={scopeEmp}
                      onValueChange={(v) => goPerson(v)}
                      searchable
                      searchPlaceholder="Search people…"
                      ariaLabel="View another person's goals"
                      unstyled
                      className="flex w-full cursor-pointer items-center gap-1 text-left text-[13.5px] font-bold text-ink-strong"
                      options={people.map((p) => ({
                        value: p.id,
                        label: p.id === me.id ? `${p.name} (me)` : p.name,
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Week stepper — mirrors the level board's FY stepper pill. */}
            <div
              className="inline-flex items-center overflow-hidden rounded-full"
              style={{
                background: "var(--color-surface-card)",
                border: "1px solid color-mix(in srgb, var(--color-altus-red) 20%, var(--color-hairline))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(15,23,42,0.05)",
              }}
            >
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => goWeek(prevWeek)}
                className="cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors outline-none hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] hover:text-altus-red focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60"
              >
                <ChevronLeft size={17} strokeWidth={2.4} />
              </button>
              <span
                className="flex items-center gap-1.5 px-3 py-1.5"
                style={{ borderInline: "1px solid color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))" }}
              >
                <CalendarDays size={13} style={{ color: "var(--color-altus-red)" }} />
                <span
                  className="rounded-chip px-1.5 py-0.5 text-[10.5px] font-black tabular-nums text-white"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)" }}
                >
                  W{weekNo}
                </span>
                <span className="text-[13px] font-bold tabular-nums text-ink-strong">{weekLabel}</span>
              </span>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => goWeek(nextWeek)}
                className="cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors outline-none hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] hover:text-altus-red focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60"
              >
                <ChevronRight size={17} strokeWidth={2.4} />
              </button>
            </div>

            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => goWeek(thisWeek)}
                title="Jump to this week"
                className="wg-btn shrink-0 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold text-altus-red outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60"
                style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)" }}
              >
                This week
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Controls — ONE row (scrolls horizontally on narrow widths, never wraps) */}
      <div className="mb-6 flex flex-nowrap items-center gap-2 overflow-x-auto py-1 wg-rise" style={{ animationDelay: "0.06s" }}>
        {/* Create — a single weekly goal (composer drawer) + bulk file import.
            Both write into the week + person in view via the cascade weekly
            engine (addWeekGoal / importWeeklyGoals). */}
        <button
          type="button"
          onClick={() => quickAddRef.current?.open()}
          className="wg-btn wg-sheen inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow:
              "0 8px 20px -10px color-mix(in srgb, var(--goals-accent, #E10600) 65%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Plus size={14} strokeWidth={2.8} />
          Add weekly goal
        </button>
        <div className="shrink-0">
          <WeeklyGoalsImport
            employeeId={scopeEmp}
            weekStart={weekStart}
            weekLabel={weekLabel}
            isAdmin={me.isAdmin}
          />
        </div>

        {/* View toggle — List | Kanban (mirrors the monthly board's control) */}
        <div
          role="group"
          aria-label="Board view"
          className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-hairline-strong bg-surface-soft"
        >
          <ViewToggleButton
            active={view === "list"}
            label="List"
            icon={<List size={14} strokeWidth={2.4} />}
            onClick={() => pickView("list")}
          />
          <ViewToggleButton
            active={view === "kanban"}
            label="Kanban"
            icon={<Columns3 size={14} strokeWidth={2.4} />}
            onClick={() => pickView("kanban")}
          />
        </div>

        {/* Ritual state — Saturday commit / Monday approve, reachable in context.
            The chips read the existing stamps; the ritual pages keep the logic. */}
        {adopted.length > 0 && (
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5" role="group" aria-label="Weekly ritual status">
            {commit ? (
              <button
                type="button"
                onClick={() => setCommitOpen(true)}
                title="Freeze next week (Saturday commit)"
                className="wg-btn inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1.5 text-[12px] font-bold"
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
            title={`Carry ${unfinishedCount} unfinished goal(s) into next week`}
            className="wg-btn wg-sheen ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              boxShadow: "0 8px 20px -10px color-mix(in srgb, var(--goals-accent, #E10600) 65%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <ArrowRightLeft size={13} />
            {pending ? "Carrying…" : `Carry ${unfinishedCount} → next week`}
          </button>
        )}
      </div>

      {/* Body — classic list or the drag-to-plan Kanban */}
      {view === "kanban" ? (
        <WeeklyKanban
          me={me}
          scopeEmp={scopeEmp}
          weekStart={weekStart}
          weekNo={weekNo}
          weekLabel={weekLabel}
          rows={rows}
          monthGoalOptions={monthGoalOptions}
          canWrite={canWrite}
        />
      ) : rows.length === 0 ? (
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

      {/* Add a single weekly goal — the dashed tile after the list (the pill in
          the controls row opens this same composer via the ref). */}
      <div className="mt-4">
        <WeeklyQuickAdd
          ref={quickAddRef}
          employeeId={scopeEmp}
          weekStart={weekStart}
          currentCount={rows.length}
          monthGoalOptions={monthGoalOptions}
          areaOptions={areaOptions}
          measureOptions={measureOptions}
          typeOptions={typeOptions}
          customLookups={customLookups}
          roster={roster}
          isAdmin={me.isAdmin}
        />
      </div>

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
/* View toggle — List ⇄ Kanban segmented control (mirrors the level board) */
/* ------------------------------------------------------------------ */

function ViewToggleButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
      style={
        active
          ? { background: "var(--color-surface-card)", color: ACCENT_DEEP, boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
          : { background: "transparent", color: "var(--color-ink-subtle)" }
      }
    >
      {icon}
      {label}
    </button>
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
      className="wg-btn inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1.5 text-[12px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
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

/* ------------------------------------------------------------------ */
/* Weekly quick-add — create ONE weekly goal in the week + person in    */
/* view. Mirrors board-quick-add's UX AND its full field set            */
/* (Area · Goal · Measure · Type · Actual · Target · Weight · Team       */
/* Members) plus the weekly-only "Monthly goal" link. Writes through the */
/* CASCADE weekly action `addWeekGoal`, which now persists every field   */
/* onto the weekly_goals row. Keeps the WeeklyGoalDrawer, save-and-add-  */
/* another (drawer stays open + eyebrow count bumps), an "End" button,   */
/* and keyboard-first ⌘/Ctrl+Enter.                                      */
/* ------------------------------------------------------------------ */

const QUICK_ADD_FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

export interface WeeklyQuickAddHandle {
  open: () => void;
}

const WeeklyQuickAdd = React.forwardRef<
  WeeklyQuickAddHandle,
  {
    employeeId: string;
    weekStart: string;
    currentCount: number;
    monthGoalOptions: MonthGoalOption[];
    areaOptions: string[];
    measureOptions: string[];
    typeOptions: string[];
    customLookups: { areas: string[]; measures: string[]; types: string[] };
    roster: RosterMember[];
    isAdmin: boolean;
  }
>(function WeeklyQuickAdd(props, ref) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [type, setType] = React.useState("Goal");
  const [actual, setActual] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [weight, setWeight] = React.useState("100");
  const [team, setTeam] = React.useState<TeamMemberWeight[]>([]);
  const [monthGoalId, setMonthGoalId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [addedCount, setAddedCount] = React.useState(0);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true);
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    }),
    [],
  );

  function reset() {
    setTitle("");
    setArea("");
    setMeasure("");
    setType("Goal");
    setActual("");
    setTarget("");
    setWeight("100");
    setTeam([]);
    setMonthGoalId("");
    setError(null);
  }

  function closeAll() {
    setOpen(false);
    reset();
    setAddedCount(0);
  }

  function submit() {
    const t = title.trim();
    if (!t) {
      setError("Give the goal a name before saving.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(true);

    const parsedWeight = Number.parseInt(weight, 10);
    const w = Number.isFinite(parsedWeight) ? Math.max(0, Math.min(1000, parsedWeight)) : 100;
    const numOrNull = (s: string): string | null => {
      const v = s.trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : null;
    };

    void addWeekGoal({
      employeeId: props.employeeId,
      weekStart: props.weekStart,
      title: t,
      area: area.trim() || null,
      uom: measure.trim() || null,
      category: type.trim() || null,
      actualQty: numOrNull(actual),
      targetQty: numOrNull(target),
      weight: w,
      teamInvolved: team.length ? team : null,
      monthGoalId: monthGoalId || null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Save-and-add-another: keep the drawer open, clear the fields, bump the
        // running count in the eyebrow, refocus the first field. "End" closes.
        setAddedCount((c) => c + 1);
        reset();
        titleRef.current?.focus();
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save the goal. Try again.");
      });
  }

  return (
    <>
      {/* Calm dashed "+ Add weekly goal" tile (matches board-quick-add). */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => titleRef.current?.focus());
        }}
        className={`wg-btn group flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-5 text-[15px] font-bold transition-colors hover:bg-surface-soft ${QUICK_ADD_FOCUS_RING}`}
        style={{
          borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)",
          color: "var(--color-altus-red-deep)",
          background: "color-mix(in srgb, var(--color-altus-red) 4%, transparent)",
        }}
      >
        <span
          className="inline-flex size-7 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red)" }}
        >
          <Plus size={16} strokeWidth={2.8} />
        </span>
        Add weekly goal
      </button>

      <WeeklyGoalDrawer
        open={open}
        onClose={closeAll}
        eyebrow={`New weekly goal · #${props.currentCount + addedCount + 1}`}
        title="Add Goal for the Week"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
              {addedCount > 0 ? `${addedCount} added · keep going, or End` : "⌘/Ctrl + Enter to save"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeAll}
                className={`inline-flex items-center rounded-full border px-5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                End
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${QUICK_ADD_FOCUS_RING}`}
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                Add Goal
              </button>
            </div>
          </div>
        }
      >
        <div
          className="grid gap-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        >
          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-altus-red"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}
            >
              {error}
            </p>
          )}

          {/* Area — managed dropdown (admins can add options). */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Area</span>
            <GoalLookupSelect
              kind="area"
              noun="Area"
              value={area}
              onChange={setArea}
              options={props.areaOptions}
              custom={props.customLookups.areas}
              isAdmin={props.isAdmin}
              placeholder="Choose an area"
            />
          </div>

          {/* Goal (→ target_done, the row's title everywhere). */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does done look like this week?"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[15px] font-medium text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
          </label>

          {/* Measure (→ uom) + Type (→ goal_type). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Measure</span>
              <GoalLookupSelect
                kind="measure"
                noun="Measure"
                value={measure}
                onChange={setMeasure}
                options={props.measureOptions}
                custom={props.customLookups.measures}
                isAdmin={props.isAdmin}
                placeholder="Choose a measure"
              />
            </div>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Type</span>
              <GoalLookupSelect
                kind="type"
                noun="Type"
                value={type}
                onChange={setType}
                options={props.typeOptions}
                custom={props.customLookups.types}
                isAdmin={props.isAdmin}
                placeholder="Choose a type"
              />
            </div>
          </div>

          {/* Actual vs Target (% Done = Actual ÷ Target). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Actual</span>
              <input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 0"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 100"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
          </div>

          {/* Weight — share of the weekly weighted-completion score. */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Weight</span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="100"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">share of the week&apos;s score</span>
          </label>

          {/* Team members (each with their OWN weight). */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Team Members</span>
            <TeamWeightsField value={team} roster={props.roster} onChange={setTeam} />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Add the people on this goal — each gets their own weight (share).
            </span>
          </div>

          {/* Link up to a monthly cascade goal (optional parent). */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Monthly goal</span>
            <Select
              value={monthGoalId}
              onValueChange={setMonthGoalId}
              ariaLabel="Monthly goal"
              placeholder="No monthly link"
              searchable={props.monthGoalOptions.length > 8}
              searchPlaceholder="Search monthly goals…"
              className="h-10"
              options={[
                { value: "", label: "No monthly link" },
                ...props.monthGoalOptions.map((m) => ({ value: m.id, label: m.title })),
              ]}
            />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Ladder this week&apos;s goal up to its monthly parent (optional).
            </span>
          </label>
        </div>
      </WeeklyGoalDrawer>
    </>
  );
});
