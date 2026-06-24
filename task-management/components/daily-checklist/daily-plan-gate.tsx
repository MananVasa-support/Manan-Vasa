"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "motion/react";
import { ArrowRight, Plus, Check, Target, X, CornerUpRight, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  pullGoalToToday,
  addStandaloneItem,
  removeItem,
  moveOverdueToToday,
} from "@/app/(app)/daily-checklist/actions";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import type { DailyItem, OverdueItem, PullableGoal } from "@/lib/queries/daily-checklist";

/* ── Daily-plan gate — the surface users hit each morning. Plan at least five
 *    things you'll get done today, then start. Neutral-enterprise design on the
 *    app's tokens (matches the Weekly Goals board). This is a daily checklist,
 *    NOT attendance. Fail-open: the layout never blocks login on a DB hiccup. ── */

const MIN = MIN_DAILY_ITEMS;

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

interface Props {
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  pullable: PullableGoal[];
}

export function DailyPlanGate({
  greetingName,
  today,
  items: pItems,
  overdue: pOverdue,
  pullable: pPullable,
}: Props) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // Local state mirrors the server: every add/pull/remove updates it FROM the
  // authoritative row the action returns (not a guess), so the count never
  // diverges and "Start my day" can trust it. The layout re-checks the gate only
  // when "Start my day" calls router.refresh().
  const [items, setItems] = React.useState(pItems);
  const [pullable, setPullable] = React.useState(pPullable);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Count of committed items (the real number — required is MIN). One source of
  // truth used by the dial, the "to go" line and the commit hint.
  const count = items.length;
  const met = count >= MIN;
  const remaining = Math.max(0, MIN - count);
  const extra = Math.max(0, count - MIN);
  // Slots: at least MIN; if the user commits more, the ledger grows with them.
  const slotCount = Math.max(MIN, count);

  // Autofocus the commit input on FIRST mount only — never steal focus on a
  // re-render (which would yank focus away mid-typing after each add).
  React.useEffect(() => {
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };
  async function act(
    key: string,
    fn: () => Promise<Res>,
    onOk: (r: { ok: true; [k: string]: unknown }) => void,
    onFail?: (error: string) => void,
  ) {
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) {
        if (onFail) onFail(res.error);
        else fireToast({ message: res.error, type: "error" });
        return;
      }
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
    // Clear the input optimistically, but keep it focused for the next entry.
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
    act(
      "add",
      () => addStandaloneItem(fd),
      (r) => {
        // Append the AUTHORITATIVE row the server returned (not a guess) so the
        // count reliably reflects the add without any manual reload.
        const item = (r as unknown as { item: DailyItem }).item;
        if (item) setItems((p) => [...p, item]);
        inputRef.current?.focus();
      },
    );
  }

  const onPull = (g: PullableGoal) =>
    act(
      g.id,
      () => pullGoalToToday(g.id),
      (r) => {
        const item = (r as unknown as { item: DailyItem | null }).item;
        if (item) {
          // Real new row → commit it and drop the pill.
          setItems((p) => [...p, item]);
          setPullable((p) => p.filter((x) => x.id !== g.id));
        } else {
          // No-op (already on today's list) — keep the pill, tell the user.
          fireToast({ message: "That goal is already on today's list.", type: "info" });
        }
      },
    );

  const onRemove = (it: DailyItem) =>
    act(it.id, () => removeItem(it.id), () => setItems((p) => p.filter((x) => x.id !== it.id)));

  const onMoveOverdue = () =>
    act("overdue", () => moveOverdueToToday(), (r) => {
      setItems((p) => [...p, ...(r as unknown as { items: DailyItem[] }).items]);
      setOverdue([]);
    });

  function startDay() {
    // Trust the local count, which mirrors the server (rows returned from each
    // add). The layout re-checks needsDailyPlan on refresh and drops the gate.
    if (!met || entering) return;
    setEntering(true);
    router.refresh();
    // Fail-safe for a LOGIN-blocking gate: if the refresh doesn't drop the gate
    // within a few seconds (a transient read still seeing <5, slow network),
    // re-enable the button so the user can never be trapped on a spinner.
    window.setTimeout(() => setEntering(false), 4000);
  }

  const goId = "daily-plan-togo";

  return (
    <main
      className="relative min-h-screen w-full"
      style={{
        background:
          "linear-gradient(180deg, var(--color-surface-soft) 0%, color-mix(in srgb, var(--color-surface-track) 60%, var(--color-surface-soft)) 100%)",
        color: "var(--color-ink-strong)",
      }}
    >
      <div className="mx-auto max-w-[1180px] px-8 max-md:px-4 pt-8 pb-20">
        {/* ── Eyebrow + date ── */}
        <div className="wg-rise flex items-center justify-between gap-4 flex-wrap">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "var(--color-altus-red-deep)" }}
          >
            Plan your day{greetingName ? ` · ${greetingName}` : ""}
          </span>
          <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
            {today.weekday} · {today.date}
          </span>
        </div>
        <div aria-hidden className="wg-rise mt-3 h-px w-full" style={{ background: "var(--color-hairline)" }} />

        {/* ── Title + planning subtitle ── */}
        <header className="wg-rise mt-6" style={{ animationDelay: "40ms" }}>
          <h1
            className="font-bold"
            style={{
              color: "var(--color-ink-strong)",
              fontSize: "clamp(30px, 3.4vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
            }}
          >
            Plan what you&apos;ll get done today
          </h1>
          <p
            className="mt-2.5 max-w-[58ch] font-medium"
            style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-ink-muted)" }}
          >
            {met
              ? "Your plan is set. Add more if you like, then start your day."
              : `Commit at least ${MIN} things you'll get done today — pull from your weekly goals, or write your own — then start.`}
          </p>
        </header>

        {/* ── Carry-forward (only if any unfinished items remain) ── */}
        <AnimatePresence>
          {overdue.length > 0 && (
            <motion.button
              type="button"
              onClick={onMoveOverdue}
              disabled={busyId === "overdue"}
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`wg-btn mt-5 inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-[13.5px] font-bold cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
              style={{
                background: "color-mix(in srgb, var(--color-amber) 12%, transparent)",
                color: "var(--color-amber-deep)",
                border: "1px solid color-mix(in srgb, var(--color-amber) 36%, transparent)",
              }}
            >
              {busyId === "overdue" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CornerUpRight size={15} strokeWidth={2.6} />
              )}
              Carry forward {overdue.length} unfinished item{overdue.length === 1 ? "" : "s"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Main grid: ledger (focal) + rail. Stacks on lg-down; nothing clips,
            the PAGE scrolls (no nested fixed-height scrollboxes). ── */}
        <div className="mt-6 grid grid-cols-[1.45fr_1fr] gap-8 max-lg:grid-cols-1 max-lg:gap-6 items-start">
          {/* ── LEFT: the ledger ── */}
          <section
            className="wg-rise min-w-0 rounded-section bg-surface-card border border-hairline p-6 max-md:p-5"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: "80ms" }}
          >
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-ink-strong" style={{ fontSize: 20, letterSpacing: "-0.01em" }}>
                Today&apos;s plan
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold tabular-nums"
                style={{
                  background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                  color: "var(--color-altus-red-deep)",
                }}
              >
                {count} of {MIN} committed{extra > 0 ? ` · +${extra}` : ""}
              </span>
            </div>

            {/* The ledger — at least MIN numbered lines; filled lines are commitments. */}
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

            {/* command bar — the most obvious action on screen */}
            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                addItem(inputRef.current?.value ?? "");
              }}
            >
              <div
                className="flex items-center gap-2.5 rounded-2xl border-2 bg-surface-card px-3 py-2 transition-colors focus-within:border-[var(--color-altus-red)]"
                style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
              >
                <span
                  aria-hidden
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
                >
                  <Plus size={19} strokeWidth={2.6} />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={280}
                  autoComplete="off"
                  aria-label="What you'll get done today"
                  placeholder="Add something you'll get done today…"
                  className={`flex-1 min-w-0 bg-transparent text-[16px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle py-2 ${FOCUS_RING}`}
                />
                <button
                  type="submit"
                  disabled={busyId === "add"}
                  className={`wg-btn wg-sheen inline-flex shrink-0 items-center gap-2 rounded-xl py-3 px-6 text-[15px] font-bold text-white cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)" }}
                >
                  {busyId === "add" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.8} />}
                  Add
                </button>
              </div>
              <p className="mt-2 text-[12.5px] font-medium text-ink-subtle">
                Press Enter to add ·{" "}
                {met
                  ? "minimum met — add more if you like."
                  : `${remaining} more to start your day.`}
              </p>
            </form>
          </section>

          {/* ── RIGHT: progress + start CTA + pull-from-goals ── */}
          <div className="min-w-0 flex flex-col gap-6">
            {/* progress dial + start CTA */}
            <section
              className="wg-rise rounded-section bg-surface-card border border-hairline p-5"
              style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: "120ms" }}
            >
              <div className="flex items-center gap-5 min-w-0">
                <ProgressDial count={count} reduce={!!reduce} />
                <div className="min-w-0">
                  <div
                    className="font-bold text-ink-strong"
                    style={{ fontSize: 21, lineHeight: 1.1, letterSpacing: "-0.01em" }}
                  >
                    {met ? "You're ready" : `${remaining} to go`}
                  </div>
                  <div id={goId} className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 13.5 }}>
                    {count} of {MIN} committed{extra > 0 ? ` · +${extra} extra` : ""}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={startDay}
                disabled={!met || entering}
                aria-describedby={met ? undefined : goId}
                className={`wg-btn ${met ? "wg-sheen" : ""} mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl py-4 px-6 text-[16px] font-bold cursor-pointer disabled:cursor-not-allowed ${FOCUS_RING}`}
                style={
                  met
                    ? {
                        background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                        color: "#fff",
                        boxShadow: "0 14px 34px -10px rgba(225,6,0,0.6)",
                      }
                    : {
                        background: "var(--color-surface-track)",
                        color: "var(--color-ink-subtle)",
                      }
                }
              >
                {entering ? <Loader2 size={18} className="animate-spin" /> : null}
                Start my day <ArrowRight size={18} strokeWidth={2.6} />
              </button>
            </section>

            {/* pull from weekly goals — fast fill */}
            <section
              className="wg-rise rounded-section bg-surface-card border border-hairline p-5"
              style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: "160ms" }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className="font-bold text-ink-strong" style={{ fontSize: 17 }}>From your weekly goals</h3>
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">one tap</span>
              </div>
              <p className="mb-3 font-medium text-ink-subtle" style={{ fontSize: 13, lineHeight: 1.45 }}>
                Commit a weekly goal straight to today.
              </p>
              {pullable.length === 0 ? (
                <p className="font-medium py-6 text-center text-ink-subtle" style={{ fontSize: 13.5 }}>
                  {items.some((i) => i.origin === "goal_related")
                    ? "All goals pulled in."
                    : "No weekly goals to pull."}
                </p>
              ) : (
                <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  <AnimatePresence initial={false}>
                    {pullable.map((g) => {
                      const label = g.targetDone || g.subject || "Weekly goal";
                      return (
                        <motion.li
                          key={g.id}
                          layout={!reduce}
                          initial={reduce ? false : { opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 12, transition: { duration: 0.18 } }}
                          className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3 py-2.5"
                        >
                          <Target size={15} strokeWidth={2.3} style={{ color: "var(--color-altus-red)" }} className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink-strong" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
                              {label}
                            </div>
                            {(g.client || g.subject) && (
                              <div className="text-ink-subtle" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                                {[g.client, g.subject].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onPull(g)}
                            disabled={busyId === g.id}
                            aria-label={`Add "${label}" to today`}
                            className={`wg-btn inline-flex size-9 shrink-0 items-center justify-center rounded-lg cursor-pointer disabled:opacity-50 ${FOCUS_RING}`}
                            style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
                          >
                            {busyId === g.id ? <Loader2 size={15} className="animate-spin" /> : <Plus size={17} strokeWidth={2.8} />}
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── one ledger line — a commitment (filled) or an empty numbered slot ── */
function LedgerLine({
  index,
  item,
  busy,
  reduce,
  onRemove,
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
      style={{ borderBottom: "1px solid var(--color-hairline)" }}
    >
      {/* index / committed check */}
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums text-[13px] font-bold"
        style={
          item
            ? {
                background: goal
                  ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                  : "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
                color: "#fff",
              }
            : {
                border: "1.5px dashed var(--color-hairline-strong)",
                color: "var(--color-ink-subtle)",
              }
        }
      >
        {item ? <Check size={15} strokeWidth={3} /> : index}
      </span>

      {/* text */}
      {item ? (
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-ink-strong break-words" style={{ fontSize: 16, overflowWrap: "anywhere" }}>
            {item.title}
          </span>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}
          >
            {goal ? "Goal" : "Self"}
            {item.client || item.subject ? ` · ${[item.client, item.subject].filter(Boolean).join(" · ")}` : ""}
          </span>
        </span>
      ) : (
        <span className="flex-1 min-w-0 font-medium text-ink-subtle" style={{ fontSize: 15 }}>
          Add something you&apos;ll get done…
        </span>
      )}

      {/* remove — reserved trailing slot. Revealed on hover AND keyboard focus
          (focus-within), tappable on touch; never rendered on empty slots. */}
      <span className="shrink-0 inline-flex size-8 items-center justify-center">
        {item && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove "${item.title}"`}
            className={`inline-flex size-8 items-center justify-center rounded-md text-ink-subtle hover:text-altus-red transition-opacity disabled:opacity-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100 ${FOCUS_RING}`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <X size={17} strokeWidth={2.4} />}
          </button>
        )}
      </span>
    </motion.li>
  );
}

/* ── animated count / MIN completion arc ── */
function ProgressDial({ count, reduce }: { count: number; reduce: boolean }) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, count / MIN);
  const met = count >= MIN;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={met ? "var(--color-green)" : "var(--color-altus-red)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={reduce ? { duration: 0.01 } : { type: "spring", stiffness: 120, damping: 22 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums leading-none"
          style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, color: "var(--color-ink-strong)" }}
        >
          {count}
        </span>
        <span className="text-[11px] font-bold text-ink-subtle">of {MIN}</span>
      </div>
    </div>
  );
}
