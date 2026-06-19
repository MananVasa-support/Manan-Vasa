"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowRight, Plus, Check, Target, X, CornerUpRight, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  pullGoalToToday,
  addStandaloneItem,
  removeItem,
  moveOverdueToToday,
} from "@/app/(app)/daily-checklist/actions";
import type { DailyItem, OverdueItem, PullableGoal } from "@/lib/queries/daily-checklist";

/* ── Day Ledger gate — brand brief in references; the five ruled lines that
 *    ink-fill ARE the page. Warm paper · warm-black ink · decisive red · gold
 *    "earned" tone. Fast: motion + parallax, no WebGL. ── */

const MIN = 5;
const PAPER_1 = "#F4EEE3";
const PAPER_2 = "#FBF7F0";
const INK = "#1B140E";
const INK_SOFT = "#6F6457";
const INK_FAINT = "rgba(27,20,14,0.10)";
const RED = "#E10600";
const RED_DEEP = "#A80400";
const GOLD = "#B8893B";
const SERIF = "var(--font-editorial), Georgia, serif";

interface Props {
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  pullable: PullableGoal[];
}

export function DailyPlanGate({ greetingName, today, items: pItems, overdue: pOverdue, pullable: pPullable }: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // Optimistic local state — the gate assembles the whole day without a server
  // round-trip per add (the layout re-checks only when "Start my day" refreshes).
  const [items, setItems] = React.useState(pItems);
  const [pullable, setPullable] = React.useState(pPullable);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const count = items.length;
  const met = count >= MIN;
  const remaining = Math.max(0, MIN - count);
  // Slots: at least 5; if the user commits more, the ledger grows with them.
  const slotCount = Math.max(MIN, count);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };
  async function act(key: string, fn: () => Promise<Res>, onOk: (r: { ok: true; [k: string]: unknown }) => void) {
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      onOk(res);
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Something went wrong.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function addItem(title: string) {
    const t = title.trim();
    if (t.length < 2) return;
    const fd = new FormData();
    fd.set("title", t);
    act("add", () => addStandaloneItem(fd), (r) => setItems((p) => [...p, (r as unknown as { item: DailyItem }).item]));
    if (inputRef.current) inputRef.current.value = "";
  }

  const onPull = (g: PullableGoal) =>
    act(g.id, () => pullGoalToToday(g.id), (r) => {
      const item = (r as unknown as { item: DailyItem | null }).item;
      if (item) setItems((p) => [...p, item]);
      setPullable((p) => p.filter((x) => x.id !== g.id));
    });

  const onRemove = (it: DailyItem) =>
    act(it.id, () => removeItem(it.id), () => setItems((p) => p.filter((x) => x.id !== it.id)));

  const onMoveOverdue = () =>
    act("overdue", () => moveOverdueToToday(), (r) => {
      setItems((p) => [...p, ...(r as unknown as { items: DailyItem[] }).items]);
      setOverdue([]);
    });

  function startDay() {
    if (!met) return;
    setEntering(true);
    router.refresh();
  }

  // Pointer-parallax ink wash — depth without WebGL. Subtle, reduced-motion-safe.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const washX = useTransform(sx, [-0.5, 0.5], [18, -18]);
  const washY = useTransform(sy, [-0.5, 0.5], [14, -14]);
  function onMove(e: React.MouseEvent) {
    if (reduce) return;
    px.set(e.clientX / window.innerWidth - 0.5);
    py.set(e.clientY / window.innerHeight - 0.5);
  }

  const rise = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.01 } }
    : undefined;

  return (
    <div
      onMouseMove={onMove}
      className="relative h-dvh w-full overflow-hidden"
      style={{ background: `linear-gradient(160deg, ${PAPER_1} 0%, ${PAPER_2} 60%)`, color: INK }}
    >
      {/* ── ambient depth: ink wash (parallax) + ruled-paper texture ── */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-24"
        style={{
          x: reduce ? 0 : washX,
          y: reduce ? 0 : washY,
          background: `radial-gradient(48% 42% at 82% 6%, rgba(225,6,0,0.10) 0%, transparent 70%), radial-gradient(40% 38% at 6% 92%, rgba(184,137,59,0.10) 0%, transparent 72%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: `repeating-linear-gradient(${INK_FAINT} 0 1px, transparent 1px 38px)`, maskImage: "linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent)" }}
      />

      {/* ── content: editorial split, fills the viewport, no page scroll ── */}
      <div className="relative h-full mx-auto max-w-[1180px] px-8 max-md:px-4 py-6 flex flex-col min-h-0">
        {/* eyebrow rule */}
        <div className="shrink-0 flex items-center justify-between gap-4">
          <span className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: RED_DEEP }}>
            Plan before you start{greetingName ? ` · ${greetingName}` : ""}
          </span>
          <span className="text-[12px] font-bold tabular-nums" style={{ color: INK_SOFT }}>
            {today.weekday} · {today.date}
          </span>
        </div>
        <div aria-hidden className="shrink-0 mt-2 h-px w-full" style={{ background: INK_FAINT }} />

        {/* main grid */}
        <div className="flex-1 min-h-0 grid grid-cols-[1.45fr_1fr] gap-10 max-lg:grid-cols-1 max-lg:gap-6 pt-5">
          {/* ── LEFT: the ledger (focal) ── */}
          <div className="flex flex-col min-h-0">
            <motion.h1
              {...(rise ?? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { type: "spring", stiffness: 240, damping: 26 } })}
              style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: "clamp(56px, 8vw, 104px)", lineHeight: 0.86, letterSpacing: "-0.03em", color: INK }}
            >
              Today
            </motion.h1>
            <p className="mt-3 shrink-0 font-medium" style={{ fontSize: 16, lineHeight: 1.5, color: INK_SOFT, maxWidth: "42ch" }}>
              Rule in {met ? "your day" : `at least ${MIN} things`} you&apos;ll get done. Pull from your goals, or write your own — then start.
            </p>
            {/* D14 + B30 — this is the record now (replaces the WhatsApp morning
                message); not committing the day reads as absent. */}
            <p className="mt-2 shrink-0 text-[13px] font-semibold" style={{ color: RED_DEEP, maxWidth: "46ch" }}>
              This is your attendance for the day — it replaces the WhatsApp morning message.
              Skip it and you&apos;ll be marked <span className="font-black">absent</span>.
            </p>

            {/* overdue carry-forward (only if any) */}
            <AnimatePresence>
              {overdue.length > 0 && (
                <motion.button
                  type="button"
                  onClick={onMoveOverdue}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  whileHover={reduce ? undefined : { y: -1 }}
                  className="mt-4 shrink-0 inline-flex items-center gap-2 self-start rounded-full px-3.5 py-1.5 text-[13px] font-bold cursor-pointer"
                  style={{ background: "rgba(184,137,59,0.14)", color: "#7a5a18", border: "1px solid rgba(184,137,59,0.4)" }}
                >
                  {busyId === "overdue" ? <Loader2 size={14} className="animate-spin" /> : <CornerUpRight size={14} strokeWidth={2.6} />}
                  Carry forward {overdue.length} unfinished
                </motion.button>
              )}
            </AnimatePresence>

            {/* the ledger — five ruled lines that ink-fill */}
            <div className="mt-5 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
              <ul>
                <AnimatePresence initial={false}>
                  {Array.from({ length: slotCount }).map((_, i) => {
                    const it = items[i];
                    return (
                      <LedgerLine
                        key={it ? it.id : `slot-${i}`}
                        index={i + 1}
                        item={it}
                        reduce={!!reduce}
                        busy={it ? busyId === it.id : false}
                        onRemove={it ? () => onRemove(it) : undefined}
                      />
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>

            {/* command bar — the most obvious action on screen */}
            <form
              className="mt-4 shrink-0"
              onSubmit={(e) => { e.preventDefault(); addItem(inputRef.current?.value ?? ""); }}
            >
              <div
                className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 transition-colors focus-within:border-[var(--color-altus-red)]"
                style={{ border: `2px solid ${INK_FAINT}`, boxShadow: "0 1px 2px rgba(27,20,14,0.05), 0 10px 30px -18px rgba(27,20,14,0.25)" }}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(225,6,0,0.10)", color: RED }}>
                  <Plus size={18} strokeWidth={2.7} />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={280}
                  autoComplete="off"
                  placeholder="Commit something you'll do today…"
                  className="flex-1 min-w-0 bg-transparent text-[16px] font-medium outline-none placeholder:text-[color:var(--color-ink-subtle)]"
                  style={{ color: INK }}
                />
                <motion.button
                  type="submit"
                  disabled={busyId === "add"}
                  whileHover={reduce ? undefined : { scale: 1.04 }}
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-2 text-[14px] font-bold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  {busyId === "add" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.8} />}
                  Add
                </motion.button>
              </div>
              <p className="mt-1.5 text-[12.5px] font-medium" style={{ color: INK_SOFT }}>
                Press Enter to commit · {met ? "minimum met — add more if you like" : `${remaining} more to start your day`}.
              </p>
            </form>
          </div>

          {/* ── RIGHT: progress + pull-from-goals (the rail) ── */}
          <div className="flex flex-col min-h-0 gap-5">
            {/* progress dial + start CTA */}
            <div
              className="shrink-0 rounded-3xl bg-white/70 p-5 flex items-center gap-5"
              style={{ border: `1px solid ${INK_FAINT}`, boxShadow: "0 1px 2px rgba(27,20,14,0.05)", backdropFilter: "blur(6px)" }}
            >
              <ProgressDial count={count} reduce={!!reduce} />
              <div className="min-w-0">
                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 26, lineHeight: 1, color: INK }}>
                  {met ? "You're ready" : `${remaining} to go`}
                </div>
                <div className="mt-1 font-semibold" style={{ fontSize: 13.5, color: INK_SOFT }}>
                  {count} of {MIN} committed{met && count > MIN ? ` · +${count - MIN} extra` : ""}
                </div>
                <motion.button
                  type="button"
                  onClick={startDay}
                  disabled={!met || entering}
                  whileHover={met && !reduce ? { scale: 1.03 } : undefined}
                  whileTap={met && !reduce ? { scale: 0.97 } : undefined}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-bold text-white cursor-pointer disabled:cursor-not-allowed"
                  style={
                    met
                      ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 12px 30px -10px rgba(225,6,0,0.6)" }
                      : { background: "rgba(27,20,14,0.12)", color: "rgba(27,20,14,0.4)" }
                  }
                >
                  {entering ? <Loader2 size={16} className="animate-spin" /> : null}
                  Start my day <ArrowRight size={17} strokeWidth={2.7} />
                </motion.button>
              </div>
            </div>

            {/* pull from weekly goals — fast fill */}
            <div className="flex-1 min-h-0 flex flex-col rounded-3xl bg-white/70 p-5" style={{ border: `1px solid ${INK_FAINT}`, boxShadow: "0 1px 2px rgba(27,20,14,0.05)" }}>
              <div className="shrink-0 flex items-baseline justify-between gap-2 mb-1">
                <h2 style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 21, color: INK }}>From your goals</h2>
                <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: INK_SOFT }}>one tap</span>
              </div>
              <p className="shrink-0 mb-3 font-medium" style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.45 }}>
                Commit a weekly goal straight to today.
              </p>
              <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
                {pullable.length === 0 ? (
                  <p className="font-medium py-6 text-center" style={{ fontSize: 13.5, color: INK_SOFT }}>
                    {items.some((i) => i.origin === "goal_related") ? "All goals pulled in." : "No weekly goals to pull."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {pullable.map((g) => (
                        <motion.li
                          key={g.id}
                          layout={!reduce}
                          initial={reduce ? false : { opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12, transition: { duration: 0.18 } }}
                          className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5"
                          style={{ border: `1px solid ${INK_FAINT}` }}
                        >
                          <Target size={15} strokeWidth={2.3} style={{ color: RED }} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate" style={{ fontSize: 14, color: INK }}>{g.targetDone || g.subject || "Weekly goal"}</div>
                            {(g.client || g.subject) && (
                              <div className="truncate" style={{ fontSize: 12, color: INK_SOFT }}>{[g.client, g.subject].filter(Boolean).join(" · ")}</div>
                            )}
                          </div>
                          <motion.button
                            type="button"
                            onClick={() => onPull(g)}
                            disabled={busyId === g.id}
                            whileTap={reduce ? undefined : { scale: 0.92 }}
                            aria-label="Commit to today"
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg cursor-pointer disabled:opacity-50"
                            style={{ background: "rgba(225,6,0,0.10)", color: RED }}
                          >
                            {busyId === g.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} strokeWidth={2.8} />}
                          </motion.button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── one ruled ledger line — filled (a commitment) or an empty numbered slot ── */
function LedgerLine({
  index, item, busy, reduce, onRemove,
}: {
  index: number;
  item?: DailyItem;
  busy: boolean;
  reduce: boolean;
  onRemove?: () => void;
}) {
  const goal = item?.origin === "goal_related";
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="group flex items-center gap-4 py-3"
      style={{ borderBottom: `1px solid ${INK_FAINT}` }}
    >
      {/* index / ink check */}
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums"
        style={
          item
            ? { background: goal ? `linear-gradient(135deg, ${GOLD}, #8c6722)` : `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, color: "#fff" }
            : { border: `1.5px dashed ${INK_FAINT}`, color: "rgba(27,20,14,0.32)", fontSize: 13, fontWeight: 800 }
        }
      >
        {item ? <Check size={15} strokeWidth={3} /> : index}
      </span>

      {/* text */}
      {item ? (
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate" style={{ fontSize: 16.5, color: INK }}>{item.title}</span>
          <span className="text-[11px] font-black uppercase tracking-[0.1em]" style={{ color: goal ? "#8c6722" : INK_SOFT }}>
            {goal ? "Goal" : "Self"}{(item.client || item.subject) ? ` · ${[item.client, item.subject].filter(Boolean).join(" · ")}` : ""}
          </span>
        </span>
      ) : (
        <span className="flex-1 font-medium italic" style={{ fontSize: 16, color: "rgba(27,20,14,0.34)" }}>
          Commit something you&apos;ll do…
        </span>
      )}

      {/* remove (filled only) */}
      {item && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label="Remove"
          className="shrink-0 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
          style={{ color: INK_SOFT }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={16} strokeWidth={2.4} />}
        </button>
      )}
    </motion.li>
  );
}

/* ── animated N/MIN completion arc ── */
function ProgressDial({ count, reduce }: { count: number; reduce: boolean }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, count / MIN);
  const met = count >= MIN;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={INK_FAINT} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={met ? GOLD : RED}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={reduce ? { duration: 0.01 } : { type: "spring", stiffness: 120, damping: 22 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular-nums font-black leading-none" style={{ fontSize: 24, color: INK }}>{Math.min(count, MIN)}</span>
        <span className="text-[11px] font-bold" style={{ color: INK_SOFT }}>of {MIN}</span>
      </div>
    </div>
  );
}
