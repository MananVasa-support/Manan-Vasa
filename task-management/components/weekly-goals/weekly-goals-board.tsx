"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  BarChart3,
  Trash2,
  Loader2,
  Target,
  Search,
  X,
  Scale,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalCard } from "@/components/weekly-goals/goal-card";
import { GoalQuickAdd } from "@/components/weekly-goals/goal-quick-add";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import { BoardQuickChips, type QuickChip } from "@/components/weekly-goals/board-quick-chips";
import { BoardPersonNav, type PersonNavItem } from "@/components/weekly-goals/board-person-nav";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { weeklyScore, weightTotal, WEIGHT_BUDGET } from "@/lib/weekly-goals/effective";
import {
  deleteWeeklyGoal,
  balanceWeeklyGoalWeights,
} from "@/app/(app)/weekly-goals/actions";
import { fireToast } from "@/lib/toast";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

interface Props {
  me: { id: string; isAdmin: boolean };
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
  /** Incentive catalog rows (Routine amount picker in the add form). */
  catalog: { id: string; name: string; amount: number }[];
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  focusId: string | null;
}

export function WeeklyGoalsBoard(props: Props) {
  const router = useRouter();
  const showingAll = props.scopeEmp === "all";
  const meId = props.me.id;

  // #5 — manager of a goal: admins manage anyone; a manager manages their
  // downline but NEVER their own goal (a person is never a manager of their
  // own goal). For a normal employee manageableIds === [their own id], so this
  // is correctly FALSE for their own goal.
  const canManage = React.useCallback(
    (employeeId: string) =>
      props.me.isAdmin ||
      (props.manageableIds !== "all" &&
        props.manageableIds.includes(employeeId) &&
        employeeId !== meId),
    [props.manageableIds, props.me.isAdmin, meId],
  );
  // #5 — may report (set progress % + status): the owner, or a manager.
  const canReport = React.useCallback(
    (employeeId: string) => employeeId === meId || canManage(employeeId),
    [meId, canManage],
  );
  // Balance-to-100 is a normalization (not arbitrary planning) → the OWNER may
  // balance their own week, and managers/admins may balance anyone in scope.
  const canBalance = React.useCallback(
    (employeeId: string) => employeeId === meId || canManage(employeeId),
    [meId, canManage],
  );

  // Optimistic local copy of the week's goals. Inline edits (progress %, status,
  // report text, planning fields) patch THIS in place instead of router.refresh()
  // — that full-board server re-fetch on every slider release is what made the %
  // slider buffer and, under pool pressure, stall the whole app. Re-syncs whenever
  // the server sends fresh rows (navigation / add / delete / duplicate).
  const [rows, setRows] = React.useState(props.rows);
  React.useEffect(() => setRows(props.rows), [props.rows]);
  const patchGoal = React.useCallback(
    (id: string, patch: Partial<BoardGoal>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [],
  );

  // Reviewer-only "show archived" toggle + the list filters / sort.
  const [showArchived, setShowArchived] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Defer the search so a keystroke updates the controlled input instantly,
  // while the (heavy) filter/sort/group derivation runs at a lower priority —
  // this is the cure for "stuck while typing" with a full team's goals.
  const deferredSearch = React.useDeferredValue(search);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [completion, setCompletion] = React.useState("all");
  const [sort, setSort] = React.useState("weight");

  // Shared two-step delete dialog state (one dialog for every card).
  const [deleteTarget, setDeleteTarget] = React.useState<BoardGoal | null>(null);
  // Stable callback so memoised cards don't re-render on every keystroke.
  const requestDelete = React.useCallback((g: BoardGoal) => setDeleteTarget(g), []);

  // #2 — per-employee collapse state for the admin "all" grouped view. Keyed by
  // employee id; absent/false = expanded (default). Local-only, not persisted.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggleCollapsed = React.useCallback(
    (empId: string) => setCollapsed((c) => ({ ...c, [empId]: !c[empId] })),
    [],
  );

  function go(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/weekly-goals?${sp.toString()}` as Route);
  }

  // Effective % = manager's accepted number once set, else the doer's report.
  const effPct = (r: BoardGoal) => r.acceptPct ?? r.pctDone;

  // `visible` = the week's goals minus archived — drives the headline score, the
  // min-5 tracker and the weight total. Filters/sort must NOT change those.
  const visible = React.useMemo(
    () => rows.filter((r) => showArchived || !r.archived),
    [rows, showArchived],
  );

  // `displayed` = what the LIST shows: `visible` narrowed by search / status /
  // completion, then sorted. Keeps the headline stats off the filtered set.
  const displayed = React.useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const rows = visible.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (completion !== "all") {
        const p = effPct(r);
        if (completion === "behind" && p >= 50) return false;
        if (completion === "ontrack" && (p < 50 || p >= 100)) return false;
        if (completion === "done" && p < 100) return false;
        if (completion === "unfilled" && p > 0) return false;
      }
      if (q) {
        const hay = `${r.client ?? ""} ${r.subject ?? ""} ${r.targetDone ?? ""} ${r.employeeName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const cmp: Record<string, (a: BoardGoal, b: BoardGoal) => number> = {
      weight: (a, b) => (b.weight || 0) - (a.weight || 0),
      scoreDesc: (a, b) => effPct(b) - effPct(a),
      scoreAsc: (a, b) => effPct(a) - effPct(b),
      name: (a, b) => (a.client || a.subject || a.targetDone || "").localeCompare(b.client || b.subject || b.targetDone || ""),
      recent: (a, b) => (b.pctUpdatedAt?.getTime() ?? 0) - (a.pctUpdatedAt?.getTime() ?? 0),
    };
    return [...rows].sort(cmp[sort] ?? cmp.weight);
  }, [visible, deferredSearch, statusFilter, completion, sort]);

  // Group by employee for the admin "all" overview (off the displayed list).
  const grouped = React.useMemo(() => {
    const map = new Map<string, { name: string; rows: BoardGoal[] }>();
    for (const r of displayed) {
      if (!map.has(r.employeeId)) map.set(r.employeeId, { name: r.employeeName, rows: [] });
      map.get(r.employeeId)!.rows.push(r);
    }
    return [...map.entries()];
  }, [displayed]);

  // Directory rows for the jump-to-person rail — built off the FULL visible set
  // (not the filtered `grouped`) so someone never "disappears" from the rail just
  // because the current search/chip hides their cards; each row carries their
  // week score, active-goal count and how many goals are still behind (alert dot).
  const personNav = React.useMemo<PersonNavItem[]>(() => {
    const map = new Map<string, { name: string; rows: BoardGoal[] }>();
    for (const r of visible) {
      if (r.archived) continue;
      if (!map.has(r.employeeId)) map.set(r.employeeId, { name: r.employeeName, rows: [] });
      map.get(r.employeeId)!.rows.push(r);
    }
    return [...map.entries()]
      .map(([id, g]) => ({
        id,
        name: g.name,
        role: props.roleById?.[id] ?? null,
        goalCount: g.rows.length,
        score: weeklyScore(g.rows),
        behindCount: g.rows.filter((r) => effPct(r) < 50).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visible, props.roleById]);

  // Per-person live weight total over their ACTIVE (non-archived) goals this
  // week — drives both the budget meter and the budget-aware inline editor. Keyed
  // off `visible` (the unfiltered set) so a search never distorts the budget.
  const weightTotalByEmp = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of visible) {
      if (r.archived) continue;
      // The 100-budget is PER WEEK: only goals PLANNED in the viewed week
      // (weekStart === this week) count. Goals "visiting" this week because their
      // target date lands here but were planned in another week belong to THAT
      // week's budget — counting them here is what made the meter disagree with
      // the (week-scoped) Balance action ("98/100" vs "already 100").
      if (r.weekStart !== props.weekStart) continue;
      map.set(r.employeeId, (map.get(r.employeeId) ?? 0) + Math.max(0, r.weight));
    }
    return map;
  }, [visible, props.weekStart]);

  // Quick-filter chip counts — computed off `visible` (unfiltered, minus the
  // status/search narrowing) so a chip always shows the TRUE size of its bucket,
  // and its own selection doesn't shrink its own number. "unfilled" = %===0.
  const chipCounts = React.useMemo<Record<QuickChip, number>>(() => {
    const base = visible.filter((r) => statusFilter === "all" || r.status === statusFilter);
    const c: Record<QuickChip, number> = { all: base.length, behind: 0, ontrack: 0, done: 0, unfilled: 0 };
    for (const r of base) {
      const p = effPct(r);
      if (p < 50) c.behind++;
      if (p >= 50 && p < 100) c.ontrack++;
      if (p >= 100) c.done++;
      if (p <= 0) c.unfilled++;
    }
    return c;
  }, [visible, statusFilter]);
  const quickChip: QuickChip = completion as QuickChip;

  // ── Person "jump to" nav (admin/manager whole-team view) ───────────────
  // Section refs by employee id so the rail can scroll to a person; expanding a
  // collapsed section on jump so their goals are visible on arrival.
  const sectionRefs = React.useRef<Map<string, HTMLElement>>(new Map());
  const registerSection = React.useCallback((empId: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(empId, el);
    else sectionRefs.current.delete(empId);
  }, []);
  const [activePerson, setActivePerson] = React.useState<string | null>(null);
  const jumpToPerson = React.useCallback((empId: string) => {
    setCollapsed((c) => (c[empId] ? { ...c, [empId]: false } : c));
    setActivePerson(empId);
    // Wait a frame in case we just expanded the section (its height changed).
    requestAnimationFrame(() => {
      const el = sectionRefs.current.get(empId);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Move keyboard focus to the section's header toggle for keyboard users.
      requestAnimationFrame(() => {
        el?.querySelector<HTMLButtonElement>("[data-person-toggle]")?.focus({ preventScroll: true });
      });
    });
  }, []);

  // Highlight the rail row for whichever person section is nearest the top of the
  // viewport as the manager scrolls. Re-observes whenever the visible sections
  // change (filter/search/add/delete). Guarded for SSR / no-IO environments.
  React.useEffect(() => {
    if (!showingAll || typeof IntersectionObserver === "undefined") return;
    const els = [...sectionRefs.current.values()];
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = top?.target.getAttribute("data-person-id");
        if (id) setActivePerson(id);
      },
      { rootMargin: "-8% 0px -70% 0px", threshold: 0 },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [showingAll, grouped]);

  const totalCount = visible.length;
  const activeVisible = React.useMemo(() => visible.filter((r) => !r.archived), [visible]);
  const overallScore = weeklyScore(activeVisible);
  const doneCount = activeVisible.filter((r) => effPct(r) >= 100).length;
  // Single-person view: this person's full active weight total toward 100.
  // Single-person view: only this week's planned goals count toward the budget
  // (visiting goals due this week from other weeks don't consume this budget).
  const singleWeightTotal = showingAll
    ? 0
    : weightTotal(activeVisible.filter((r) => r.weekStart === props.weekStart));

  // Distinct statuses present → the Status filter options (labelled via map).
  const statusOptions = React.useMemo(
    () => [...new Set(visible.map((r) => r.status))].map((s) => ({
      value: s,
      label: props.statusDisplay[s]?.label ?? s,
    })),
    [visible, props.statusDisplay],
  );
  const activeFilterCount =
    (search.trim() ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (completion !== "all" ? 1 : 0);
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setCompletion("all"); };

  // Props shared by every card. Memoised so the object identity is stable across
  // board re-renders (search keystrokes) — paired with React.memo on GoalCard,
  // only cards whose own props change actually re-render.
  const sharedCardProps = React.useMemo(
    () => ({
      isAdmin: props.me.isAdmin,
      statusDisplay: props.statusDisplay,
      clientOptions: props.clientOptions,
      subjectOptions: props.subjectOptions,
      catalog: props.catalog,
      onRequestDelete: requestDelete,
      onPatch: patchGoal,
    }),
    [
      props.me.isAdmin,
      props.statusDisplay,
      props.clientOptions,
      props.subjectOptions,
      props.catalog,
      requestDelete,
      patchGoal,
    ],
  );

  return (
    <main
      className="relative min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, var(--color-surface-soft) 0%, color-mix(in srgb, var(--color-surface-track) 60%, var(--color-surface-soft)) 100%)",
        color: "var(--color-ink-strong)",
      }}
    >
      <div className={`relative mx-auto px-10 max-md:px-4 pt-8 pb-24 ${showingAll ? "max-w-[1360px]" : "max-w-[1180px]"}`}>
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <section className="wg-rise mb-5 flex items-center justify-between gap-6 flex-wrap">
        {/* Left — title + subtitle */}
        <div className="min-w-0">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            Accountability · {props.weekLabel}
          </div>
          <h1
            className="mt-1.5 font-bold"
            style={{
              color: "var(--color-ink-strong)",
              fontSize: "clamp(26px, 2.6vw, 38px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Weekly Goals
          </h1>
          <p
            className="mt-1.5 max-w-[52ch] font-medium"
            style={{ fontSize: 14, lineHeight: 1.45, color: "var(--color-ink-muted)" }}
          >
            The handful of priorities each person commits to — weighted, scored, reviewed.
            Five is the floor; weights total {WEIGHT_BUDGET}.
          </p>
        </div>

        {/* Middle — team/weekly-score card fills the gap between the title and the
            actions (`justify-between` centres it). Hidden when there are no goals. */}
        {totalCount > 0 && (
          <div
            className="flex items-center gap-4 rounded-2xl border px-5 py-3.5 shrink-0 max-md:w-full"
            style={{
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline)",
              boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
            }}
          >
            <ScoreRing
              value={overallScore}
              size={64}
              label={`${overallScore}% ${showingAll ? "team " : ""}weekly score`}
            />
            <div>
              <div
                className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--color-ink-subtle)" }}
              >
                {showingAll ? "Team" : "Weekly"} score
              </div>
              <div
                className="tabular-nums leading-none"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 30,
                  color: "var(--color-ink-strong)",
                }}
              >
                {overallScore}%
              </div>
              <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                {doneCount}/{totalCount} done
              </div>
            </div>
          </div>
        )}

        {/* Right — primary actions */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end shrink-0 max-md:w-full max-md:justify-start">
          <Link
            href={
              (props.scopeEmp && props.scopeEmp !== "all"
                ? `/weekly-goals?view=dashboard&emp=${props.scopeEmp}`
                : "/weekly-goals?view=dashboard") as Route
            }
            className={`wg-sheen inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white cursor-pointer ${FOCUS_RING}`}
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 10px 24px -12px rgba(225, 6, 0, 0.55)",
            }}
          >
            <BarChart3 size={16} strokeWidth={2.4} />
            Performance Dashboard
          </Link>
          <WeeklyGoalsImport
            employeeId={props.scopeEmp}
            weekStart={props.weekStart}
            weekLabel={props.weekLabel}
            isAdmin={props.me.isAdmin}
          />
        </div>
      </section>

      {/* ── Filter command bar ──────────────────────────────────────── */}
      <div
        className="wg-rise mb-5 rounded-2xl border p-3"
        style={{
          background: "var(--color-surface-card)",
          borderColor: "var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
          animationDelay: "60ms",
        }}
      >
        {/* #1 — ONE compact wrap-friendly row: search · status · progress ·
            sort · team · week-nav · this-week · archived · clear · count. */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} strokeWidth={2.4} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search goals, clients, subjects…"
              aria-label="Search goals"
              className={`w-full rounded-full border border-hairline bg-surface-soft pl-9 pr-9 py-2 text-[14px] font-medium text-ink-strong transition-colors focus:border-altus-red ${FOCUS_RING}`}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full text-ink-subtle hover:text-ink-strong cursor-pointer ${FOCUS_RING}`}>
                <X size={15} />
              </button>
            )}
          </div>
          <div className="w-[140px] max-md:flex-1">
            <Select value={statusFilter} onValueChange={setStatusFilter} ariaLabel="Filter by status"
              options={[{ value: "all", label: "All statuses" }, ...statusOptions]} />
          </div>
          <div className="w-[144px] max-md:flex-1">
            <Select value={completion} onValueChange={setCompletion} ariaLabel="Filter by progress"
              options={[
                { value: "all", label: "Any progress" },
                { value: "behind", label: "Behind · <50%" },
                { value: "ontrack", label: "On track" },
                { value: "done", label: "Done · 100%" },
                { value: "unfilled", label: "Unfilled · 0%" },
              ]} />
          </div>
          <div className="w-[166px] max-md:flex-1">
            <Select value={sort} onValueChange={setSort} ariaLabel="Sort goals"
              options={[
                { value: "weight", label: "Sort · Weight" },
                { value: "scoreDesc", label: "Sort · Score high→low" },
                { value: "scoreAsc", label: "Sort · Score low→high" },
                { value: "name", label: "Sort · Name A→Z" },
                { value: "recent", label: "Sort · Recently updated" },
              ]} />
          </div>
          {props.canPickTeam && (
            <div className="w-[190px] max-md:flex-1">
              <Select value={props.scopeEmp} onValueChange={(v) => go({ week: props.weekStart, emp: v })} searchable searchPlaceholder="Search people…" ariaLabel="Filter by team member"
                options={[{ value: "all", label: !props.me.isAdmin ? "My team" : "All team members" }, ...props.employees.map((e) => ({ value: e.id, label: e.name }))]} />
            </div>
          )}

          {/* Week nav */}
          <div className="inline-flex items-center rounded-full border border-hairline overflow-hidden">
            <button type="button" aria-label="Previous week" onClick={() => go({ week: props.prevWeek, emp: props.scopeEmp })} className={`cursor-pointer px-2.5 py-1.5 hover:bg-surface-soft ${FOCUS_RING}`}><ChevronLeft size={17} /></button>
            <span className="px-3 py-1.5 inline-flex items-center gap-2 font-bold text-ink-strong text-[13.5px] tabular-nums border-x border-hairline">
              <CalendarDays size={15} className="text-ink-muted" />{props.weekLabel}
            </span>
            <button type="button" aria-label="Next week" onClick={() => go({ week: props.nextWeek, emp: props.scopeEmp })} className={`cursor-pointer px-2.5 py-1.5 hover:bg-surface-soft ${FOCUS_RING}`}><ChevronRight size={17} /></button>
          </div>
          {!props.isCurrentWeek && (
            <button type="button" onClick={() => go({ week: props.thisWeek, emp: props.scopeEmp })} className={`cursor-pointer px-3.5 py-1.5 rounded-full border border-hairline font-bold text-[13px] text-ink-soft hover:text-ink-strong ${FOCUS_RING}`}>This week</button>
          )}
          {props.canPickTeam && (
            <button type="button" role="switch" aria-checked={showArchived} onClick={() => setShowArchived((v) => !v)} className={`cursor-pointer inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors ${FOCUS_RING}`}
              style={showArchived ? { background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", borderColor: "var(--color-altus-red)", color: "var(--color-altus-red-deep)" } : { borderColor: "var(--color-hairline)", color: "var(--color-ink-soft)" }}>
              <span aria-hidden className="inline-flex h-[16px] w-7 shrink-0 items-center rounded-full p-0.5 transition-colors" style={{ background: showArchived ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}>
                <span className="size-[12px] rounded-full bg-white transition-transform" style={{ transform: showArchived ? "translateX(12px)" : "translateX(0)" }} />
              </span>
              Archived
            </button>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-altus-red hover:bg-altus-red/[0.06] ${FOCUS_RING}`}>
                <X size={14} strokeWidth={2.6} /> Clear {activeFilterCount}
              </button>
            )}
            <span className="text-[13px] font-bold text-ink-soft tabular-nums whitespace-nowrap">
              {displayed.length}{activeFilterCount > 0 && displayed.length !== visible.length ? ` of ${visible.length}` : ""} goal{displayed.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Quick-filter chips — one tap to the buckets managers scan for. Drives
            the same `completion` state as the Progress dropdown (single source). */}
        {totalCount > 0 && (
          <div className="mt-3 pt-3 border-t border-hairline">
            <BoardQuickChips
              value={quickChip}
              counts={chipCounts}
              onSelect={(v) => setCompletion(v)}
            />
          </div>
        )}
      </div>

      {/* Body --------------------------------------------------------- */}
      {showingAll ? (
        personNav.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex items-start gap-6">
            {/* Left rail — searchable "jump to person" directory (sticky). */}
            <BoardPersonNav people={personNav} activeId={activePerson} onJump={jumpToPerson} />

            {/* Right — the grouped goal sections. */}
            <div className="min-w-0 flex-1">
              {grouped.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-10 text-center">
                  <p className="text-[15px] font-bold text-ink-strong">No goals match these filters</p>
                  <p className="mt-1 text-[13.5px] font-medium text-ink-muted">
                    The team is still here — use the list on the left to find anyone.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`mt-3 cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-altus-red px-4 py-2 text-[13px] font-bold text-white ${FOCUS_RING}`}
                  >
                    <X size={14} strokeWidth={2.6} /> Clear filters
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {grouped.map(([empId, g]) => (
                    <section
                      key={empId}
                      data-person-id={empId}
                      ref={(el) => registerSection(empId, el)}
                      className="scroll-mt-4"
                    >
                      <MemberHeader
                        name={g.name}
                        role={props.roleById?.[empId] ?? null}
                        goalCount={g.rows.filter((r) => !r.archived).length}
                        score={weeklyScore(g.rows.filter((r) => !r.archived))}
                        weightTotal={weightTotalByEmp.get(empId) ?? 0}
                        employeeId={empId}
                        weekStart={props.weekStart}
                        canBalance={canBalance(empId)}
                        collapsed={!!collapsed[empId]}
                        onToggle={() => toggleCollapsed(empId)}
                      />
                      {/* #2 — collapsible: this employee's cards hide when collapsed.
                          reduced-motion-safe (a plain conditional, no height anim). */}
                      {!collapsed[empId] && (
                        <div className="flex flex-col gap-3.5 wg-rise">
                          {g.rows.map((goal, i) => (
                            <div key={goal.id} className="wg-rise" style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}>
                              <GoalCard
                                goal={goal}
                                srNo={i + 1}
                                canManage={canManage(goal.employeeId)}
                                canReport={canReport(goal.employeeId)}
                                canReview={canManage(goal.employeeId)}
                                employeeWeightTotal={weightTotalByEmp.get(goal.employeeId) ?? 0}
                                autoFocus={props.focusId === goal.id}
                                {...sharedCardProps}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Single-person budget bar — live weight total toward 100. Only when
              there ARE goals planned in this week (singleWeightTotal>0); a view
              showing only visiting/target-date goals has no week budget to show. */}
          {singleWeightTotal > 0 && (
            <WeightBudgetBar
              total={singleWeightTotal}
              employeeId={props.scopeEmp}
              weekStart={props.weekStart}
              canBalance={!showingAll && canBalance(props.scopeEmp)}
            />
          )}

          {displayed.length === 0 && visible.length > 0 && (
            <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-8 text-center">
              <p className="text-[15px] font-bold text-ink-strong">No goals match these filters</p>
              <button
                type="button"
                onClick={clearFilters}
                className={`mt-3 cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-altus-red px-4 py-2 text-[13px] font-bold text-white ${FOCUS_RING}`}
              >
                <X size={14} strokeWidth={2.6} /> Clear filters
              </button>
            </div>
          )}
          {displayed.map((goal, i) => (
            <div key={goal.id} className="wg-rise" style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}>
              <GoalCard
                goal={goal}
                srNo={i + 1}
                canManage={canManage(goal.employeeId)}
                canReport={canReport(goal.employeeId)}
                canReview={canManage(goal.employeeId)}
                employeeWeightTotal={singleWeightTotal}
                autoFocus={props.focusId === goal.id}
                {...sharedCardProps}
              />
            </div>
          ))}
          <GoalQuickAdd
            employeeId={props.scopeEmp}
            weekStart={props.weekStart}
            clientOptions={props.clientOptions}
            subjectOptions={props.subjectOptions}
            currentWeight={singleWeightTotal}
            currentCount={activeVisible.length}
            catalog={props.catalog}
          />
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
/* Weight-budget meter + Balance-to-100 control                         */
/* ------------------------------------------------------------------ */

function WeightMeter({ total }: { total: number }) {
  // No goals planned in this week → nothing to budget; don't show a misleading
  // "0/100 under" meter (e.g. when every goal shown is a visiting/target-date one).
  if (total <= 0) return null;
  const ok = total === WEIGHT_BUDGET;
  const over = total > WEIGHT_BUDGET;
  const pct = Math.min(100, (total / WEIGHT_BUDGET) * 100);
  // Exactly 100 = green (balanced); OVER = brand-red (a real problem); UNDER =
  // amber (just not allocated yet — NOT an alarm). This is the "98 shown in
  // alarm-red looks over" fix.
  const tone = ok ? "green" : over ? "altus-red" : "amber";
  const textColor = ok
    ? "var(--color-green-deep)"
    : over
      ? "var(--color-altus-red-deep)"
      : "var(--color-amber-deep)";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-flex h-2 w-20 overflow-hidden rounded-full"
        style={{ background: "var(--color-surface-track)" }}
      >
        <span
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
          }}
        />
      </span>
      <span
        className="text-[12.5px] font-bold tabular-nums whitespace-nowrap"
        style={{ color: textColor }}
      >
        {total} of {WEIGHT_BUDGET} planned
        {over ? (
          <span className="ml-1 font-semibold">· {total - WEIGHT_BUDGET} over</span>
        ) : !ok ? (
          <span className="ml-1 font-semibold">· {WEIGHT_BUDGET - total} left</span>
        ) : null}
      </span>
    </span>
  );
}

/** Shared Balance-to-100 button (calls the server action in a transition). */
function BalanceButton({
  employeeId,
  weekStart,
}: {
  employeeId: string;
  weekStart: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await balanceWeeklyGoalWeights({ employeeId, weekStart });
          if (!res.ok) {
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({
            message: res.updated > 0 ? `Re-balanced ${res.updated} goal${res.updated === 1 ? "" : "s"} to ${res.budget}.` : `Already at ${res.budget}.`,
            type: "success",
          });
          router.refresh();
        })
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
      style={{
        borderColor: "color-mix(in srgb, var(--color-altus-red) 36%, transparent)",
        background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
        color: "var(--color-altus-red-deep)",
      }}
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Scale size={13} strokeWidth={2.4} />}
      Balance to {WEIGHT_BUDGET}
    </button>
  );
}

/** Single-person header bar: live weight budget + Balance-to-100 when off. */
function WeightBudgetBar({
  total,
  employeeId,
  weekStart,
  canBalance,
}: {
  total: number;
  employeeId: string;
  weekStart: string;
  canBalance: boolean;
}) {
  const ok = total === WEIGHT_BUDGET;
  return (
    <div
      className="wg-rise flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5"
      style={{
        background: "var(--color-surface-card)",
        borderColor: ok ? "var(--color-hairline)" : "color-mix(in srgb, var(--color-altus-red) 28%, var(--color-hairline))",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        animationDelay: "100ms",
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--color-ink-subtle)" }}>
        Weight budget
      </span>
      <WeightMeter total={total} />
      {canBalance && !ok && (
        <span className="ml-auto">
          <BalanceButton employeeId={employeeId} weekStart={weekStart} />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-member section header (admin "all" view)                         */
/* ------------------------------------------------------------------ */

function MemberHeader({
  name,
  role,
  goalCount,
  score,
  weightTotal,
  employeeId,
  weekStart,
  canBalance,
  collapsed,
  onToggle,
}: {
  name: string;
  role: string | null;
  goalCount: number;
  score: number;
  weightTotal: number;
  employeeId: string;
  weekStart: string;
  canBalance: boolean;
  /** #2 — whether this employee's cards are collapsed (chevron + aria-expanded). */
  collapsed: boolean;
  onToggle: () => void;
}) {
  const ok = weightTotal === WEIGHT_BUDGET;
  return (
    <div
      className="mb-3.5 flex items-center justify-between gap-4 flex-wrap rounded-xl border px-4 py-3 sticky top-2 z-20"
      style={{
        background: "color-mix(in srgb, var(--color-surface-card) 88%, transparent)",
        backdropFilter: "blur(10px) saturate(1.4)",
        WebkitBackdropFilter: "blur(10px) saturate(1.4)",
        borderColor: "var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05), 0 8px 24px -18px rgba(15,23,42,0.22)",
      }}
    >
      {/* Identity: chevron toggle + avatar + name + role badge + subline. The
          whole identity block is a real <button> that collapses/expands this
          employee's cards (Enter/Space toggle; aria-expanded reflects state). */}
      <button
        type="button"
        data-person-toggle
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}'s goals`}
        className={`flex items-center gap-3 min-w-0 text-left cursor-pointer rounded-lg -m-1 p-1 hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
      >
        <ChevronDown
          size={20}
          aria-hidden
          className="shrink-0 transition-transform motion-reduce:transition-none"
          style={{
            color: "var(--color-ink-subtle)",
            transform: collapsed ? "rotate(-90deg)" : "none",
          }}
        />
        <Avatar name={name} size={42} />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2
              className="truncate font-bold"
              style={{
                fontSize: 18,
                lineHeight: 1.1,
                color: "var(--color-ink-strong)",
                letterSpacing: "-0.01em",
              }}
            >
              {name}
            </h2>
            {role && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
                style={{
                  background: "var(--color-surface-soft)",
                  color: "var(--color-ink-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {role}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2.5 flex-wrap">
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
              {goalCount} {goalCount === 1 ? "goal" : "goals"}
            </p>
            {weightTotal > 0 && (
              <>
                <span aria-hidden style={{ color: "var(--color-hairline-strong)" }}>·</span>
                <WeightMeter total={weightTotal} />
              </>
            )}
          </div>
        </div>
      </button>

      {/* Balance-to-100 — rendered OUTSIDE the toggle button (no nested
          buttons). Stays in the header per spec. */}
      {canBalance && !ok && weightTotal > 0 && (
        <BalanceButton employeeId={employeeId} weekStart={weekStart} />
      )}

      {/* Weekly score */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            Weekly Score
          </p>
          <p
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 28,
              color: score >= 60 ? "var(--color-green-deep)" : "var(--color-ink-strong)",
            }}
          >
            {score}%
          </p>
        </div>
        <ScoreRing value={score} size={52} label={`${score}% weekly score for ${name}`} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
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
        <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
          No weekly goals yet
        </h3>
        <p
          className="mx-auto mt-2 max-w-[44ch] font-medium"
          style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}
        >
          Pick a team member from the toolbar above, then add their top priorities
          for the week — five is the floor, weights total {WEIGHT_BUDGET}.
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
              <Dialog.Title className="font-bold text-ink-strong" style={{ fontSize: 19, letterSpacing: "-0.01em" }}>
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
                  className={`rounded-pill px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px ${FOCUS_RING}`}
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
                className={`w-full rounded-md border px-3.5 py-2.5 text-[15px] focus:border-altus-red mb-4 ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={pending}
                  className={`rounded-pill px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={performDelete}
                  disabled={!confirmable || pending}
                  className={`inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px ${FOCUS_RING}`}
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
