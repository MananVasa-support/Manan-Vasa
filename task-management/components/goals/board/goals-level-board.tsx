"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, Search, X, Target, Trash2, List, Columns3, Star, Plus, Download, ArrowUpDown } from "lucide-react";
import { Select } from "@/components/ui/select";
import { BoardQuickChips, type QuickChip } from "@/components/weekly-goals/board-quick-chips";
import { fireToast } from "@/lib/toast";
import { goalPolicy } from "@/lib/goals/policy";
import { rollupPct } from "@/lib/goals/derive";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  fyStartYearOf,
} from "@/lib/goals/types";
import {
  type GoalDTO,
  effectiveGoalPct,
  periodKeyLabel,
  periodKeyShort,
  fyLabel,
  parentPeriodKeyOf,
  childLevelOf,
  categoryStyle,
  PERIOD_LABEL,
} from "@/components/goals/cascade/util";
import { useOptimisticGoals } from "@/components/goals/canvas/optimistic";
import {
  moveGoalToPeriod,
  archiveGoal,
  reorderGoals,
} from "@/app/(app)/goals/cascade/actions";
import { GoalBoardCard, ProgressRing, type SharedCardProps } from "./goal-board-card";
import { BoardQuickAdd, type BoardQuickAddHandle } from "./board-quick-add";
import { GoalsBulkUpload } from "./goals-bulk-upload";
import { KanbanBoard } from "./kanban-view";
import type { GoalsLevelBoardProps } from "./types";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const BUCKET_DROP_PREFIX = "bucket:";

/** localStorage key for the List ⇄ Kanban preference (shared by the level pages). */
const VIEW_STORE_KEY = "goals-board-view";

/** Yearly view tabs — a compact functional strip in the header (sits where the
 *  tagline was, so it adds a feature without adding header height). */
type YearTabId = "summary" | "individual" | "shared";
const YEAR_TABS: { id: YearTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "individual", label: "Individual Goals" },
  { id: "shared", label: "Shared Goals" },
];

/** Stable empty-children identity — keeps React.memo effective for the
 *  (majority of) cards that have no children. */
const EMPTY_CHILDREN: GoalDTO[] = [];

/** Sort modes for the rendered list. Sr. No. keeps the drag-reorder line alive;
 *  every other key is a read-only projection (drag is paused while it's on). */
type SortKey = "position" | "score-desc" | "score-asc" | "weight" | "risk" | "az";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "position", label: "Sr. No." },
  { value: "score-desc", label: "Score high → low" },
  { value: "score-asc", label: "Score low → high" },
  { value: "weight", label: "Weight" },
  { value: "risk", label: "At-risk first" },
  { value: "az", label: "A → Z" },
];

/** Status band for the risk sort / export status column (0 behind → 2 done). */
function statusBand(pct: number): 0 | 1 | 2 {
  return pct >= 100 ? 2 : pct >= 50 ? 1 : 0;
}

/** CSV field escape — quote anything with a comma, quote or newline. */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Premium score dial — a bespoke SVG ring with an Altus-red gradient arc, a
 * soft red glow, rounded cap and a star core. Load-neutral (GPU CSS only), the
 * glow pulse is reduced-motion-gated via `.wg-ring-glow`.
 */
function ScoreDial({ value, size = 68 }: { value: number; size?: number }): React.JSX.Element {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(5, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (v / 100) * circ;
  const gid = React.useId();
  const core = Math.round(size * 0.5);
  return (
    <span
      role="img"
      aria-label={`${v}% score`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block -rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-altus-red)" />
            <stop offset="100%" stopColor="var(--color-altus-red-deep)" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="color-mix(in srgb, var(--color-altus-red) 12%, transparent)" strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className="wg-ring-glow"
          style={{
            filter: "drop-shadow(0 0 5px color-mix(in srgb, var(--color-altus-red) 55%, transparent))",
            transition: "stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>
      <span
        className="absolute inline-flex items-center justify-center rounded-full"
        style={{
          width: core,
          height: core,
          background: "linear-gradient(150deg, color-mix(in srgb, var(--color-altus-red) 12%, var(--color-surface-card)), var(--color-surface-card))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 6px -3px color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
        }}
      >
        <Star
          size={Math.round(size * 0.27)}
          strokeWidth={2.2}
          style={{ color: "var(--color-altus-red)", fill: "color-mix(in srgb, var(--color-altus-red) 24%, transparent)" }}
        />
      </span>
    </span>
  );
}

/**
 * Mini health DONUT — a bespoke SVG breakdown of the bucket's status split
 * done(green) / on-track(#d97706) / behind(altus-red), with the goal total in
 * the centre. Static (reduced-motion-safe by construction), brand-colored,
 * load-neutral (pure SVG, no libs).
 */
function HealthDonut({
  done,
  ontrack,
  behind,
  size = 52,
}: {
  done: number;
  ontrack: number;
  behind: number;
  size?: number;
}): React.JSX.Element {
  const total = done + ontrack + behind;
  const stroke = Math.max(6, Math.round(size * 0.16));
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const segments: { v: number; color: string }[] = [
    { v: done, color: "var(--color-green)" },
    { v: ontrack, color: "#d97706" },
    { v: behind, color: "var(--color-altus-red)" },
  ];
  let acc = 0;
  return (
    <span
      role="img"
      aria-label={`${done} done, ${ontrack} on track, ${behind} behind`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90" aria-hidden>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--color-ink-strong) 8%, transparent)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((s, i) => {
            if (s.v <= 0) return null;
            const len = (s.v / total) * circ;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={offset}
              />
            );
          })}
      </svg>
      <span
        className="absolute tabular-nums"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: Math.round(size * 0.3),
          color: "var(--color-ink-strong)",
        }}
      >
        {total}
      </span>
    </span>
  );
}

