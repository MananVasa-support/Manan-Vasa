"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, Flame, CheckCircle2, Loader2, StickyNote, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import type { DccItemRow, DccEntryRow, DccPerson } from "@/lib/queries/dcc";
import { DCC_STATUSES, dccStatusTone, isDueOn, isoDate, maskLabel } from "@/lib/dcc/util";
import { setDccEntry, createDccItem, updateDccItem, deleteDccItem, setDccReview } from "@/app/(app)/dcc/actions";

type ReviewRow = { ownerEmployeeId: string; reviewDate: string; status: string | null; note: string | null };

interface Props {
  ownerId: string;
  ownerName: string;
  meId: string;
  canFill: boolean;
  canReview: boolean;
  canManage: boolean;
  people: DccPerson[];
  items: DccItemRow[];
  entries: DccEntryRow[];
  reviews: ReviewRow[];
  today: string;
}

const cellKey = (itemId: string, date: string) => `${itemId}|${date}`;
const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-2.5 text-[15.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[color:var(--color-altus-red)]";

function dateToObj(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
function fmtLong(iso: string): string {
  return dateToObj(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function DccBoard({ ownerId, ownerName, meId, canFill, canReview, canManage, people, items, entries, reviews, today }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [showAll, setShowAll] = React.useState(false);
  const [, startTransition] = React.useTransition();

  // Live optimistic entry map: key=itemId|date → {status,value,note}
  const [map, setMap] = React.useState<Record<string, { status: string | null; value: string | null; note: string | null }>>(() => {
    const m: Record<string, { status: string | null; value: string | null; note: string | null }> = {};
    for (const e of entries) m[cellKey(e.itemId, e.entryDate)] = { status: e.status, value: e.valueNumber, note: e.note };
    return m;
  });
  const [busy, setBusy] = React.useState<string | null>(null);

  const selObj = dateToObj(selectedDate);

  // Items due on the selected date (plus any with an existing entry that day).
  const dueItems = React.useMemo(
    () =>
      items.filter((it) => {
        if (isDueOn(it.weekdays, selObj)) return true;
        return Boolean(map[cellKey(it.id, selectedDate)]);
      }),
    [items, selObj, map, selectedDate],
  );
  const shownItems = showAll ? items : dueItems;

  // Group by section, preserving order.
  const groups = React.useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, DccItemRow[]>();
    for (const it of shownItems) {
      const key = it.section || "—";
      if (!by.has(key)) { by.set(key, []); order.push(key); }
      by.get(key)!.push(it);
    }
    return order.map((k) => ({ section: k, rows: by.get(k)! }));
  }, [shownItems]);

  // Completion for selected day = Done / due.
  const dayStats = React.useMemo(() => {
    let done = 0, filled = 0;
    for (const it of dueItems) {
      const e = map[cellKey(it.id, selectedDate)];
      if (e && (e.status || e.value || e.note)) filled++;
      if (e && (e.status ?? "").toLowerCase() === "done") done++;
    }
    return { due: dueItems.length, done, filled };
  }, [dueItems, map, selectedDate]);
  const pct = dayStats.due ? Math.round((dayStats.done / dayStats.due) * 100) : 0;

  // Streak: consecutive days ending today where every due item is filled.
  const streak = React.useMemo(() => {
    let s = 0;
    const d = dateToObj(today);
    for (let i = 0; i < 60; i++) {
      const iso = isoDate(d);
      const due = items.filter((it) => isDueOn(it.weekdays, d));
      if (due.length > 0) {
        const allFilled = due.every((it) => {
          const e = map[cellKey(it.id, iso)];
          return e && (e.status || e.value || e.note);
        });
        if (!allFilled) break;
        s++;
      }
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [items, map, today]);

  // Last-21-day strip with per-day completion.
  const strip = React.useMemo(() => {
    const out: { iso: string; pct: number; due: number }[] = [];
    const d = dateToObj(today);
    d.setDate(d.getDate() - 20);
    for (let i = 0; i < 21; i++) {
      const iso = isoDate(d);
      const due = items.filter((it) => isDueOn(it.weekdays, d));
      let done = 0;
      for (const it of due) if ((map[cellKey(it.id, iso)]?.status ?? "").toLowerCase() === "done") done++;
      out.push({ iso, due: due.length, pct: due.length ? Math.round((done / due.length) * 100) : -1 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [items, map, today]);

  const review = reviews.find((r) => r.reviewDate === selectedDate);

  function shiftDay(delta: number) {
    const d = dateToObj(selectedDate);
    d.setDate(d.getDate() + delta);
    const iso = isoDate(d);
    if (iso > today) return;
    setSelectedDate(iso);
  }

  function commit(itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) {
    if (!canFill) return;
    const k = cellKey(itemId, selectedDate);
    const prev = map[k];
    const next = { status: patch.status !== undefined ? patch.status : prev?.status ?? null, value: patch.value !== undefined ? patch.value : prev?.value ?? null, note: patch.note !== undefined ? patch.note : prev?.note ?? null };
    setMap((m) => ({ ...m, [k]: next }));
    setBusy(k);
    startTransition(async () => {
      const res = await setDccEntry({ itemId, date: selectedDate, status: next.status, value: next.value, note: next.note });
      setBusy((b) => (b === k ? null : b));
      if (!res.ok) {
        setMap((m) => ({ ...m, [k]: prev ?? { status: null, value: null, note: null } }));
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <section className="flex flex-col gap-5">
      {/* Top bar: person switcher + date nav + completion */}
      <div className="flex flex-wrap items-stretch gap-4">
        {people.length > 0 && (
          <label className="flex items-center gap-2.5 rounded-2xl border border-hairline-strong bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <Avatar name={ownerName} size={34} />
            <select
              value={ownerId}
              onChange={(e) => router.push(`/dcc?emp=${e.target.value}` as Route)}
              className="bg-transparent text-[17px] font-bold text-ink-strong outline-none"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (me)` : p.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1 rounded-2xl border border-hairline-strong bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <button onClick={() => shiftDay(-1)} className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-[color:var(--color-surface-track,#eef2f7)]" aria-label="Previous day"><ChevronLeft size={20} /></button>
          <div className="min-w-[160px] px-2 text-center">
            <div className="text-[17px] font-extrabold text-ink-strong">{selectedDate === today ? "Today" : fmtLong(selectedDate)}</div>
            <div className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">{selectedDate === today ? fmtLong(selectedDate) : ""}</div>
          </div>
          <button onClick={() => shiftDay(1)} disabled={selectedDate >= today} className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-[color:var(--color-surface-track,#eef2f7)] disabled:opacity-30" aria-label="Next day"><ChevronRight size={20} /></button>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)} className="ml-1 rounded-lg px-3 py-2 text-[14px] font-bold text-altus-red hover:underline">Today</button>
          )}
        </div>

        <CompletionPill pct={pct} done={dayStats.done} due={dayStats.due} />

        <div className="flex items-center gap-2.5 rounded-2xl border border-hairline-strong bg-white px-5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <Flame size={20} style={{ color: streak > 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }} />
          <span className="text-[19px] font-extrabold text-ink-strong tabular-nums">{streak}</span>
          <span className="text-[14px] font-semibold text-ink-subtle">day streak</span>
        </div>
      </div>

      {/* 21-day strip */}
      <div className="flex items-end gap-1 overflow-x-auto rounded-2xl border border-hairline-strong bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {strip.map((s) => {
          const active = s.iso === selectedDate;
          const color = s.pct < 0 ? "var(--color-hairline-strong)" : s.pct >= 100 ? "var(--color-green)" : s.pct >= 50 ? "var(--color-amber,#f59e0b)" : "var(--color-altus-red)";
          const h = s.pct < 0 ? 8 : 8 + Math.round((s.pct / 100) * 26);
          return (
            <button key={s.iso} onClick={() => setSelectedDate(s.iso)} className="group flex flex-1 min-w-[20px] flex-col items-center gap-1" title={`${fmtLong(s.iso)} · ${s.pct < 0 ? "no items" : s.pct + "%"}`}>
              <div className="w-full rounded-md transition-all" style={{ height: h + 4, background: color, opacity: active ? 1 : 0.55, outline: active ? "2px solid var(--color-ink-strong)" : "none", outlineOffset: 2 }} />
              <span className={`text-[11px] font-bold ${active ? "text-ink-strong" : "text-ink-subtle"}`}>{dateToObj(s.iso).getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Review banner */}
      {(canReview || review) && (
        <ReviewBar ownerId={ownerId} date={selectedDate} canReview={canReview} review={review} />
      )}

      {/* Items */}
      {!canFill && ownerId !== meId && (
        <p className="rounded-xl border border-hairline-strong bg-[color:var(--color-surface-track,#eef2f7)] px-4 py-2.5 text-[13px] font-semibold text-ink-muted">Viewing {ownerName}'s KPIs — read-only.</p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[16px] font-bold text-ink-muted">{shownItems.length} {showAll ? "total" : "due"} {shownItems.length === 1 ? "KPI" : "KPIs"}</span>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setShowAll((v) => !v)} className="rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red">
            {showAll ? "Due today only" : `Show all (${items.length})`}
          </button>
          {canManage && <ItemEditor ownerId={ownerId} mode="add" />}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-hairline-strong bg-white px-6 py-14 text-center">
            <CheckCircle2 size={34} className="mx-auto text-ink-subtle" />
            <p className="mt-3 text-[18px] font-bold text-ink-strong">Nothing due {selectedDate === today ? "today" : "this day"}.</p>
            {canManage && <p className="mt-1 text-[15px] text-ink-muted">Add a KPI to get started.</p>}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.section}>
            <h3 className="mb-2.5 flex items-center gap-2.5 px-1 text-[14px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-altus-red)" }} />
              {g.section}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              {g.rows.map((it, i) => (
                <FillRow
                  key={it.id}
                  item={it}
                  entry={map[cellKey(it.id, selectedDate)]}
                  busy={busy === cellKey(it.id, selectedDate)}
                  canFill={canFill}
                  canManage={canManage}
                  first={i === 0}
                  onCommit={commit}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompletionPill({ pct, done, due }: { pct: number; done: number; due: number }) {
  const color = pct >= 100 ? "var(--color-green)" : pct >= 60 ? "var(--color-amber,#f59e0b)" : "var(--color-altus-red)";
  const R = 16, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-hairline-strong bg-white px-5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <svg width={48} height={48} viewBox="0 0 42 42" className="-rotate-90">
        <circle cx={21} cy={21} r={R} fill="none" stroke="var(--color-hairline-strong)" strokeWidth={5} />
        <circle cx={21} cy={21} r={R} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * Math.min(pct, 100)) / 100} style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div>
        <div className="text-[22px] font-extrabold leading-none text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui" }}>{pct}%</div>
        <div className="mt-1 text-[13px] font-semibold text-ink-subtle">{done}/{due} done</div>
      </div>
    </div>
  );
}

function FillRow({ item, entry, busy, canFill, canManage, first, onCommit }: {
  item: DccItemRow;
  entry?: { status: string | null; value: string | null; note: string | null };
  busy: boolean;
  canFill: boolean;
  canManage: boolean;
  first: boolean;
  onCommit: (itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) => void;
}) {
  const [noteOpen, setNoteOpen] = React.useState(Boolean(entry?.note));
  const hasNumber = item.targetNumber != null || item.unit != null;
  const status = entry?.status ?? null;

  return (
    <div className={`flex flex-col gap-3 px-5 py-4 max-md:px-3.5 ${first ? "" : "border-t border-hairline"}`} style={{ background: status?.toLowerCase() === "done" ? "color-mix(in srgb, var(--color-green) 5%, transparent)" : undefined }}>
      <div className="flex items-center gap-4 max-md:flex-col max-md:items-stretch">
        {/* Code + title */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {item.code && <span className="mt-0.5 shrink-0 rounded-lg bg-[color:var(--color-surface-track,#eef2f7)] px-2 py-1 text-[13.5px] font-extrabold text-ink-muted tabular-nums">{item.code}</span>}
          <div className="min-w-0">
            <p className="text-[17px] font-bold leading-snug text-ink-strong">{item.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13.5px] font-semibold text-ink-subtle">
              {item.frequency && <span>{item.frequency}</span>}
              {!item.frequency && item.weekdays != null && <span>{maskLabel(item.weekdays)}</span>}
              {item.targetNumber != null && <span className="text-altus-red">target {item.targetNumber}{item.unit ? ` ${item.unit}` : ""}</span>}
            </div>
          </div>
        </div>

        {/* Status segmented */}
        <div className="flex shrink-0 items-center gap-2 max-md:flex-wrap">
          <div className="flex overflow-hidden rounded-xl border border-hairline-strong">
            {DCC_STATUSES.map((s) => {
              const on = (status ?? "").toLowerCase() === s.toLowerCase();
              const tone = dccStatusTone(s);
              return (
                <button
                  key={s}
                  disabled={!canFill}
                  onClick={() => onCommit(item.id, { status: on ? null : s })}
                  className="px-3.5 py-2.5 text-[14.5px] font-bold transition-colors disabled:cursor-default"
                  style={on ? { background: tone.bg, color: tone.fg } : { color: "var(--color-ink-subtle)", background: "white" }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {hasNumber && (
            <input
              type="number"
              defaultValue={entry?.value ?? ""}
              disabled={!canFill}
              placeholder="#"
              onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.value ?? null)) onCommit(item.id, { value: v || null }); }}
              className="w-[68px] rounded-xl border border-hairline-strong bg-white px-2.5 py-2.5 text-center text-[15px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
            />
          )}
          <button onClick={() => setNoteOpen((v) => !v)} className="grid h-11 w-11 place-items-center rounded-xl border border-hairline-strong text-ink-subtle transition-colors hover:border-altus-red hover:text-altus-red" title="Add a note" aria-label="Add a note" style={entry?.note ? { color: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" } : undefined}>
            <StickyNote size={18} />
          </button>
          {busy && <Loader2 size={16} className="animate-spin text-ink-subtle" />}
          {canManage && <ItemEditor ownerId={item.ownerEmployeeId} mode="edit" item={item} compact />}
        </div>
      </div>

      {noteOpen && (
        <input
          autoFocus
          defaultValue={entry?.note ?? ""}
          disabled={!canFill}
          placeholder="Add a note…"
          onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.note ?? null)) onCommit(item.id, { note: v || null }); }}
          className={INPUT}
        />
      )}
    </div>
  );
}

function ReviewBar({ ownerId, date, canReview, review }: { ownerId: string; date: string; canReview: boolean; review?: ReviewRow }) {
  const [, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState(review?.status ?? null);
  const [note, setNote] = React.useState(review?.note ?? "");
  React.useEffect(() => { setStatus(review?.status ?? null); setNote(review?.note ?? ""); }, [review?.status, review?.note, date]);

  function save(next: string | null) {
    if (!canReview) return;
    setStatus(next);
    startTransition(async () => {
      const res = await setDccReview({ ownerEmployeeId: ownerId, date, status: next ?? "", note });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }
  const tone = status === "approved" ? "var(--color-green)" : status === "needs_rework" ? "var(--color-altus-red)" : "var(--color-ink-subtle)";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "color-mix(in srgb, " + tone + " 40%, var(--color-hairline-strong))", background: "color-mix(in srgb, " + tone + " 6%, white)" }}>
      <span className="text-[13.5px] font-extrabold uppercase tracking-wide" style={{ color: tone }}>Manager review</span>
      {canReview ? (
        <>
          <button onClick={() => save(status === "approved" ? null : "approved")} className="rounded-xl px-4 py-2.5 text-[14.5px] font-bold transition-colors" style={status === "approved" ? { background: "var(--color-green)", color: "white" } : { background: "white", color: "var(--color-green-deep)", border: "1px solid var(--color-hairline-strong)" }}>✓ Approved</button>
          <button onClick={() => save(status === "needs_rework" ? null : "needs_rework")} className="rounded-xl px-4 py-2.5 text-[14.5px] font-bold transition-colors" style={status === "needs_rework" ? { background: "var(--color-altus-red)", color: "white" } : { background: "white", color: "var(--color-altus-red-deep)", border: "1px solid var(--color-hairline-strong)" }}>Needs rework</button>
          <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => save(status)} placeholder="Review note…" className="flex-1 min-w-[180px] rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
        </>
      ) : (
        <span className="text-[14.5px] font-bold" style={{ color: tone }}>{status === "approved" ? "Approved" : status === "needs_rework" ? "Needs rework" : "Not yet reviewed"}{review?.note ? ` — ${review.note}` : ""}</span>
      )}
    </div>
  );
}

// ── Inline KPI item add/edit ──────────────────────────────────────────────────
function ItemEditor({ ownerId, mode, item, compact }: { ownerId: string; mode: "add" | "edit"; item?: DccItemRow; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const [form, setForm] = React.useState({
    section: item?.section ?? "", code: item?.code ?? "", title: item?.title ?? "",
    frequency: item?.frequency ?? "", targetNumber: item?.targetNumber ?? "", unit: item?.unit ?? "",
  });
  const router = useRouter();

  function submit() {
    if (!form.title.trim()) { fireToast({ message: "A title is required.", type: "error" }); return; }
    startTransition(async () => {
      const payload = { section: form.section || null, code: form.code || null, title: form.title, frequency: form.frequency || null, targetNumber: form.targetNumber || null, unit: form.unit || null };
      const res = mode === "add"
        ? await createDccItem({ ownerEmployeeId: ownerId, ...payload })
        : await updateDccItem({ id: item!.id, ...payload });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: mode === "add" ? "KPI added." : "KPI saved.", type: "success" });
      setOpen(false);
      router.refresh();
    });
  }
  function remove() {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteDccItem(item.id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "KPI removed.", type: "info" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {mode === "add" ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-altus-red px-4 py-2.5 text-[14.5px] font-bold text-white transition-opacity hover:opacity-90"><Plus size={17} /> Add KPI</button>
      ) : (
        <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red ${compact ? "h-11 px-3 text-[14px]" : "h-9 w-9 justify-center"}`} title="Edit KPI" aria-label="Edit KPI"><Pencil size={16} />{compact && <span className="max-md:hidden">Edit</span>}</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-extrabold text-ink-strong">{mode === "add" ? "New KPI" : "Edit KPI"}</h3>
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-[color:var(--color-surface-track,#eef2f7)]"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="KPI title *" className={INPUT} />
              <div className="grid grid-cols-2 gap-2.5">
                <input value={form.section} onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))} placeholder="Section" className={INPUT} />
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code (A1)" className={INPUT} />
              </div>
              <input value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} placeholder="Frequency (Daily, Wed & Sat, Every Sat…)" className={INPUT} />
              <div className="grid grid-cols-2 gap-2.5">
                <input value={form.targetNumber} onChange={(e) => setForm((f) => ({ ...f, targetNumber: e.target.value }))} placeholder="Target number" className={INPUT} />
                <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="Unit (count, calls…)" className={INPUT} />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              {mode === "edit" ? (
                <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_8%,transparent)]"><Trash2 size={14} /> Delete</button>
              ) : <span />}
              <button onClick={submit} className="inline-flex items-center gap-1.5 rounded-lg bg-altus-red px-4 py-2 text-[14px] font-bold text-white transition-opacity hover:opacity-90"><Check size={15} /> Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
