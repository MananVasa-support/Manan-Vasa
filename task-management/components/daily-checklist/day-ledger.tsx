"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Plus,
  ArrowRight,
  CornerUpRight,
  Target,
  Circle,
  Trash2,
  Loader2,
} from "lucide-react";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import { fireToast } from "@/lib/toast";
import {
  pullGoalToToday,
  addStandaloneItem,
  closeItem,
  removeItem,
  moveOverdueToToday,
} from "@/app/(app)/daily-checklist/actions";
import type { DailyItem, OverdueItem, PullableGoal } from "@/lib/queries/daily-checklist";

interface Props {
  mode: "page" | "gate";
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  pullable: PullableGoal[];
}

export function DayLedger({ mode, greetingName, today, items: pItems, overdue: pOverdue, pullable: pPullable }: Props) {
  const router = useRouter();
  // Per-action busy key — NOT useTransition. A transition kept `pending` true
  // through the whole (slow) server refresh, disabling every button so you
  // couldn't add a second item. `busyId` clears the moment the action returns;
  // the refresh runs in the background.
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const isGate = mode === "gate";

  // Page mode is server-driven (refresh after each write). Gate mode builds the
  // plan optimistically in local state so the gate doesn't drop after the first
  // commit — the user assembles the whole day, then clicks "Start my day".
  const [items, setItems] = React.useState(pItems);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [pullable, setPullable] = React.useState(pPullable);
  React.useEffect(() => setItems(pItems), [pItems]);
  React.useEffect(() => setOverdue(pOverdue), [pOverdue]);
  React.useEffect(() => setPullable(pPullable), [pPullable]);

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total > 0 ? (doneCount / total) * 100 : 0;

  type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };
  async function act(key: string, fn: () => Promise<Res>, onOk: (r: { ok: true; [k: string]: unknown }) => void) {
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Apply the result optimistically in BOTH modes so the list updates
      // instantly; in page mode also refresh in the background to re-sync from
      // the server. Neither blocks the buttons (busyId clears in `finally`).
      onOk(res);
      if (!isGate) router.refresh();
    } catch (e: unknown) {
      fireToast({ message: e instanceof Error ? e.message : "Something went wrong.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const onPull = (g: PullableGoal) =>
    act(g.id, () => pullGoalToToday(g.id), (r) => {
      const item = (r as unknown as { item: DailyItem | null }).item;
      if (item) setItems((p) => [...p, item]);
      setPullable((p) => p.filter((x) => x.id !== g.id));
    });

  const onAdd = (fd: FormData) =>
    act("add", () => addStandaloneItem(fd), (r) => setItems((p) => [...p, (r as unknown as { item: DailyItem }).item]));

  const onMoveOverdue = () =>
    act("overdue", () => moveOverdueToToday(), (r) => {
      setItems((p) => [...p, ...(r as unknown as { items: DailyItem[] }).items]);
      setOverdue([]);
    });

  const onToggle = (it: DailyItem, done: boolean) =>
    act(it.id, () => closeItem(it.id, done), () => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, done } : x))));

  const onNote = (it: DailyItem, note: string) =>
    act(it.id, () => closeItem(it.id, it.done, note), () => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, doneNote: note } : x))));

  const onRemove = (it: DailyItem) =>
    act(it.id, () => removeItem(it.id), () => setItems((p) => p.filter((x) => x.id !== it.id)));

  return (
    <div
      className={
        isGate
          ? "min-h-dvh w-full flex flex-col items-center px-4 py-10"
          : "mx-auto max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16"
      }
      style={isGate ? { background: "var(--color-canvas-base)" } : undefined}
    >
      <div className={isGate ? "w-full max-w-[760px]" : "w-full"}>
        {/* ── Header: title + day-completion ring (the signature) ── */}
        <header className="flex items-start justify-between gap-6 mb-7">
          <div className="min-w-0">
            {isGate && (
              <div className="text-[11px] uppercase tracking-[0.18em] text-altus-red font-bold mb-1">
                Plan before you start{greetingName ? ` · ${greetingName}` : ""}
              </div>
            )}
            <div className="text-[13px] uppercase tracking-[0.14em] text-ink-subtle font-bold">
              {today.weekday}
            </div>
            <h1
              className="mt-0.5 text-ink-strong"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "clamp(38px, 5vw, 56px)",
                lineHeight: 0.98,
                letterSpacing: "-0.02em",
              }}
            >
              Today
            </h1>
            <p className="mt-2 text-body-lg text-ink-subtle">
              {today.date} ·{" "}
              {total === 0
                ? "Commit what you'll get done today."
                : doneCount === total
                  ? "Every commitment closed. Strong day."
                  : `${doneCount} of ${total} done${isGate ? "" : " — close out the rest tonight"}.`}
            </p>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <ScoreRing value={pct} size={84} label={`${Math.round(pct)}% of today done`} />
            <span className="mt-1.5 tabular-nums font-bold text-ink-soft" style={{ fontSize: 13 }}>
              {doneCount}/{total}
            </span>
          </div>
        </header>

        {/* ── Overdue strip ── */}
        {overdue.length > 0 && (
          <div
            className="mb-5 flex items-center justify-between gap-3 rounded-section border px-4 py-3"
            style={{ borderColor: "var(--color-amber)", background: "color-mix(in srgb, var(--color-amber) 9%, transparent)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CornerUpRight size={18} strokeWidth={2.4} style={{ color: "var(--color-amber-deep)" }} className="shrink-0" />
              <span className="font-semibold text-ink-strong truncate" style={{ fontSize: 14 }}>
                {overdue.length} unfinished item{overdue.length === 1 ? "" : "s"} from earlier
              </span>
            </div>
            <button
              type="button"
              onClick={onMoveOverdue}
              disabled={busyId === "overdue"}
              className="inline-flex items-center gap-1.5 rounded-md py-2 px-3.5 text-[13px] font-bold text-white shrink-0 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--color-amber), var(--color-amber-deep))" }}
            >
              {busyId === "overdue" ? <Loader2 size={14} className="animate-spin" /> : <CornerUpRight size={14} strokeWidth={2.6} />}
              Move all to today
            </button>
          </div>
        )}

        {/* ── Today's commitments (the ledger) ── */}
        <section
          className="rounded-section bg-surface-card border border-hairline p-6 max-md:p-4 mb-5"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <h2 className="text-display-lg text-ink-strong mb-4">Today&apos;s commitments</h2>

          {items.length === 0 ? (
            <p className="text-body-lg text-ink-subtle py-6 text-center">
              Nothing yet — pull from your weekly goals below, or add an item.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--color-hairline)" }}>
              {items.map((it) => (
                <LedgerRow
                  key={it.id}
                  item={it}
                  closeout={!isGate}
                  busy={busyId === it.id}
                  onToggle={(done) => onToggle(it, done)}
                  onNote={(note) => onNote(it, note)}
                  onRemove={() => onRemove(it)}
                />
              ))}
            </ul>
          )}

          <AddItem busy={busyId === "add"} onAdd={onAdd} />
        </section>

        {/* ── Pull from weekly goals ── */}
        {pullable.length > 0 && (
          <section
            className="rounded-section bg-surface-card border border-hairline p-6 max-md:p-4"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
          >
            <h2 className="text-display-lg text-ink-strong mb-1">Pull from your weekly goals</h2>
            <p className="text-body-lg text-ink-subtle mb-4">
              Commit a goal to today — it joins the list as a goal-related item.
            </p>
            <ul className="space-y-2">
              {pullable.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Target size={16} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-strong truncate" style={{ fontSize: 14 }}>
                        {g.targetDone || g.subject || "Weekly goal"}
                      </div>
                      {(g.client || g.subject) && (
                        <div className="text-ink-subtle truncate" style={{ fontSize: 12 }}>
                          {[g.client, g.subject].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="tabular-nums font-bold text-ink-subtle" style={{ fontSize: 12 }}>
                      {g.weight} wt
                    </span>
                    <button
                      type="button"
                      onClick={() => onPull(g)}
                      disabled={busyId === g.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card py-1.5 px-3 text-[13px] font-semibold text-ink-strong hover:border-altus-red hover:text-altus-red transition-colors disabled:opacity-50"
                    >
                      {busyId === g.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} strokeWidth={2.4} />}
                      Move to today
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Gate footer ── */}
        {isGate && (
          <div className="mt-7 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => router.refresh()}
              disabled={total === 0}
              className="inline-flex items-center gap-2 rounded-lg py-3 px-7 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              Start my day <ArrowRight size={17} strokeWidth={2.6} />
            </button>
            <p className="text-ink-subtle" style={{ fontSize: 13 }}>
              {total === 0
                ? "Add at least one commitment to continue."
                : `${total} committed — you can add more once you're in.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── one ledger row ── */
function LedgerRow({
  item,
  closeout,
  busy,
  onToggle,
  onNote,
  onRemove,
}: {
  item: DailyItem;
  closeout: boolean;
  busy: boolean;
  onToggle: (done: boolean) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = React.useState(item.doneNote ?? "");
  const goal = item.origin === "goal_related";

  return (
    <li className="flex items-start gap-3 py-3 group">
      {/* check / toggle — only when closing out (page), not while planning (gate) */}
      {closeout ? (
        <button
          type="button"
          onClick={() => onToggle(!item.done)}
          disabled={busy}
          aria-pressed={item.done}
          aria-label={item.done ? "Mark not done" : "Mark done"}
          className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-50"
          style={
            item.done
              ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))", borderColor: "transparent" }
              : { borderColor: "var(--color-hairline-strong)" }
          }
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin text-ink-subtle" />
          ) : item.done ? (
            <Check size={13} strokeWidth={3.2} className="text-white" />
          ) : null}
        </button>
      ) : (
        <span
          aria-hidden
          className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full"
          style={{ color: goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}
        >
          <Circle size={10} strokeWidth={0} fill="currentColor" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {closeout && (
            <span aria-hidden className="inline-flex shrink-0" title={goal ? "Goal related" : "Stand-alone"} style={{ color: goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>
              <Circle size={8} strokeWidth={0} fill="currentColor" />
            </span>
          )}
          <span
            className={`font-semibold ${item.done ? "text-ink-subtle line-through" : "text-ink-strong"}`}
            style={{ fontSize: 14.5 }}
          >
            {item.title}
          </span>
          {item.movedFromDate && (
            <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0" style={{ color: "var(--color-amber-deep)", background: "color-mix(in srgb, var(--color-amber) 14%, transparent)" }}>
              carried
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>
            {goal ? "Goal" : "Stand-alone"}
          </span>
          {(item.client || item.subject) && (
            <span className="text-ink-subtle truncate" style={{ fontSize: 12 }}>
              · {[item.client, item.subject].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        {/* note (night close-out) — page only */}
        {closeout && (
          <input
            type="text"
            defaultValue={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((note ?? "") !== (item.doneNote ?? "")) onNote(note);
            }}
            placeholder="Add a note on what happened…"
            className="mt-1.5 w-full bg-transparent text-[13px] text-ink-soft placeholder:text-ink-subtle outline-none border-b border-transparent focus:border-hairline-strong py-0.5"
          />
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label="Remove item"
        className="mt-0.5 shrink-0 text-ink-subtle hover:text-altus-red transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
      >
        <Trash2 size={15} strokeWidth={2.2} />
      </button>
    </li>
  );
}

/* ── add ad-hoc item ── */
function AddItem({ busy, onAdd }: { busy: boolean; onAdd: (fd: FormData) => void }) {
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) => {
        onAdd(fd);
        ref.current?.reset();
      }}
      className="mt-4 flex items-center gap-2"
    >
      <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: "var(--color-hairline-strong)" }}>
        <Plus size={13} strokeWidth={2.6} className="text-ink-subtle" />
      </span>
      <input
        name="title"
        type="text"
        required
        maxLength={280}
        placeholder="Add something you'll do today…"
        className="flex-1 bg-transparent text-[14.5px] text-ink-strong placeholder:text-ink-subtle outline-none border-b border-hairline focus:border-altus-red py-1"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md py-1.5 px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        Add
      </button>
    </form>
  );
}