/**
 * Goals LEVEL BOARD — the weekly-goals-board design (header + score card,
 * filter command bar, one card list, quick-add, drawers) applied to the GOALS
 * table for one level. Period pills double as ALWAYS-ON drop targets: drag a
 * card onto Q2 to re-quarter it (moveGoalToPeriod), drag within the list to
 * reorder (reorderGoals) — both optimistic through useOptimisticGoals.
 */
export function GoalsLevelBoard(props: GoalsLevelBoardProps) {
  const router = useRouter();
  const { goals, mutation } = useOptimisticGoals(props.goals);
  const fy = props.fyStartYear;

  // Option-A policy for the VIEWED person's board (one owner per board view).
  const policy = React.useMemo(
    () =>
      goalPolicy({
        isAdmin: props.isAdmin,
        isManagerOfOwner: props.managesViewed,
        isOwner: props.viewedEmployeeId === props.myEmployeeId,
      }),
    [props.isAdmin, props.managesViewed, props.viewedEmployeeId, props.myEmployeeId],
  );
  const canWrite = props.canWrite;

  /** Query-param navigation on the page's own path (shareable URLs). */
  const go = React.useCallback(
    (params: { emp?: string; fy?: number; period?: string }) => {
      const sp = new URLSearchParams();
      const emp = params.emp ?? props.viewedEmployeeId;
      if (emp && emp !== props.myEmployeeId) sp.set("emp", emp);
      const fyNext = params.fy ?? fy;
      if (fyNext !== fyStartYearOf(new Date())) sp.set("fy", String(fyNext));
      // Keep the selected bucket across person hops; an FY hop DROPS it (the
      // page re-defaults the bucket inside the new FY's keys).
      const period =
        params.period ?? (params.fy === undefined && props.level !== "year" ? props.periodKey : undefined);
      if (period) sp.set("period", period);
      const qs = sp.toString();
      router.push(`${props.basePath}${qs ? `?${qs}` : ""}` as Route);
    },
    [router, props.basePath, props.viewedEmployeeId, props.myEmployeeId, fy],
  );

  // ── Buckets at this level for the FY ────────────────────────────────
  const buckets = React.useMemo<string[]>(() => {
    if (props.level === "year") return [String(fy)];
    if (props.level === "quarter") return quartersOfFy(fy);
    return ([1, 2, 3, 4] as const).flatMap((q) => monthKeysOfQuarter(fy, q));
  }, [props.level, fy]);

  const levelGoals = React.useMemo(
    () => goals.filter((g) => g.period === props.level),
    [goals, props.level],
  );
  const countByBucket = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const g of levelGoals) m.set(g.periodKey, (m.get(g.periodKey) ?? 0) + 1);
    return m;
  }, [levelGoals]);

  /** This bucket's goals in Sr.-No. order — the list the board renders. */
  const inBucket = React.useMemo(
    () =>
      levelGoals
        .filter((g) => g.periodKey === props.periodKey)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)),
    [levelGoals, props.periodKey],
  );

  // ── View: classic list ⇄ Kanban columns (persisted; Yearly is list-only —
  //    one bucket makes columns meaningless). SSR renders "list"; the stored
  //    preference applies after mount so hydration stays clean. ─────────
  const [view, setView] = React.useState<"list" | "kanban">("list");
  React.useEffect(() => {
    if (props.level === "year") return;
    try {
      if (window.localStorage.getItem(VIEW_STORE_KEY) === "kanban") setView("kanban");
    } catch {
      /* storage unavailable — stay on list */
    }
  }, [props.level]);
  const pickView = React.useCallback((v: "list" | "kanban") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORE_KEY, v);
    } catch {
      /* non-fatal */
    }
  }, []);
  const kanban = view === "kanban" && props.level !== "year";

  // ── Header "+ New goal" → fires the SAME BoardQuickAdd composer (one create
  //    path). In Kanban the board-level quick-add isn't mounted, so hop to List
  //    first and open once it commits (pendingCompose effect). ──────────
  const quickAddRef = React.useRef<BoardQuickAddHandle>(null);
  const [pendingCompose, setPendingCompose] = React.useState(false);
  React.useEffect(() => {
    if (pendingCompose && !kanban) {
      quickAddRef.current?.open();
      setPendingCompose(false);
    }
  }, [pendingCompose, kanban]);
  const openComposer = React.useCallback(() => {
    if (kanban) {
      pickView("list");
      setPendingCompose(true);
    } else {
      quickAddRef.current?.open();
    }
  }, [kanban, pickView]);

  // ── Filters (search + quick chips) ──────────────────────────────────
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [completion, setCompletion] = React.useState<QuickChip>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("position");
  // Yearly-only view tab (Summary / Individual / Shared / History) — filters
  // the list in-place; the strip lives in the header where the tagline was.
  const [yearTab, setYearTab] = React.useState<YearTabId>("summary");

  const filterGoal = React.useCallback(
    (g: GoalDTO) => {
      if (completion !== "all") {
        const p = effectiveGoalPct(g);
        if (completion === "behind" && p >= 50) return false;
        if (completion === "ontrack" && (p < 50 || p >= 100)) return false;
        if (completion === "done" && p < 100) return false;
        if (completion === "unfilled" && p > 0) return false;
      }
      const q = deferredSearch.trim().toLowerCase();
      if (q) {
        const hay = `${g.title} ${g.area ?? ""} ${g.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [deferredSearch, completion],
  );

  // Yearly view-tab predicate (Individual = solo, Shared = has team); Summary +
  // every non-year level pass through.
  const passesYearTab = React.useCallback(
    (g: GoalDTO) => {
      if (props.level !== "year" || yearTab === "summary") return true;
      const shared = (g.teamInvolved?.length ?? 0) > 0;
      return yearTab === "shared" ? shared : !shared;
    },
    [props.level, yearTab],
  );

  // Sort comparator — Sr. No. keeps the position order (drag stays live); every
  // other key sorts a COPY (drag paused). Ties fall back to Sr. No. for stability.
  const sortCmp = React.useCallback(
    (a: GoalDTO, b: GoalDTO): number => {
      const posTie = a.position - b.position || a.title.localeCompare(b.title);
      switch (sortKey) {
        case "score-desc":
          return effectiveGoalPct(b) - effectiveGoalPct(a) || posTie;
        case "score-asc":
          return effectiveGoalPct(a) - effectiveGoalPct(b) || posTie;
        case "weight":
          return b.weight - a.weight || posTie;
        case "risk":
          return (
            statusBand(effectiveGoalPct(a)) - statusBand(effectiveGoalPct(b)) ||
            effectiveGoalPct(a) - effectiveGoalPct(b) ||
            posTie
          );
        case "az":
          return a.title.localeCompare(b.title) || posTie;
        default:
          return 0; // "position" — inBucket is already Sr.-No. ordered
      }
    },
    [sortKey],
  );

  const displayed = React.useMemo(() => {
    const list = inBucket.filter((g) => filterGoal(g) && passesYearTab(g));
    return sortKey === "position" ? list : [...list].sort(sortCmp);
  }, [inBucket, filterGoal, passesYearTab, sortKey, sortCmp]);

  // Per-tab counts for the header strip badges (Yearly only).
  const yearTabCounts = React.useMemo<Record<YearTabId, number> | null>(() => {
    if (props.level !== "year") return null;
    let individual = 0;
    let shared = 0;
    for (const g of inBucket) {
      if ((g.teamInvolved?.length ?? 0) > 0) shared++;
      else individual++;
    }
    return { summary: inBucket.length, individual, shared };
  }, [props.level, inBucket]);

  /** Kanban: every bucket's (filtered, Sr.-No.-sorted) goals in one pass. */
  const goalsByBucket = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const k of buckets) m.set(k, []);
    for (const g of levelGoals) {
      if (!filterGoal(g)) continue;
      m.get(g.periodKey)?.push(g);
    }
    for (const list of m.values())
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    return m;
  }, [buckets, levelGoals, filterGoal]);

  // Chip counts scope with the view: the selected bucket in list view, the
  // whole level in Kanban (the chips filter every column).
  const chipScope = kanban ? levelGoals : inBucket;
  const chipCounts = React.useMemo<Record<QuickChip, number>>(() => {
    const c: Record<QuickChip, number> = { all: chipScope.length, behind: 0, ontrack: 0, done: 0, unfilled: 0 };
    for (const g of chipScope) {
      const p = effectiveGoalPct(g);
      if (p < 50) c.behind++;
      if (p >= 50 && p < 100) c.ontrack++;
      if (p >= 100) c.done++;
      if (p <= 0) c.unfilled++;
    }
    return c;
  }, [chipScope]);

  const visibleCount = kanban
    ? [...goalsByBucket.values()].reduce((n, l) => n + l.length, 0)
    : displayed.length;
  const scopeTotal = kanban ? levelGoals.length : inBucket.length;

  const activeFilterCount = (search.trim() ? 1 : 0) + (completion !== "all" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setCompletion("all");
  };

  // ── Headline score for the scope — the canonical WEIGHTED rollup over the
  //    adopted goals (lib/goals/derive `rollupPct`; no local average copy). ──
  const adopted = React.useMemo(() => inBucket.filter((g) => g.adopted), [inBucket]);
  const score = rollupPct(inBucket) ?? 0;
  const doneCount = adopted.filter((g) => effectiveGoalPct(g) >= 100).length;

  // ── Export the CURRENTLY-VISIBLE goals to CSV (client-side Blob) ──────
  const exportCsv = React.useCallback(() => {
    const header = [
      "Sr", "Goal", "Area", "Category", "Weight", "% done", "Status", "Incentive", "Monthly-Master", "Origin",
    ];
    const body = displayed.map((g, i) => {
      const pct = effectiveGoalPct(g);
      const status = pct >= 100 ? "Done" : pct >= 50 ? "On track" : "At risk";
      const incentive = g.incentiveEnabled
        ? `Yes${g.incentiveAmount ? ` ₹${g.incentiveAmount}` : ""}${g.incentiveKind ? ` (${g.incentiveKind})` : ""}`
        : "No";
      return [
        String(i + 1),
        g.title,
        g.area ?? "",
        categoryStyle(g.category, false).label,
        String(g.weight),
        String(pct),
        status,
        incentive,
        g.monthlyMasterRef?.label ?? "",
        g.source === "cascade" ? "Auto" : "Manual",
      ];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const levelSlug = props.level === "year" ? "yearly" : props.level === "quarter" ? "quarterly" : "monthly";
    const fyName = `FY${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${levelSlug}-goals-${fyName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [displayed, props.level, fy]);

  // ── Quick-add parent: the level-above goal OWNING a bucket (per-bucket
  //    so the Kanban columns each resolve their own). ──────────────────
  const parentOf = React.useCallback(
    (bucketKey: string): { id: string; title: string } | null => {
      const parentKey = parentPeriodKeyOf(bucketKey);
      if (!parentKey) return null;
      const parentLevel = props.level === "quarter" ? "year" : "quarter";
      const owner = goals
        .filter((g) => g.period === parentLevel && g.periodKey === parentKey)
        .sort((a, b) => a.position - b.position)[0];
      return owner ? { id: owner.id, title: owner.title } : null;
    },
    [goals, props.level],
  );
  const parentGoal = React.useMemo(() => parentOf(props.periodKey), [parentOf, props.periodKey]);

  const areaOptions = React.useMemo(
    () => [...new Set(goals.map((g) => g.area).filter((a): a is string => !!a))].sort(),
    [goals],
  );

  /** Direct children of every goal (the payload holds ALL levels) — feeds the
   *  drawer's allocation strip + Rebalance without any extra fetch. */
  const childrenByParent = React.useMemo(() => {
    const m = new Map<string, GoalDTO[]>();
    for (const g of goals) {
      if (!g.parentGoalId) continue;
      const list = m.get(g.parentGoalId);
      if (list) list.push(g);
      else m.set(g.parentGoalId, [g]);
    }
    return m;
  }, [goals]);

  // ── Drag & drop (always on): reorder in-bucket + drop on a period pill ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Drag-reorder is only coherent in Sr.-No. order — a custom sort would fight
  // the persisted position, so pause drag whenever a sort (or filter) is active.
  const dragDisabled =
    !canWrite || !policy.canReorder || activeFilterCount > 0 || sortKey !== "position";
  const [activeDrag, setActiveDrag] = React.useState<GoalDTO | null>(null);
  // Stable, SSR-safe DndContext id. Without it dnd-kit falls back to a
  // module-global counter that drifts between the server render (fresh) and the
  // client (StrictMode double-mount / prior instances) → the accessibility
  // `aria-describedby="DndDescribedBy-N"` mismatches and React logs a hydration
  // error. useId() produces the identical value on both sides.
  const dndId = React.useId();

  /** POINTER-FIRST collision detection. The board rows are full-width, so any
   *  rect-based algorithm (closestCorners/-Center) lets a sibling ROW out-score
   *  a small period pill or a Kanban column even when the cursor is dead-centre
   *  on it — drops silently no-op'd ("DnD feels absent"). Whatever droppable is
   *  actually UNDER the cursor wins; the rect math stays as the fallback for
   *  the keyboard sensor (which has no pointer). */
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const underPointer = pointerWithin(args);
    return underPointer.length > 0 ? underPointer : closestCorners(args);
  }, []);

  const onDragStart = React.useCallback(
    (e: DragStartEvent) => {
      setActiveDrag(levelGoals.find((g) => g.id === String(e.active.id)) ?? null);
    },
    [levelGoals],
  );

  /** Same-level re-bucket (pill drop, Kanban column drop, cross-column card
   *  drop) — the owner-open `canReQuarter` line, optimistic, with live Undo.
   *  Cross-LEVEL moves stay in the "Move to…" drawer (canRehomeLevel). */
  const moveToBucket = React.useCallback(
    (g: GoalDTO, key: string) => {
      if (!policy.canReQuarter) return; // server re-derives the same line
      if (key === g.periodKey) return;
      const from = { periodKey: g.periodKey, position: g.position };
      void mutation
        .mutate(
          { type: "update", id: g.id, fields: { periodKey: key, position: 9_999 } },
          () => moveGoalToPeriod({ id: g.id, periodKey: key }),
        )
        .then((ok) => {
          if (!ok) return;
          fireToast({
            message: `Moved to ${periodKeyLabel(key)}`,
            type: "success",
            actionLabel: "Undo",
            action: () => {
              void mutation
                .mutate(
                  { type: "update", id: g.id, fields: { periodKey: from.periodKey, position: from.position } },
                  () => moveGoalToPeriod({ id: g.id, periodKey: from.periodKey }),
                )
                .then((undone) => {
                  if (undone)
                    fireToast({ message: `Moved back to ${periodKeyLabel(from.periodKey)}`, type: "success" });
                });
            },
          });
        });
    },
    [mutation, policy.canReQuarter],
  );

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = e;
      if (!over) return;
      const g = levelGoals.find((x) => x.id === String(active.id));
      if (!g) return;
      const overId = String(over.id);

      // 1) Dropped on a period PILL (list view) or a Kanban COLUMN → re-bucket.
      if (overId.startsWith(BUCKET_DROP_PREFIX)) {
        moveToBucket(g, overId.slice(BUCKET_DROP_PREFIX.length));
        return;
      }

      if (overId === g.id) return;
      const target = levelGoals.find((x) => x.id === overId);
      if (!target) return;

      // 2) Dropped on a card in ANOTHER bucket (Kanban cross-column) → re-bucket.
      if (target.periodKey !== g.periodKey) {
        moveToBucket(g, target.periodKey);
        return;
      }

      // 3) Dropped on a sibling card → persist the new Sr.-No. order.
      if (!policy.canReorder) return; // server re-derives the same line
      const bucket = levelGoals
        .filter((x) => x.periodKey === g.periodKey)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
      const oldIndex = bucket.findIndex((x) => x.id === g.id);
      const newIndex = bucket.findIndex((x) => x.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      const ids = arrayMove(bucket, oldIndex, newIndex).map((x) => x.id);
      void mutation.mutate({ type: "reorder", ids }, () => reorderGoals(ids));
    },
    [levelGoals, mutation, moveToBucket, policy.canReorder],
  );

  // ── ARIA-LIVE narration for the drag (screen-reader parity) ─────────
  // dnd-kit renders these through its own hidden aria-live region; the
  // keyboard path is the SAME DndContext — space lifts, arrows walk sibling
  // cards AND the period pills (droppables count as targets), space drops.
  const nameDropTarget = React.useCallback(
    (id: string | number | undefined): string | null => {
      if (id == null) return null;
      const s = String(id);
      if (s.startsWith(BUCKET_DROP_PREFIX))
        return `the ${periodKeyLabel(s.slice(BUCKET_DROP_PREFIX.length))} period`;
      const g = levelGoals.find((x) => x.id === s);
      return g ? `“${g.title}”` : null;
    },
    [levelGoals],
  );
  const dndAnnouncements = React.useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        return `Picked up ${name}. Use the arrow keys to reorder or to reach a period pill, space to drop, escape to cancel.`;
      },
      onDragOver({ active, over }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        const target = nameDropTarget(over?.id);
        return target ? `${name} is over ${target}.` : `${name} is no longer over a drop target.`;
      },
      onDragEnd({ active, over }) {
        const name = nameDropTarget(active.id) ?? "the goal";
        const target = nameDropTarget(over?.id);
        if (!target) return `Dropped ${name}. No changes made.`;
        const overId = String(over?.id ?? "");
        if (overId.startsWith(BUCKET_DROP_PREFIX)) return `Moved ${name} to ${target}.`;
        // Kanban cross-column drop ON a card actually re-buckets — say so.
        const a = levelGoals.find((x) => x.id === String(active.id));
        const o = levelGoals.find((x) => x.id === overId);
        if (a && o && a.periodKey !== o.periodKey)
          return `Moved ${name} to ${periodKeyLabel(o.periodKey)}.`;
        return `Dropped ${name} next to ${target}.`;
      },
      onDragCancel({ active }) {
        return `Cancelled — ${nameDropTarget(active.id) ?? "the goal"} returned to its place.`;
      },
    }),
    [nameDropTarget, levelGoals],
  );
  const dndInstructions = React.useMemo<ScreenReaderInstructions>(
    () => ({
      draggable:
        "To pick up a goal, press space or enter on its drag handle. Use the arrow keys to reorder it among its neighbours, or keep going to reach a period pill and re-period it. Press space or enter again to drop, escape to cancel. Cross-level moves live in the card's Move to… menu.",
    }),
    [],
  );

  // ── Archive (soft-delete → Recycle Bin) ─────────────────────────────
  const [archiveTarget, setArchiveTarget] = React.useState<GoalDTO | null>(null);
  const requestArchive = React.useCallback((g: GoalDTO) => setArchiveTarget(g), []);

  const sharedCardProps = React.useMemo<SharedCardProps>(
    () => ({
      policy,
      canWrite,
      roster: props.roster,
      areaOptions,
      fyStartYear: fy,
      mutation,
      onRequestArchive: requestArchive,
      dragDisabled,
    }),
    [policy, canWrite, props.roster, areaOptions, fy, mutation, requestArchive, dragDisabled],
  );

  const isSelf = props.viewedEmployeeId === props.myEmployeeId;
  const childLabel = childLevelOf(props.level);

  return (
    <div
      className="relative min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, var(--color-surface-soft) 0%, color-mix(in srgb, var(--color-surface-track) 60%, var(--color-surface-soft)) 100%)",
        color: "var(--color-ink-strong)",
      }}
    >
      <div className="relative mx-auto max-w-[1180px] px-10 max-md:px-4 pt-8 pb-24">
        {/* ── HEADER — ONE unified command bar: identity + tabs · overview
            (dial + donut) · person + FY, all in a single creative band. ── */}
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

          <div className="relative flex items-center gap-6 px-7 py-5 max-xl:flex-wrap max-md:gap-4 max-md:px-4">
            {/* 1 · identity + tabs */}
            <div className="min-w-0 flex-1 max-xl:w-full max-xl:flex-none">
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
                Goals · {fyLabel(fy)} · {isSelf ? "My goals" : props.viewedName}
              </div>
              <h1
                className="mt-1"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, color: "var(--color-ink-strong)", fontSize: "clamp(26px, 2.6vw, 40px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
              >
                {props.heading}
              </h1>
              {props.level !== "year" ? (
                <p className="mt-1.5 max-w-[52ch] font-medium" style={{ fontSize: 13.5, lineHeight: 1.4, color: "var(--color-ink-muted)" }}>
                  {props.tagline ?? `${periodKeyLabel(props.periodKey)} — each goal cascades down a level (${childLabel}).`}
                </p>
              ) : yearTabCounts ? (
                <div className="mt-2 -ml-1 flex items-center gap-0.5 flex-wrap" role="tablist" aria-label="Goal views">
                  {YEAR_TABS.map((t) => {
                    const active = yearTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setYearTab(t.id)}
                        className={`relative cursor-pointer rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition-colors ${FOCUS_RING}`}
                        style={{
                          color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)",
                          background: active ? "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" : "transparent",
                        }}
                      >
                        {t.label}
                        <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums" style={{ background: active ? "color-mix(in srgb, var(--color-altus-red) 18%, transparent)" : "var(--color-surface-soft)", color: active ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}>
                          {yearTabCounts[t.id]}
                        </span>
                        {active && (
                          <span className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* 2 · overview — dial + score + donut (divider-separated) */}
            {inBucket.length > 0 && (
              <div
                className="flex shrink-0 items-center gap-4 self-stretch border-l pl-6 max-xl:self-auto max-xl:border-l-0 max-xl:pl-0"
                style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 16%, var(--color-hairline))" }}
              >
                <ScoreDial value={score} />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
                    {periodKeyShort(props.periodKey)} score
                  </div>
                  <div
                    className="tabular-nums leading-[0.95]"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: 38,
                      backgroundImage: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {score}%
                  </div>
                  <div className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--color-ink-muted)" }}>
                    {adopted.length > 0 ? (
                      <>
                        <span className="tabular-nums" style={{ color: "var(--color-ink-strong)" }}>{doneCount}/{adopted.length}</span> done
                      </>
                    ) : (
                      "no adopted goals"
                    )}
                  </div>
                </div>
                <div
                  className="flex items-center gap-2.5 border-l pl-4"
                  style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 12%, var(--color-hairline))" }}
                >
                  <HealthDonut done={chipCounts.done} ontrack={chipCounts.ontrack} behind={chipCounts.behind + chipCounts.unfilled} />
                  <div className="flex flex-col gap-0.5 text-[10.5px] font-bold tabular-nums">
                    <span style={{ color: "var(--color-green-deep)" }}>● {chipCounts.done} done</span>
                    <span style={{ color: "#b45309" }}>● {chipCounts.ontrack} on&nbsp;track</span>
                    <span style={{ color: "var(--color-altus-red-deep)" }}>● {chipCounts.behind + chipCounts.unfilled} behind</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3 · person + FY (divider-separated) */}
            <div
              className="flex shrink-0 flex-col items-center gap-2.5 self-stretch justify-center border-l pl-6 max-xl:w-full max-xl:flex-row max-xl:justify-between max-xl:border-l-0 max-xl:pl-0"
              style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 16%, var(--color-hairline))" }}
            >
              {/* Name selector — a bold, glowing custom pill (avatar + "VIEWING"
                  eyebrow + the unstyled Select as the name). */}
              {props.roster.length > 1 && (
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
                      {props.viewedName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[8.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--color-altus-red-deep)" }}>
                        Viewing
                      </div>
                      <Select
                        value={props.viewedEmployeeId}
                        onValueChange={(v) => go({ emp: v })}
                        searchable
                        searchPlaceholder="Search people…"
                        ariaLabel="View another person's goals"
                        unstyled
                        className="flex w-full cursor-pointer items-center gap-1 text-left text-[13.5px] font-bold text-ink-strong"
                        options={props.roster.map((r) => ({
                          value: r.id,
                          label: r.id === props.myEmployeeId ? `${r.name} (me)` : r.name,
                        }))}
                      />
                    </div>
                  </div>
                </div>
              )}
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
                  aria-label="Previous financial year"
                  onClick={() => go({ fy: fy - 1 })}
                  className={`cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
                >
                  <ChevronLeft size={17} strokeWidth={2.4} />
                </button>
                <span
                  className="px-3.5 py-1.5 text-[13.5px] tabular-nums text-ink-strong"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 800, borderInline: "1px solid color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))" }}
                >
                  {fyLabel(fy)}
                </span>
                <button
                  type="button"
                  aria-label="Next financial year"
                  onClick={() => go({ fy: fy + 1 })}
                  className={`cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
                >
                  <ChevronRight size={17} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature toolbar — New goal · Search · Sort · Export · Bulk upload.
            One compact row, shown on ALL levels (Yearly included). ────── */}
        <div
          className="wg-rise mb-5 flex items-center gap-2.5 flex-wrap"
          style={{ animationDelay: "30ms" }}
        >
          {canWrite && (
            <button
              type="button"
              onClick={openComposer}
              className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:-translate-y-px cursor-pointer ${FOCUS_RING}`}
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)",
              }}
            >
              <Plus size={16} strokeWidth={2.8} /> New goal
            </button>
          )}

          <div className="relative min-w-[200px] flex-1 max-w-[420px]">
            <Search size={16} strokeWidth={2.4} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search goals, areas, notes…"
              aria-label="Search goals"
              className={`w-full rounded-full border border-hairline bg-surface-card pl-9 pr-9 py-2 text-[14px] font-medium text-ink-strong transition-colors focus:border-altus-red ${FOCUS_RING}`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full text-ink-subtle hover:text-ink-strong ${FOCUS_RING}`}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Sort */}
          <label className="relative inline-flex items-center">
            <ArrowUpDown size={15} strokeWidth={2.4} className="pointer-events-none absolute left-3 text-ink-subtle" />
            <span className="sr-only">Sort goals</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort goals"
              className={`h-[38px] cursor-pointer appearance-none rounded-full border border-hairline-strong bg-surface-card pl-9 pr-8 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronRight size={14} className="pointer-events-none absolute right-2.5 rotate-90 text-ink-subtle" />
          </label>

          {/* Export */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={displayed.length === 0}
            aria-label="Export visible goals to CSV"
            className={`wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-card px-3.5 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
          >
            <Download size={15} strokeWidth={2.4} /> Export
          </button>

          {/* Bulk upload */}
          {canWrite && (
            <GoalsBulkUpload
              employeeId={props.viewedEmployeeId}
              level={props.level}
              periodKey={props.periodKey}
            />
          )}
        </div>

        {/* Sort pauses drag-reorder — tell the user how to get it back. */}
        {canWrite && policy.canReorder && sortKey !== "position" && !kanban && (
          <p className="wg-rise -mt-3 mb-4 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            Sorted by {SORT_OPTIONS.find((o) => o.value === sortKey)?.label} — drag-to-reorder is paused.
            Switch back to <button type="button" onClick={() => setSortKey("position")} className="cursor-pointer font-bold text-altus-red underline underline-offset-2">Sr. No.</button> to reorder.
          </p>
        )}

        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          accessibility={{ announcements: dndAnnouncements, screenReaderInstructions: dndInstructions }}
        >
          {/* ── Period pills — nav + ALWAYS-ON drop targets. Hidden in Kanban:
              the columns themselves are the buckets (and the droppables — the
              `bucket:` ids must stay unique inside one DndContext). ────── */}
          {props.level !== "year" && !kanban && (
            <nav
              className="wg-rise mb-5 rounded-2xl border p-3"
              style={{
                background: "var(--color-surface-card)",
                borderColor: "var(--color-hairline)",
                boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
                animationDelay: "40ms",
              }}
              aria-label={`Pick a ${PERIOD_LABEL[props.level].toLowerCase()}`}
            >
              {props.level === "quarter" ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {buckets.map((k) => (
                    <BucketPill
                      key={k}
                      bucketKey={k}
                      label={periodKeyLabel(k)}
                      count={countByBucket.get(k) ?? 0}
                      active={k === props.periodKey}
                      onPick={() => go({ period: k })}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-x-5 gap-y-2 max-lg:grid-cols-2 max-md:grid-cols-1">
                  {([1, 2, 3, 4] as const).map((q) => (
                    <div key={q} className="min-w-0">
                      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>
                        {periodKeyLabel(`${fy}-Q${q}`)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {monthKeysOfQuarter(fy, q).map((k) => (
                          <BucketPill
                            key={k}
                            bucketKey={k}
                            label={periodKeyShort(k)}
                            count={countByBucket.get(k) ?? 0}
                            active={k === props.periodKey}
                            onPick={() => go({ period: k })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </nav>
          )}

          {/* ── Filter command bar — hidden on the Yearly surface (per request:
              no search/filter row there; the handful of year goals need none) ── */}
          {props.level !== "year" && (
          <div
            className="wg-rise mb-5 rounded-2xl border p-3"
            style={{
              background: "var(--color-surface-card)",
              borderColor: "var(--color-hairline)",
              boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
              animationDelay: "60ms",
            }}
          >
            <div className="flex items-center gap-2.5 flex-wrap">
              <BoardQuickChips value={completion} counts={chipCounts} onSelect={setCompletion} />
              <div className="ml-auto flex items-center gap-2.5">
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-altus-red hover:bg-altus-red/[0.06] ${FOCUS_RING}`}
                  >
                    <X size={14} strokeWidth={2.6} /> Clear {activeFilterCount}
                  </button>
                )}
                <span className="text-[13px] font-bold text-ink-soft tabular-nums whitespace-nowrap">
                  {visibleCount}
                  {activeFilterCount > 0 && visibleCount !== scopeTotal ? ` of ${scopeTotal}` : ""} goal
                  {visibleCount === 1 ? "" : "s"}
                </span>
                {/* View toggle — always shown here (this bar only renders for
                    quarter/month levels now; Yearly has no filter bar). */}
                <div
                  role="group"
                  aria-label="Board view"
                  className="inline-flex items-center overflow-hidden rounded-full border border-hairline-strong bg-surface-soft"
                >
                  <ViewToggleButton
                    active={!kanban}
                    label="List"
                    icon={<List size={14} strokeWidth={2.4} />}
                    onClick={() => pickView("list")}
                  />
                  <ViewToggleButton
                    active={kanban}
                    label="Kanban"
                    icon={<Columns3 size={14} strokeWidth={2.4} />}
                    onClick={() => pickView("kanban")}
                  />
                </div>
              </div>
            </div>
            {activeFilterCount > 0 && canWrite && policy.canReorder && (
              <p className="mt-2 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
                Drag is paused while filters are on — clear them to reorder or move cards.
              </p>
            )}
          </div>
          )}

          {/* ── The board body — classic list or Kanban columns ─────── */}
          {kanban ? (
            <KanbanBoard
              level={props.level === "quarter" ? "quarter" : "month"}
              fyStartYear={fy}
              goalsByBucket={goalsByBucket}
              selectedKey={props.periodKey}
              onSelectBucket={(k) => go({ period: k })}
              cardProps={sharedCardProps}
              childrenByParent={childrenByParent}
              employeeId={props.viewedEmployeeId}
              parentOf={parentOf}
              areaOptions={areaOptions}
              mutation={mutation}
              focusId={props.focusId ?? null}
              filtersActive={activeFilterCount > 0}
            />
          ) : (
          <div className="flex flex-col gap-3.5">
            {inBucket.length === 0 ? (
              <EmptyState periodLabel={periodKeyLabel(props.periodKey)} />
            ) : displayed.length === 0 ? (
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
            ) : (
              <>
              {/* Live drag hint — tells the user exactly what's happening while
                  they carry a card (no more clueless blank cards). */}
              {activeDrag && (
                <div
                  className="mb-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 10%, var(--color-surface-card))",
                    color: "var(--color-altus-red-deep)",
                    border: "1px solid color-mix(in srgb, var(--color-altus-red) 26%, transparent)",
                    boxShadow: "0 8px 22px -14px color-mix(in srgb, var(--color-altus-red) 60%, transparent)",
                  }}
                >
                  <span aria-hidden className="relative inline-flex size-2">
                    <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping motion-reduce:hidden" style={{ background: "var(--color-altus-red)" }} />
                    <span className="relative inline-flex size-2 rounded-full" style={{ background: "var(--color-altus-red)" }} />
                  </span>
                  Moving “{activeDrag.title}” — drop on another goal to reorder
                </div>
              )}

              <SortableContext items={displayed.map((g) => g.id)} strategy={rectSortingStrategy}>
                {/* 2-per-row grid on wide screens (saves vertical space); one
                    column below lg. `data-goals-dragging` pins the sibling cards'
                    entrance animation so they never flash blank mid-drag. */}
                <div
                  className="grid grid-cols-1 gap-3 lg:grid-cols-2"
                  data-goals-dragging={activeDrag ? "true" : undefined}
                >
                  {displayed.map((goal, i) => {
                    const isDragSource = activeDrag?.id === goal.id;
                    return (
                      <div
                        key={goal.id}
                        className={`wg-rise overflow-hidden rounded-2xl transition-[border-color,box-shadow,background] duration-200 ${isDragSource ? "goals-drag-source" : ""}`}
                        style={{
                          background: isDragSource
                            ? "color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card))"
                            : "var(--color-surface-card)",
                          border: isDragSource
                            ? "1.5px dashed color-mix(in srgb, var(--color-altus-red) 55%, transparent)"
                            : "1px solid var(--color-hairline)",
                          boxShadow: isDragSource
                            ? "none"
                            : "0 1px 2px rgba(15,23,42,0.04), 0 12px 30px -24px rgba(15,23,42,0.14)",
                          animationDelay: `${Math.min(i, 14) * 40}ms`,
                        }}
                      >
                        <GoalBoardCard
                          goal={goal}
                          srNo={i + 1}
                          autoFocus={props.focusId === goal.id}
                          childGoals={childrenByParent.get(goal.id) ?? EMPTY_CHILDREN}
                          {...sharedCardProps}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
              </>
            )}

            {canWrite && (
              <BoardQuickAdd
                ref={quickAddRef}
                employeeId={props.viewedEmployeeId}
                level={props.level}
                periodKey={props.periodKey}
                parent={parentGoal}
                areaOptions={areaOptions}
                currentCount={inBucket.length}
                mutation={mutation}
              />
            )}
          </div>
          )}

          {/* Drag ghost — a lean copy of the row being carried. The overlay
              wrapper defaults to the ACTIVE node's size (a full-width row!),
              which looked like a giant white bar sweeping the page — size it
              to the ghost's own content instead. */}
          <DragOverlay
            dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2,0,0,1)" }}
            style={{ width: "max-content", height: "auto" }}
          >
            {activeDrag && (
              <div
                className="flex items-center gap-3 rounded-2xl border px-4 py-3"
                style={{
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card)), var(--color-surface-card))",
                  borderColor: "color-mix(in srgb, var(--color-altus-red) 48%, transparent)",
                  boxShadow:
                    "0 28px 64px -14px rgba(225,6,0,0.4), 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.6)",
                  transform: "rotate(-2.5deg) scale(1.04)",
                  cursor: "grabbing",
                }}
              >
                <ProgressRing pct={effectiveGoalPct(activeDrag)} tone="slate" />
                <span className="max-w-[320px] truncate text-[14.5px] font-bold" style={{ color: "var(--color-ink-strong)" }}>
                  {activeDrag.title}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* One shared archive dialog for the whole board. */}
      <ArchiveGoalDialog
        goal={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={(g) => {
          setArchiveTarget(null);
          void mutation
            .mutate({ type: "remove", id: g.id }, () => archiveGoal({ id: g.id }))
            .then((ok) => {
              if (ok) fireToast({ message: "Moved to the Recycle Bin.", type: "success" });
            });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View toggle — List ⇄ Kanban segmented control                       */
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
      className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-bold transition-colors ${FOCUS_RING}`}
      style={
        active
          ? { background: "var(--color-surface-card)", color: "var(--color-altus-red-deep)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
          : { background: "transparent", color: "var(--color-ink-subtle)" }
      }
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Period pill — nav button + always-on drop target                    */
/* ------------------------------------------------------------------ */

function BucketPill({
  bucketKey,
  label,
  count,
  active,
  onPick,
}: {
  bucketKey: string;
  label: string;
  count: number;
  active: boolean;
  onPick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${BUCKET_DROP_PREFIX}${bucketKey}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={`${label} — ${count} goal${count === 1 ? "" : "s"}`}
      className={`wg-btn inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13.5px] font-bold transition-all cursor-pointer ${FOCUS_RING}`}
      style={
        active
          ? {
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              borderColor: "var(--color-altus-red)",
              color: "#fff",
              boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)",
            }
          : isOver
            ? {
                background: "color-mix(in srgb, var(--color-altus-red) 10%, var(--color-surface-card))",
                borderColor: "var(--color-altus-red)",
                color: "var(--color-altus-red-deep)",
                transform: "scale(1.06)",
              }
            : {
                background: "var(--color-surface-card)",
                borderColor: "var(--color-hairline-strong)",
                color: "var(--color-ink-soft)",
              }
      }
    >
      {label}
      <span
        className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
        style={
          active
            ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
            : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }
        }
      >
        {count}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({ periodLabel }: { periodLabel: string }) {
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <span
        className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
      >
        <Target size={30} strokeWidth={2.2} />
      </span>
      <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
        No goals in {periodLabel} yet
      </h3>
      <p className="mx-auto mt-2 max-w-[46ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Add the first goal below — or drag a card here from another period. Goals added
        here land in this exact bucket.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Archive confirmation (soft-delete → Recycle Bin, recoverable)        */
/* ------------------------------------------------------------------ */

function ArchiveGoalDialog({
  goal,
  onClose,
  onConfirm,
}: {
  goal: GoalDTO | null;
  onClose: () => void;
  onConfirm: (g: GoalDTO) => void;
}) {
  const open = goal != null;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}
            >
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-bold text-ink-strong" style={{ fontSize: 19, letterSpacing: "-0.01em" }}>
                Move to the Recycle Bin?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                “{goal?.title ?? ""}” is archived, not deleted — restore it any time from
                Goals → Recycle Bin.
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`cursor-pointer rounded-pill border border-hairline-strong px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => goal && onConfirm(goal)}
              className={`inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px ${FOCUS_RING}`}
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              Move to Recycle Bin
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
