"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import { GripVertical, Plus, Sparkles, ChevronLeft, ChevronRight, Loader2, Target, Users2, UserPlus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  createGoal,
  generateGoalChildren,
  setGoalPctDone,
  setGoalCategory,
  setGoalTeam,
  moveGoalForward,
  moveWeeklyToWeek,
  promoteToLevel,
} from "@/app/(app)/goals/cascade/actions";
import { setWeeklyGoalPct } from "@/app/(app)/weekly-goals/actions";
import {
  goalCode,
  categoryStyle,
  isSpillover,
  fmtNum,
  fyLabel,
  type GoalDTO,
  type RosterMember,
} from "./util";
import type { AssignedGoal } from "@/lib/goals/queries";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  quarterKey as quarterKeyOf,
  monthKey as monthKeyOf,
  quarterOfKey,
} from "@/lib/goals/types";

export interface WeeklyDTO {
  id: string;
  weekStart: string;
  monthKey: string;
  weekNo: number;
  title: string;
  area: string | null;
  uom: string | null;
  pctDone: number;
  acceptPct: number | null;
  position: number;
  cascade: boolean;
  spillover: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Q_LABEL: Record<number, string> = { 1: "Apr–Jun", 2: "Jul–Sep", 3: "Oct–Dec", 4: "Jan–Mar" };
const ACCENT = "#b45309";
const ACCENT_DEEP = "#7c2d12";

type Lens = "year" | "quarter" | "month" | "levels";
const LEVEL_RANK: Record<string, number> = { year: 0, quarter: 1, month: 2, week: 3 };

type GoalCategory = "target" | "milestone" | "operational" | "goal";

/** Card action + roster context — avoids threading handlers through every column. */
interface CardCtxValue {
  canWrite: boolean;
  roster: RosterMember[];
  busy: string | null;
  onSetPct: (id: string, pct: number) => void;
  onSetCategory: (id: string, category: GoalCategory) => void;
  onSetTeam: (id: string, team: Array<{ employeeId?: string; name?: string }>) => void;
}
const CardCtx = React.createContext<CardCtxValue>({
  canWrite: false,
  roster: [],
  busy: null,
  onSetPct: () => {},
  onSetCategory: () => {},
  onSetTeam: () => {},
});

interface Props {
  goals: GoalDTO[];
  weekly: WeeklyDTO[];
  assigned: AssignedGoal[];
  fyStartYear: number;
  viewedEmployeeId: string;
  viewedName: string;
  roster: RosterMember[];
  canWrite: boolean;
}

export function CascadeWorkspace(props: Props) {
  const { goals, weekly, assigned, fyStartYear, viewedEmployeeId, viewedName, roster, canWrite } = props;
  const router = useRouter();
  const reduce = useReducedMotion();

  const [lens, setLens] = React.useState<Lens>("year");
  const [yearRight, setYearRight] = React.useState<"quarter" | "month">("quarter");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const nowQ = quarterOfKey(quarterKeyOf(new Date()));
  const nowMonth = monthKeyOf(new Date());
  const [selQuarter, setSelQuarter] = React.useState<number>(nowQ);
  const monthsInFy = React.useMemo(
    () => [1, 2, 3, 4].flatMap((q) => monthKeysOfQuarter(fyStartYear, q as 1 | 2 | 3 | 4)),
    [fyStartYear],
  );
  const [selMonth, setSelMonth] = React.useState<string>(
    monthsInFy.includes(nowMonth) ? nowMonth : (monthsInFy[0] ?? nowMonth),
  );

  const monLabel = (mk: string) => MONTHS[Number(mk.slice(5, 7)) - 1] ?? mk.slice(5, 7);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byPeriod = React.useCallback(
    (period: GoalDTO["period"], key: string) =>
      goals.filter((g) => g.period === period && g.periodKey === key).sort((a, b) => a.position - b.position),
    [goals],
  );
  const yearGoals = React.useMemo(
    () => goals.filter((g) => g.period === "year").sort((a, b) => a.position - b.position),
    [goals],
  );

  // ── Actions ──────────────────────────────────────────────────────────────
  const run = React.useCallback(
    (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(key);
      void fn()
        .then((r) => {
          if (!r.ok) fireToast({ message: r.error ?? "Something went wrong.", type: "error" });
          else router.refresh();
        })
        .finally(() => setBusy(null));
    },
    [router],
  );

  const onAdd = (period: GoalDTO["period"], periodKey: string, title: string) => {
    if (!title.trim()) return;
    run(`add:${periodKey}`, () => createGoal({ employeeId: viewedEmployeeId, period, periodKey, title: title.trim() }));
  };
  const onGenerate = (id: string) => run(`gen:${id}`, () => generateGoalChildren({ id }));
  const onSetPct = (id: string, pct: number) => run(`pct:${id}`, () => setGoalPctDone({ id, pctDone: pct }));
  const onWeeklyPct = (id: string, pct: number) => run(`wpct:${id}`, () => setWeeklyGoalPct({ id, pctDone: pct }));
  const onSetCategory = (id: string, category: GoalCategory) => run(`cat:${id}`, () => setGoalCategory({ id, category }));
  const onSetTeam = (id: string, team: Array<{ employeeId?: string; name?: string }>) => run(`team:${id}`, () => setGoalTeam({ id, team }));

  const cardCtx: CardCtxValue = React.useMemo(
    () => ({ canWrite, roster, busy, onSetPct, onSetCategory, onSetTeam }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, roster, busy],
  );

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);

