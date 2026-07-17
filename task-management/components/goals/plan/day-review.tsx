"use client";

import * as React from "react";
import { motion } from "motion/react";
import { CheckCircle2, Check, Sunrise, ClipboardCheck, ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import type { PlanItem, PlanPhase } from "./types";
import { setItemProgress, closeMyDay, reopenPlan } from "@/app/(app)/goals/plan/actions";

const GOALS_ACCENT = "#b45309";
const GOALS_ACCENT_DEEP = "#7c2d12";
const GOALS_GRADIENT = `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`;

/** Effective progress for a row: explicit % if logged, else 100 when ticked. */
function pctOf(it: PlanItem): number {
  if (it.donePct != null) return it.donePct;
  return it.done ? 100 : 0;
}

interface Props {
  phase: Exclude<PlanPhase, "plan">;
  items: PlanItem[];
  onToCloseout: () => void;
  onBackToPlan: () => void;
  onClosed: () => void;
  onReopened: () => void;
}

/**
 * The post-"Start my day" half of the unified Plan My Day page (Sir's transcript).
 *   active   — "your day is planned, you're set to clock in" + a way into close-out.
 *   closeout — the SAME commitments (no pull panels), each marked done / 0-100%.
 *   closed   — a read-only summary of how the day went.
 */
export function DayReview({ phase, items: initial, onToCloseout, onBackToPlan, onClosed, onReopened }: Props) {
  const [items, setItems] = React.useState<PlanItem[]>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => setItems(initial), [initial]);

  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const overallPct = total > 0 ? Math.round(items.reduce((s, i) => s + pctOf(i), 0) / total) : 0;

  const persist = React.useCallback(
    (id: string, done: boolean, pct: number | null, note?: string | null) => {
      setBusy(id);
      void setItemProgress(id, { done, pct, note })
        .then((r) => {
          if (!r.ok) fireToast({ message: r.error, type: "error" });
        })
        .finally(() => setBusy(null));
    },
    [],
  );

  const onToggle = (it: PlanItem) => {
    const done = !it.done;
    const pct = done ? 100 : 0;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, done, donePct: pct } : x)));
    persist(it.id, done, pct);
  };

  const onSlide = (it: PlanItem, pct: number) => {
    const done = pct === 100;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, donePct: pct, done } : x)));
  };
  const onSlideCommit = (it: PlanItem, pct: number) => persist(it.id, pct === 100, pct);

  const onNoteChange = (it: PlanItem, note: string) =>
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, doneNote: note } : x)));
  const onNoteCommit = (it: PlanItem) => {
    const done = pctOf(it) === 100 || it.done;
    persist(it.id, done, it.donePct ?? (it.done ? 100 : 0), it.doneNote ?? "");
  };

  const onFinish = () => {
    setBusy("__finish");
    void closeMyDay()
      .then((r) => (r.ok ? onClosed() : fireToast({ message: r.error, type: "error" })))
      .finally(() => setBusy(null));
  };
  const onReopen = () => {
    setBusy("__reopen");
    void reopenPlan()
      .then((r) => (r.ok ? (phase === "active" ? onBackToPlan() : onReopened()) : fireToast({ message: r.error, type: "error" })))
      .finally(() => setBusy(null));
  };

  // ── ACTIVE — day planned, before close-out ──────────────────────────────
  if (phase === "active") {
    return (
      <section className="mx-auto max-w-[720px] wg-rise">
        <div
          className="rounded-3xl border p-8 text-center max-md:p-6"
          style={{
            borderColor: `color-mix(in srgb, ${GOALS_ACCENT} 26%, transparent)`,
            background: `color-mix(in srgb, ${GOALS_ACCENT} 5%, #fff)`,
          }}
        >
          <span
            className="mx-auto grid size-16 place-items-center rounded-2xl text-white shadow-[0_10px_28px_rgba(124,45,18,0.3)]"
            style={{ background: GOALS_GRADIENT }}
          >
            <CheckCircle2 size={30} strokeWidth={2.3} />
          </span>
          <h2
            className="mt-4 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em" }}
          >
            Your day is planned
          </h2>
          <p className="mx-auto mt-1.5 max-w-[42ch] text-[15px] font-medium text-ink-muted">
            You&apos;re set to clock in. {total} commitment{total === 1 ? "" : "s"} lined up for today —
            come back at the end of the day to mark what you delivered.
          </p>

          <ul className="mx-auto mt-6 flex max-w-[520px] flex-col gap-2 text-left">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2.5 rounded-chip border border-hairline bg-surface-card px-3.5 py-2.5"
              >
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: GOALS_ACCENT }} />
                <span className="truncate text-[14px] font-medium text-ink-strong">{it.title}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-center justify-center gap-3 max-md:flex-col">
            <button
              type="button"
              onClick={onToCloseout}
              className="wg-btn wg-sheen inline-flex h-12 items-center gap-2 rounded-chip px-6 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(124,45,18,0.28)] max-md:w-full"
              style={{ background: GOALS_GRADIENT }}
            >
              <ClipboardCheck size={18} /> Close out my day
            </button>
            <button
              type="button"
              onClick={onReopen}
              disabled={busy === "__reopen"}
              className="inline-flex h-12 items-center gap-2 rounded-chip border border-hairline bg-surface-card px-5 text-[14px] font-semibold text-ink-soft hover:border-hairline-strong disabled:opacity-50 max-md:w-full"
            >
              {busy === "__reopen" ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeft size={16} />} Adjust plan
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── CLOSED — read-only summary ──────────────────────────────────────────
  const isClosed = phase === "closed";

  return (
    <section className="mx-auto max-w-[760px] wg-rise">
      <header className="mb-5 flex items-center gap-4 rounded-2xl border border-hairline bg-surface-card p-5">
        <div className={overallPct >= 100 ? "wg-ring-glow shrink-0" : "shrink-0"}>
          <ScoreRing value={overallPct} size={64} label={`${overallPct}% of today delivered`} />
        </div>
        <div className="min-w-0">
          <h2
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}
          >
            {isClosed ? "Day closed" : "Close out your day"}
          </h2>
          <p className="text-[14px] font-medium text-ink-muted">
            {isClosed
              ? `You delivered ${doneCount} of ${total} — ${overallPct}% overall.`
              : "Mark what you delivered — tick it, or drag the slider for partial progress."}
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-2.5">
        {items.map((it) => {
          const pct = pctOf(it);
          return (
            <li
              key={it.id}
              className="rounded-2xl border bg-surface-card p-4"
              style={{
                borderColor: it.done
                  ? "color-mix(in srgb, var(--color-green) 34%, transparent)"
                  : "var(--color-hairline)",
                background: it.done ? "color-mix(in srgb, var(--color-green) 5%, #fff)" : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onToggle(it)}
                  disabled={isClosed || busy === it.id}
                  aria-pressed={it.done}
                  aria-label={it.done ? "Mark not done" : "Mark done"}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:opacity-60"
                  style={
                    it.done
                      ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))", borderColor: "var(--color-green-deep)" }
                      : { borderColor: "var(--color-ink-soft)", background: "#fff" }
                  }
                >
                  {busy === it.id ? (
                    <Loader2 size={14} className="animate-spin text-ink-subtle" />
                  ) : it.done ? (
                    <Check size={16} strokeWidth={3.2} className="text-white" />
                  ) : null}
                </button>
                <span
                  className={"min-w-0 flex-1 text-[15px] font-semibold " + (it.done ? "text-ink-subtle line-through" : "text-ink-strong")}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {it.title}
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-black tabular-nums"
                  style={{
                    background: pct >= 100 ? "color-mix(in srgb, var(--color-green) 14%, transparent)" : `color-mix(in srgb, ${GOALS_ACCENT} 12%, transparent)`,
                    color: pct >= 100 ? "var(--color-green-deep)" : GOALS_ACCENT_DEEP,
                  }}
                >
                  {pct}%
                </span>
              </div>
              {!isClosed && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pct}
                    onChange={(e) => onSlide(it, Number(e.target.value))}
                    onMouseUp={(e) => onSlideCommit(it, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => onSlideCommit(it, Number((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => onSlideCommit(it, Number((e.target as HTMLInputElement).value))}
                    aria-label={`Progress on ${it.title}`}
                    className="plan-progress mt-3 w-full"
                    style={{ accentColor: GOALS_ACCENT }}
                  />
                  <input
                    type="text"
                    value={it.doneNote ?? ""}
                    onChange={(e) => onNoteChange(it, e.target.value)}
                    onBlur={() => onNoteCommit(it)}
                    maxLength={500}
                    placeholder="Add a note (optional) — what happened?"
                    aria-label={`Note on ${it.title}`}
                    className="mt-2 w-full rounded-chip border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] text-ink-soft placeholder:text-ink-muted/60 focus-visible:outline-2"
                    style={{ outlineColor: GOALS_ACCENT }}
                  />
                </>
              )}
              {isClosed && it.doneNote ? (
                <p className="mt-2 rounded-chip bg-surface-soft px-3 py-1.5 text-[13px] text-ink-soft">{it.doneNote}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3 max-md:flex-col-reverse">
        <button
          type="button"
          onClick={onReopen}
          disabled={busy === "__reopen"}
          className="inline-flex h-11 items-center gap-2 rounded-chip border border-hairline bg-surface-card px-5 text-[14px] font-semibold text-ink-soft hover:border-hairline-strong disabled:opacity-50 max-md:w-full"
        >
          {busy === "__reopen" ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeft size={16} />} Back to planning
        </button>
        {!isClosed ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={busy === "__finish"}
            className="wg-btn wg-sheen inline-flex h-11 items-center gap-2 rounded-chip px-6 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(124,45,18,0.28)] disabled:opacity-50 max-md:w-full"
            style={{ background: GOALS_GRADIENT }}
          >
            {busy === "__finish" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} Finish day
          </button>
        ) : (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 text-[14px] font-bold"
            style={{ color: GOALS_ACCENT_DEEP }}
          >
            <Sunrise size={16} /> Well done — that&apos;s a wrap on today.
          </motion.span>
        )}
      </div>
    </section>
  );
}
