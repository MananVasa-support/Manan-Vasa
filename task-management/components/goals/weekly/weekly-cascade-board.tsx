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
} from "lucide-react";
import { motion } from "motion/react";
import { fireToast } from "@/lib/toast";
import { addWeekGoal, carryAllUnfinishedForward } from "@/app/(app)/goals/weekly/actions";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
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
  const quickAddRef = React.useRef<WeeklyQuickAddHandle>(null);

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

        {/* Create — a single weekly goal (composer drawer) + bulk file import.
            Both write into the week + person in view via the cascade weekly
            engine (addWeekGoal / importWeeklyGoals). */}
        <button
          type="button"
          onClick={() => quickAddRef.current?.open()}
          className="wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--goals-accent,#E10600)]/60 focus-visible:ring-offset-1"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow:
              "0 8px 20px -10px color-mix(in srgb, var(--goals-accent, #E10600) 65%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Plus size={14} strokeWidth={2.8} />
          Add weekly goal
        </button>
        <WeeklyGoalsImport
          employeeId={scopeEmp}
          weekStart={weekStart}
          weekLabel={weekLabel}
          isAdmin={me.isAdmin}
        />

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
          customAreas={customLookups.areas}
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

/* ------------------------------------------------------------------ */
/* Weekly quick-add — create ONE weekly goal in the week + person in    */
/* view. Mirrors board-quick-add's UX (WeeklyGoalDrawer, save-and-add-  */
/* another with a bumping eyebrow count, an "End" button, keyboard-     */
/* first ⌘/Ctrl+Enter) but writes through the CASCADE weekly action     */
/* `addWeekGoal` (NOT the legacy createWeeklyGoal). addWeekGoal only    */
/* takes { employeeId, weekStart, title, area?, monthGoalId? }, so the  */
/* composer surfaces exactly those fields; targets/actuals/team stay    */
/* inline-editable on the row afterwards.                               */
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
    customAreas: string[];
    isAdmin: boolean;
  }
>(function WeeklyQuickAdd(props, ref) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
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
    void addWeekGoal({
      employeeId: props.employeeId,
      weekStart: props.weekStart,
      title: t,
      area: area.trim() || null,
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
              custom={props.customAreas}
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

          {/* Link up to a monthly cascade goal (optional parent). */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Monthly goal</span>
            <select
              value={monthGoalId}
              onChange={(e) => setMonthGoalId(e.target.value)}
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-semibold text-ink-strong focus:border-altus-red ${QUICK_ADD_FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <option value="">No monthly link</option>
              {props.monthGoalOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Ladder this week&apos;s goal up to its monthly parent (optional).
            </span>
          </label>
        </div>
      </WeeklyGoalDrawer>
    </>
  );
});