    // Levels board — drop a card onto a HIGHER level to promote it ("travels along").
    if (overId.startsWith("lvl:")) {
      const level = overId.slice(4);
      if (level === "week") return; // can't promote INTO the leaf
      const gg = goals.find((x) => x.id === active.id);
      if (gg) {
        if (LEVEL_RANK[level]! < (LEVEL_RANK[gg.period] ?? 2)) {
          run(`promote:${gg.id}`, () => promoteToLevel({ id: gg.id, kind: "goal", level: level as "year" | "quarter" | "month" }));
        }
        return;
      }
      const ww = weekly.find((x) => x.id === active.id);
      if (ww) run(`promote:${ww.id}`, () => promoteToLevel({ id: ww.id, kind: "weekly", level: level as "year" | "quarter" | "month" }));
      return;
    }

    const g = goals.find((x) => x.id === active.id);
    if (g) {
      // Goal move (Q→Q / month→month) — drop onto a period column.
      const toKey = overId.startsWith("col:") ? overId.slice(4) : null;
      if (toKey && toKey !== g.periodKey) run(`move:${g.id}`, () => moveGoalForward({ id: g.id, targetPeriodKey: toKey }));
      return;
    }
    const w = weekly.find((x) => x.id === active.id);
    if (w) {
      // Weekly move (week→week within the month) — drop onto a week column.
      const toWeek = overId.startsWith("wk:") ? overId.slice(3) : null;
      if (toWeek && toWeek !== w.weekStart) run(`wmove:${w.id}`, () => moveWeeklyToWeek({ id: w.id, weekStart: toWeek }));
    }
  }

  const legend = (
    <div className="flex flex-col gap-1 text-[11px] font-semibold text-ink-muted">
      <Dot c="#1e3a8a" label="Auto-derived" />
      <Dot c="#111827" label="Manual" />
      <Dot c="#b91c1c" label="Spillover" />
    </div>
  );

  return (
    <CardCtx.Provider value={cardCtx}>
      {/* ── Masthead ── */}
      <header className="wg-rise mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-grid size-10 place-items-center rounded-2xl text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Target size={20} strokeWidth={2.6} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="leading-none text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em" }}
              >
                The Cascade
              </h1>
              <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.15em] text-white" style={{ background: "#0f172a" }}>
                Kanban
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-ink-muted">
              Kanban of the Cascade · {viewedName} · {fyLabel(fyStartYear)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {roster.length > 1 && (
            <select
              value={viewedEmployeeId}
              onChange={(e) => router.push(`/goals/cascade?emp=${e.target.value}&fy=${fyStartYear}`)}
              className="h-9 rounded-chip border border-hairline bg-surface-card px-3 text-[13px] font-semibold text-ink-strong"
            >
              {roster.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 rounded-chip border border-hairline bg-surface-card p-0.5">
            <FyStep dir={-1} onClick={() => router.push(`/goals/cascade?emp=${viewedEmployeeId}&fy=${fyStartYear - 1}`)} />
            <span className="px-2 text-[12px] font-bold tabular-nums text-ink-strong">FY{fyStartYear % 100}</span>
            <FyStep dir={1} onClick={() => router.push(`/goals/cascade?emp=${viewedEmployeeId}&fy=${fyStartYear + 1}`)} />
          </div>
        </div>
      </header>

      {/* ── Lens switch (centered, dark) + legend (right, vertical) ── */}
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span aria-hidden />
        <div
          className="inline-flex rounded-2xl border p-1"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)", boxShadow: "0 6px 18px -12px rgba(15,23,42,0.35)" }}
        >
          {(["year", "quarter", "month", "levels"] as Lens[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              className="rounded-xl px-6 py-2 text-[13.5px] font-black uppercase tracking-[0.08em] transition-all max-sm:px-3"
              style={
                lens === l
                  ? { background: "#0f172a", color: "#fff", boxShadow: "0 10px 24px -10px rgba(15,23,42,0.65)" }
                  : { color: "var(--color-ink-muted)" }
              }
            >
              {l}
            </button>
          ))}
        </div>
        <div className="justify-self-end">{legend}</div>
      </div>

      {assigned.length > 0 && <AssignedStrip items={assigned} reduce={!!reduce} />}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragId(null)}
      >
        {lens === "year" && (
          <Split
            left={
              <FrozenPanel title="Yearly goals" subtitle="Fixed reference">
                {yearGoals.length === 0 ? (
                  <Empty text="No yearly goals yet." />
                ) : (
                  yearGoals.map((g) => (
                    <GoalCard
                      key={g.id}
                      g={g}
                      onGenerate={() => onGenerate(g.id)}
                      generating={busy === `gen:${g.id}`}
                      genLabel="quarters"
                    />
                  ))
                )}
                {canWrite && <QuickAdd busy={busy === `add:${fyStartYear}`} onAdd={(t) => onAdd("year", String(fyStartYear), t)} />}
              </FrozenPanel>
            }
            rightHeader={
              <div className="inline-flex rounded-chip border border-hairline bg-surface-card p-0.5">
                {(["quarter", "month"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setYearRight(m)}
                    className="rounded-[9px] px-3 py-1 text-[12px] font-bold capitalize"
                    style={yearRight === m ? { background: ACCENT, color: "#fff" } : { color: "var(--color-ink-muted)" }}
                  >
                    {m === "quarter" ? "Quarters (4)" : "Months (12)"}
                  </button>
                ))}
              </div>
            }
            right={
              yearRight === "quarter"
                ? quartersOfFy(fyStartYear).map((qk) => (
                    <GoalColumn
                      key={qk}
                      periodKey={qk}
                      label={`Q${quarterOfKey(qk)}`}
                      sub={(Q_LABEL[quarterOfKey(qk)] ?? "")}
                      goals={byPeriod("quarter", qk)}
                      canWrite={canWrite}
                      addBusy={busy === `add:${qk}`}
                      onAdd={(t) => onAdd("quarter", qk, t)}
                    />
                  ))
                : monthsInFy.map((mk) => (
                    <GoalColumn
                      key={mk}
                      periodKey={mk}
                      label={`${monLabel(mk)}`}
                      sub={mk.slice(0, 4)}
                      goals={byPeriod("month", mk)}
                      canWrite={canWrite}
                      addBusy={busy === `add:${mk}`}
                      onAdd={(t) => onAdd("month", mk, t)}
                    />
                  ))
            }
          />
        )}

        {lens === "quarter" && (
          <Split
            leftHeader={
              <div className="flex gap-1">
                {quartersOfFy(fyStartYear).map((qk) => {
                  const q = quarterOfKey(qk);
                  return (
                    <button
                      key={qk}
                      type="button"
                      onClick={() => setSelQuarter(q)}
                      className="rounded-chip px-2.5 py-1 text-[12px] font-bold"
                      style={selQuarter === q ? { background: ACCENT, color: "#fff" } : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }}
                    >
                      Q{q}
                    </button>
                  );
                })}
              </div>
            }
            left={
              <FrozenPanel title={`Q${selQuarter} goals`} subtitle={(Q_LABEL[selQuarter] ?? "")}>
                {byPeriod("quarter", `${fyStartYear}-Q${selQuarter}`).length === 0 ? (
                  <Empty text="No goals for this quarter." />
                ) : (
                  byPeriod("quarter", `${fyStartYear}-Q${selQuarter}`).map((g) => (
                    <GoalCard key={g.id} g={g} onGenerate={() => onGenerate(g.id)} generating={busy === `gen:${g.id}`} genLabel="months" />
                  ))
                )}
                {canWrite && <QuickAdd busy={busy === `add:${fyStartYear}-Q${selQuarter}`} onAdd={(t) => onAdd("quarter", `${fyStartYear}-Q${selQuarter}`, t)} />}
              </FrozenPanel>
            }
            right={monthKeysOfQuarter(fyStartYear, selQuarter as 1 | 2 | 3 | 4).map((mk) => (
              <GoalColumn
                key={mk}
                periodKey={mk}
                label={monLabel(mk)}
                sub={mk.slice(0, 4)}
                goals={byPeriod("month", mk)}
                canWrite={canWrite}
                addBusy={busy === `add:${mk}`}
                onAdd={(t) => onAdd("month", mk, t)}
              />
            ))}
          />
        )}

        {lens === "month" && (
          <Split
            leftHeader={
              <select
                value={selMonth}
                onChange={(e) => setSelMonth(e.target.value)}
                className="h-8 rounded-chip border border-hairline bg-surface-card px-2 text-[12px] font-bold text-ink-strong"
              >
                {monthsInFy.map((mk) => (
                  <option key={mk} value={mk}>{monLabel(mk)} {mk.slice(0, 4)}</option>
                ))}
              </select>
            }
            left={
              <FrozenPanel title={`${monLabel(selMonth)} goals`} subtitle="Fixed reference">
                {byPeriod("month", selMonth).length === 0 ? (
                  <Empty text="No goals for this month." />
                ) : (
                  byPeriod("month", selMonth).map((g) => (
                    <GoalCard key={g.id} g={g} onGenerate={() => onGenerate(g.id)} generating={busy === `gen:${g.id}`} genLabel="weeks" />
                  ))
                )}
                {canWrite && <QuickAdd busy={busy === `add:${selMonth}`} onAdd={(t) => onAdd("month", selMonth, t)} />}
              </FrozenPanel>
            }
            right={<WeekColumns month={selMonth} weekly={weekly} canWrite={canWrite} onPct={onWeeklyPct} busy={busy} />}
          />
        )}

        {lens === "levels" && (
          <>
            <p className="mb-3 text-center text-[12.5px] font-medium text-ink-muted">
              Drag a card <b className="text-ink-strong">up a level</b> to promote it — a weekly can become a month, quarter, or yearly goal.
            </p>
            <div className="flex gap-4 overflow-x-auto pb-3">
              <LevelColumn level="year" label="Yearly" sub="the north star" goals={goals.filter((g) => g.period === "year")} />
              <LevelColumn level="quarter" label="Quarterly" sub="4 per year" goals={goals.filter((g) => g.period === "quarter")} />
              <LevelColumn level="month" label="Monthly" sub="12 per year" goals={goals.filter((g) => g.period === "month")} />
              <WeekLevelColumn weekly={weekly} canWrite={canWrite} onPct={onWeeklyPct} busy={busy} />
            </div>
          </>
        )}

        <DragOverlay>
          {dragId ? (
            <div className="rounded-chip border border-hairline-strong bg-surface-card px-3 py-2 text-[13px] font-semibold text-ink-strong shadow-lg">
              {goals.find((g) => g.id === dragId)?.title ?? "Goal"}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CardCtx.Provider>
  );
}

/* ── "Assigned to you" strip (Sir #25) — goals others named you on ── */
function AssignedStrip({ items, reduce }: { items: AssignedGoal[]; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-hairline bg-surface-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <Users2 size={15} style={{ color: ACCENT_DEEP }} />
        <span className="text-[13px] font-black text-ink-strong">Also on you</span>
        <span className="text-[11.5px] font-medium text-ink-muted">— goals others made you responsible for</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((a) => {
          const pct = a.acceptPct ?? a.pctDone;
          return (
            <div key={a.id} className="min-w-[220px] shrink-0 rounded-chip border border-hairline bg-surface-soft/50 px-3 py-2" style={{ borderLeft: "3px solid #1e3a8a" }}>
              <div className="truncate text-[13px] font-bold text-ink-strong">{a.title}</div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="truncate">{a.ownerName}{a.area ? ` · ${a.area}` : ""}</span>
                <span className="font-bold tabular-nums" style={{ color: pct >= 70 ? "#15803d" : pct >= 40 ? "#b45309" : "#b91c1c" }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** The Mondays whose date falls inside a month "YYYY-MM". */
function monthMondays(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const out: string[] = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCMonth() === m - 1) {
    if (d.getUTCDay() === 1) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function weekNoOf(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.max(1, Math.ceil((d.getTime() - start) / 86_400_000 / 7) + 1);
}

/* ── Month → week columns: droppable by weekStart, draggable weekly cards, % edit ── */
function WeekColumns({ month, weekly, canWrite, onPct, busy }: { month: string; weekly: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const wk = weekly.filter((w) => w.monthKey === month);
  const byWeek = new Map<string, WeeklyDTO[]>();
  for (const w of wk) {
    const arr = byWeek.get(w.weekStart);
    if (arr) arr.push(w);
    else byWeek.set(w.weekStart, [w]);
  }
  const weekStarts = [...new Set([...monthMondays(month), ...byWeek.keys()])].sort();
  return (
    <>
      {weekStarts.map((ws) => (
        <WeekColumn key={ws} weekStart={ws} items={byWeek.get(ws) ?? []} canWrite={canWrite} onPct={onPct} busy={busy} />
      ))}
    </>
  );
}

function WeekColumn({ weekStart, items, canWrite, onPct, busy }: { weekStart: string; items: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: `wk:${weekStart}` });
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[220px] shrink-0 flex-col rounded-2xl border-2 bg-white/80 p-2.5 transition-colors"
      style={{
        borderColor: isOver ? "#0f172a" : "var(--color-hairline-strong)",
        background: isOver ? "rgba(15,23,42,0.03)" : undefined,
        boxShadow: isOver ? "0 0 0 3px rgba(15,23,42,0.08)" : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div className="mb-2.5 flex items-baseline gap-1.5 border-b-2 px-1 pb-2" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[14px] font-black text-ink-strong">W{weekNoOf(weekStart)}</span>
        <span className="text-[11px] font-semibold text-ink-muted">{weekStart.slice(8)}/{weekStart.slice(5, 7)}</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{items.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {items.map((w) => (
          <WeeklyCard key={w.id} w={w} canWrite={canWrite} onPct={onPct} busy={busy === `wpct:${w.id}`} />
        ))}
        {items.length === 0 && <div className="rounded-chip border border-dashed border-hairline px-2 py-2 text-center text-[11px] text-ink-muted/70">Drop a week here</div>}
      </div>
    </div>
  );
}

function WeeklyCard({ w, canWrite, onPct, busy }: { w: WeeklyDTO; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: w.id });
  const pct = w.acceptPct ?? w.pctDone;
  const color = w.spillover && pct < 100 ? "#b91c1c" : w.cascade ? "#1e3a8a" : "#111827";
  const [draft, setDraft] = React.useState(String(w.pctDone));
  React.useEffect(() => setDraft(String(w.pctDone)), [w.pctDone]);
  const drag = canWrite ? { ...attributes, ...listeners } : {};
  return (
    <div
      ref={setNodeRef}
      {...drag}
      className={`rounded-lg border bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)] ${isDragging ? "" : "wg-rise"}`}
      style={{ borderColor: "var(--color-hairline)", borderLeft: `3px solid ${color}`, opacity: isDragging ? 0.35 : 1, cursor: canWrite ? "grab" : "default", touchAction: "none" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-black text-white" style={{ background: color }}>W{w.weekNo}</span>
        <span className="truncate text-[12.5px] font-semibold text-ink-strong" title={w.title}>{w.title}</span>
        {canWrite && <span aria-hidden className="ml-auto text-ink-muted/25"><GripVertical size={13} /></span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-track">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        {canWrite ? (
          <div className="flex items-center gap-0.5">
            <input
              value={draft}
              onPointerDown={stopDrag}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onBlur={() => { const n = Math.max(0, Math.min(100, Number(draft) || 0)); if (n !== w.pctDone) onPct(w.id, n); }}
              inputMode="numeric"
              aria-label={`Percent complete for ${w.title}`}
              className="w-9 rounded border border-hairline bg-surface-soft px-1 py-0.5 text-right text-[12px] font-bold tabular-nums text-ink-strong"
            />
            <span className="text-[11px] font-bold text-ink-muted">%</span>
            {busy && <Loader2 size={12} className="animate-spin text-ink-muted" />}
          </div>
        ) : (
          <span className="text-[12px] font-black tabular-nums" style={{ color }}>{pct}%</span>
        )}
      </div>
    </div>
  );
}

/* ── Split: fixed-left frozen column + horizontally-scrolling right columns ── */
function Split(props: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 grid-cols-[minmax(240px,0.85fr)_1fr] max-lg:grid-cols-1">
      <div>
        {props.leftHeader && <div className="mb-2">{props.leftHeader}</div>}
        {props.left}
      </div>
      <div className="min-w-0">
        {props.rightHeader && <div className="mb-2 flex justify-end">{props.rightHeader}</div>}
        <div className="flex gap-3 overflow-x-auto pb-3">{props.right}</div>
      </div>
    </div>
  );
}

function FrozenPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="sticky top-4 rounded-2xl border border-hairline bg-surface-card p-3">
      <div className="mb-2 px-1">
        <div className="text-[15px] font-black text-ink-strong">{title}</div>
        <div className="text-[11px] font-semibold text-ink-muted">{subtitle}</div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/* ── A droppable period column (right side) ── */
function GoalColumn(props: {
  periodKey: string;
  label: string;
  sub: string;
  goals: GoalDTO[];
  canWrite: boolean;
  addBusy: boolean;
  onAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${props.periodKey}` });
  const empty = props.goals.length === 0;
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[272px] shrink-0 flex-col rounded-2xl border-2 bg-white/80 transition-colors"
      style={{
        borderColor: isOver ? "#0f172a" : "var(--color-hairline-strong)",
        background: isOver ? "rgba(15,23,42,0.03)" : undefined,
        boxShadow: isOver ? "0 0 0 3px rgba(15,23,42,0.08)" : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      {/* Calendar-style column header */}
      <div className="flex items-baseline gap-2 border-b-2 px-3.5 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{props.label}</span>
        <span className="text-[11.5px] font-medium text-ink-muted">{props.sub}</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{props.goals.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {props.goals.map((g) => (
          <DraggableGoalCard key={g.id} g={g} />
        ))}
        {empty && !props.canWrite && (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed px-4 py-8 text-center text-[12px] text-ink-muted/70" style={{ borderColor: "var(--color-hairline-strong)" }}>
            Drop a card to assign to {props.label}
          </div>
        )}
        {props.canWrite && <QuickAdd busy={props.addBusy} onAdd={props.onAdd} compact />}
      </div>
    </div>
  );
}

function DraggableGoalCard({ g }: { g: GoalDTO }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: g.id });
  const ctx = React.useContext(CardCtx);
  const drag = ctx.canWrite ? { ...attributes, ...listeners } : {};
  return (
    <div
      ref={setNodeRef}
      {...drag}
      style={{ opacity: isDragging ? 0.35 : 1, cursor: ctx.canWrite ? "grab" : "default", touchAction: "none" }}
      className={isDragging ? "" : "wg-rise"}
    >
      <GoalCard g={g} draggable={ctx.canWrite} />
    </div>
  );
}

/** Interactive controls inside a draggable card must swallow pointerdown so they
 *  stay clickable/typable instead of starting a drag. */
const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

/* ── The goal card — mockup style: category tag · title · dual % · team ── */
function GoalCard(props: {
  g: GoalDTO;
  onGenerate?: () => void;
  generating?: boolean;
  genLabel?: string;
  draggable?: boolean;
}) {
  const { g } = props;
  const ctx = React.useContext(CardCtx);
  const cat = categoryStyle(g.category, isSpillover(g));
  const self = g.pctDone;
  const target = g.acceptPct ?? 100;
  const [draft, setDraft] = React.useState(String(g.pctDone));
  const [catOpen, setCatOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  React.useEffect(() => setDraft(String(g.pctDone)), [g.pctDone]);
  const team = g.teamInvolved ?? [];

  return (
    <div
      className="group relative rounded-lg border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)]"
      style={{ borderColor: "var(--color-hairline)", borderLeft: `3px solid ${cat.accent}` }}
    >
      {/* top row — category tag + grip affordance (the whole card drags) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!ctx.canWrite}
          onPointerDown={stopDrag}
          onClick={() => setCatOpen((o) => !o)}
          className="rounded px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide disabled:cursor-default"
          style={{ color: cat.color, background: cat.bg }}
        >
          {cat.label}
        </button>
        <span className="text-[9.5px] font-bold tabular-nums text-ink-subtle">{goalCode(g)}</span>
        <span className="ml-auto" />
        {props.draggable && (
          <span aria-hidden className="text-ink-muted/25 group-hover:text-ink-muted/60">
            <GripVertical size={14} />
          </span>
        )}
      </div>

      {/* category picker */}
      {catOpen && ctx.canWrite && (
        <div className="mt-1.5 flex flex-wrap gap-1" onPointerDown={stopDrag}>
          {(["target", "milestone", "operational", "goal"] as const).map((c) => {
            const cs = categoryStyle(c, false);
            return (
              <button
                key={c}
                type="button"
                onClick={() => { ctx.onSetCategory(g.id, c); setCatOpen(false); }}
                className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase"
                style={{ color: cs.color, background: cs.bg, outline: g.category === c ? `1px solid ${cs.color}` : "none" }}
              >
                {cs.label}
              </button>
            );
          })}
        </div>
      )}

      {/* title */}
      <div className="mt-1.5 text-[14px] font-semibold leading-snug text-ink-strong" style={{ overflowWrap: "anywhere" }}>
        {g.title}
      </div>

      {/* meta */}
      {(g.area || g.targetQty != null || g.targetAmount != null) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
          {g.area && <span>{g.area}</span>}
          {g.targetQty != null && <span className="tabular-nums">{fmtNum(g.targetQty)} {g.uom ?? ""}</span>}
          {g.targetAmount != null && <span className="tabular-nums">₹{fmtNum(g.targetAmount)}</span>}
        </div>
      )}

      {/* dual % row */}
      <div className="mt-2.5 flex items-center justify-between">
        {ctx.canWrite ? (
          <span className="inline-flex items-center gap-0.5">
            <input
              value={draft}
              onPointerDown={stopDrag}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onBlur={() => { const n = Math.max(0, Math.min(100, Number(draft) || 0)); if (n !== g.pctDone) ctx.onSetPct(g.id, n); }}
              inputMode="numeric"
              aria-label={`Percent complete for ${g.title}`}
              className="w-8 rounded border-0 bg-transparent p-0 text-left text-[15px] font-bold tabular-nums focus:outline-none"
              style={{ color: cat.accent }}
            />
            <span className="text-[13px] font-bold" style={{ color: cat.accent }}>%</span>
            {ctx.busy === `pct:${g.id}` && <Loader2 size={12} className="animate-spin text-ink-muted" />}
          </span>
        ) : (
          <span className="text-[15px] font-bold tabular-nums" style={{ color: cat.accent }}>{self}%</span>
        )}
        <span className="text-[13px] font-semibold tabular-nums text-ink-subtle">{target}%</span>
      </div>

      {/* progress bar */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-track">
        <span className="block h-full rounded-full" style={{ width: `${self}%`, background: cat.accent }} />
      </div>

      {/* team involvement */}
      <div className="mt-2 flex items-center gap-1.5">
        <TeamAvatars team={team} />
        {ctx.canWrite && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setTeamOpen((o) => !o)}
            className="inline-flex size-5 items-center justify-center rounded-full border border-dashed text-ink-muted hover:text-ink-soft"
            style={{ borderColor: "var(--color-hairline-strong)" }}
            aria-label="Assign people"
          >
            <UserPlus size={11} />
          </button>
        )}
        {ctx.busy === `team:${g.id}` && <Loader2 size={11} className="animate-spin text-ink-muted" />}
      </div>

      {teamOpen && ctx.canWrite && (
        <div onPointerDown={stopDrag}>
          <TeamPicker
            roster={ctx.roster}
            team={team}
            onDone={(next) => { ctx.onSetTeam(g.id, next); setTeamOpen(false); }}
            onCancel={() => setTeamOpen(false)}
          />
        </div>
      )}

      {props.onGenerate && ctx.canWrite && (
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={props.onGenerate}
          disabled={props.generating}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-bold text-ink-soft hover:border-hairline-strong disabled:opacity-50"
          style={{ borderColor: "var(--color-hairline)" }}
        >
          {props.generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} style={{ color: ACCENT }} />}
          Auto-divide into {props.genLabel}
        </button>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
const AV_COLORS = ["#1d4ed8", "#0891b2", "#7c3aed", "#b45309", "#be123c", "#15803d"];

function TeamAvatars({ team }: { team: Array<{ employeeId?: string; name?: string }> }) {
  if (team.length === 0) return null;
  return (
    <div className="flex -space-x-1.5">
      {team.slice(0, 5).map((t, i) => (
        <span
          key={t.employeeId ?? t.name ?? i}
          title={t.name ?? ""}
          className="inline-flex size-5 items-center justify-center rounded-full text-[8.5px] font-black text-white ring-1 ring-white"
          style={{ background: AV_COLORS[i % AV_COLORS.length] }}
        >
          {initials(t.name ?? "?")}
        </span>
      ))}
      {team.length > 5 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-soft text-[8.5px] font-black text-ink-muted ring-1 ring-white">+{team.length - 5}</span>}
    </div>
  );
}

function TeamPicker({
  roster,
  team,
  onDone,
  onCancel,
}: {
  roster: RosterMember[];
  team: Array<{ employeeId?: string; name?: string }>;
  onDone: (next: Array<{ employeeId?: string; name?: string }>) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = React.useState<Set<string>>(new Set(team.map((t) => t.employeeId).filter(Boolean) as string[]));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="mt-2 rounded-lg border bg-surface-card p-2 shadow-lg" style={{ borderColor: "var(--color-hairline-strong)" }}>
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-muted">Involve people</div>
      <div className="max-h-[160px] overflow-y-auto">
        {roster.map((r) => (
          <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-soft">
            <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="accent-[#1d4ed8]" />
            <span className="truncate text-ink-strong">{r.name}</span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted">Cancel</button>
        <button
          type="button"
          onClick={() => onDone(roster.filter((r) => sel.has(r.id)).map((r) => ({ employeeId: r.id, name: r.name })))}
          className="rounded-md px-2.5 py-1 text-[11.5px] font-bold text-white"
          style={{ background: "#1d4ed8" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function QuickAdd({ busy, onAdd, compact }: { busy: boolean; onAdd: (title: string) => void; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-chip border border-dashed border-hairline-strong px-2.5 text-[12px] font-bold text-ink-muted hover:text-ink-soft ${compact ? "py-1.5" : "py-2"}`}
      >
        <Plus size={13} /> Add goal
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); setOpen(false); } }}
      className="flex items-center gap-1"
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!v.trim()) setOpen(false); }}
        maxLength={400}
        placeholder="Goal…"
        className="min-w-0 flex-1 rounded-chip border border-hairline bg-surface-card px-2 py-1.5 text-[12.5px] text-ink-strong"
      />
      <button type="submit" disabled={busy || v.trim().length < 1} className="inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-white disabled:opacity-40" style={{ background: ACCENT }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
      </button>
    </form>
  );
}

function FyStep({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-grid size-7 place-items-center rounded-chip text-ink-muted hover:bg-surface-soft" aria-label={dir < 0 ? "Previous FY" : "Next FY"}>
      {dir < 0 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
    </button>
  );
}

function Dot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-chip border border-dashed border-hairline px-3 py-4 text-center text-[12px] text-ink-muted">{text}</div>;
}

/* ── Combined "Levels" board — one column per level; drop a card onto a higher
      level to promote it (the card travels along). ── */
function LevelColumn({ level, label, sub, goals }: { level: string; label: string; sub: string; goals: GoalDTO[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lvl:${level}` });
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[272px] shrink-0 flex-col rounded-2xl border-2 bg-white/80 transition-colors"
      style={{
        borderColor: isOver ? "#0f172a" : "var(--color-hairline-strong)",
        background: isOver ? "rgba(15,23,42,0.03)" : undefined,
        boxShadow: isOver ? "0 0 0 3px rgba(15,23,42,0.08)" : "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div className="flex items-baseline gap-2 border-b-2 px-3.5 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{label}</span>
        <span className="text-[11.5px] font-medium text-ink-muted">{sub}</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{goals.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {goals.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed px-4 py-8 text-center text-[12px] text-ink-muted/70" style={{ borderColor: "var(--color-hairline-strong)" }}>
            Drop a lower card here to promote
          </div>
        ) : (
          goals.map((g) => <DraggableGoalCard key={g.id} g={g} />)
        )}
      </div>
    </div>
  );
}

function WeekLevelColumn({ weekly, canWrite, onPct, busy }: { weekly: WeeklyDTO[]; canWrite: boolean; onPct: (id: string, pct: number) => void; busy: string | null }) {
  const { setNodeRef } = useDroppable({ id: "lvl:week" });
  const items = [...weekly].sort((a, b) => a.weekNo - b.weekNo);
  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[72vh] min-w-[240px] shrink-0 flex-col rounded-2xl border-2 bg-white/80"
      style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="flex items-baseline gap-2 border-b-2 px-3.5 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>Weekly</span>
        <span className="text-[11.5px] font-medium text-ink-muted">the leaf</span>
        <span className="ml-auto inline-flex min-w-5 justify-center rounded-full bg-surface-soft px-1.5 text-[11px] font-black tabular-nums text-ink-soft">{items.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        {items.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed px-4 py-8 text-center text-[12px] text-ink-muted/70" style={{ borderColor: "var(--color-hairline-strong)" }}>
            No weekly goals yet.
          </div>
        ) : (
          items.map((w) => <WeeklyCard key={w.id} w={w} canWrite={canWrite} onPct={onPct} busy={busy === `wpct:${w.id}`} />)
        )}
      </div>
    </div>
  );
}
