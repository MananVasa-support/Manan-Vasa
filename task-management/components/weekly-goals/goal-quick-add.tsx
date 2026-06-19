"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, IndianRupee } from "lucide-react";
import { createWeeklyGoal } from "@/app/(app)/weekly-goals/actions";
import { ComboInput } from "@/components/weekly-goals/field-controls";
import { formatInr } from "@/lib/format";

/** One incentive-catalog row, as surfaced to the goal-entry Routine picker. */
export interface IncentiveCatalogOption {
  id: string;
  name: string;
  amount: number;
}

type IncentiveType = "" | "adhoc" | "onetime" | "routine";

interface Props {
  /** The person the new goal is filed against. "" / "all" disables the form. */
  employeeId: string;
  weekStart: string;
  clientOptions: string[];
  subjectOptions: string[];
  /** This person's already-allocated weight this week (active goals). */
  currentWeight: number;
  /** This person's active goal count this week (for the min-5 nudge). */
  currentCount: number;
  /** Incentive catalog (for the Routine amount picker). */
  catalog: IncentiveCatalogOption[];
}

const TOTAL = 100;
const MIN_GOALS = 5;

/**
 * Inline "+ Add goal" for the Weekly Goals board, rebuilt for the locked Phase-1
 * rules (WMS_OVERHAUL_MASTER_PLAN §6): every goal carries a WEIGHT — its share of
 * the week — and the per-person total must stay within 100. Priority and KPI are
 * gone from goals by design (priority lives on Tasks; KPI is parked). Fields:
 * Client · Subject · Goal · Weight · Incentive.
 */
export function GoalQuickAdd(props: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [client, setClient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [targetDone, setTargetDone] = React.useState("");
  const [incentiveType, setIncentiveType] = React.useState<IncentiveType>("");
  const [incentiveAmount, setIncentiveAmount] = React.useState(0);
  const [incentiveCatalogId, setIncentiveCatalogId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const clientRef = React.useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, TOTAL - props.currentWeight);
  // Smart default: fill the gap to 100 (so 5 goals auto-balance to 20 each), or
  // a sane 10 once the week is already full.
  const [weight, setWeight] = React.useState<number>(remaining > 0 ? remaining : 10);

  const canAdd = Boolean(props.employeeId) && props.employeeId !== "all";
  if (!canAdd) return null;

  const projected = props.currentWeight + weight;
  const over = projected > TOTAL;
  const usedPct = Math.min(100, (props.currentWeight / TOTAL) * 100);
  const addPct = Math.min(100 - usedPct, (weight / TOTAL) * 100);

  function reset(nextRemaining: number) {
    setClient("");
    setSubject("");
    setTargetDone("");
    setIncentiveType("");
    setIncentiveAmount(0);
    setIncentiveCatalogId("");
    setError(null);
    setWeight(nextRemaining > 0 ? nextRemaining : 10);
  }

  // Routine amount is catalog-driven; Ad-hoc / One-time use the manual figure.
  const selectedCatalog = props.catalog.find((c) => c.id === incentiveCatalogId) ?? null;
  const effectiveIncentiveAmount =
    incentiveType === "routine" ? (selectedCatalog?.amount ?? 0) : incentiveAmount;

  function submit() {
    if (!client.trim() && !subject.trim() && !targetDone.trim()) {
      setError("Add a client, subject, or goal before saving.");
      return;
    }
    if (over) {
      setError(`Weight would total ${projected} — keep the week within ${TOTAL}.`);
      return;
    }
    if (weight < 1) {
      setError("Give the goal a weight of at least 1.");
      return;
    }
    setError(null);
    setSaving(true);
    createWeeklyGoal({
      employeeId: props.employeeId,
      weekStart: props.weekStart,
      client: client.trim() || null,
      subject: subject.trim() || null,
      targetDone: targetDone.trim() || null,
      weight,
      incentiveType: incentiveType || null,
      incentiveAmount: incentiveType === "routine" ? 0 : incentiveAmount,
      incentiveCatalogId: incentiveType === "routine" ? incentiveCatalogId || null : null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) return setError(res.error);
        // Re-balance the next default against the new total; refresh in bg.
        reset(Math.max(0, remaining - weight));
        clientRef.current?.focus();
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save the goal. Try again.");
      });
  }

  if (!open) {
    const short = Math.max(0, MIN_GOALS - props.currentCount);
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => clientRef.current?.focus());
        }}
        className="wg-btn cursor-pointer group flex w-full items-center justify-center gap-2.5 rounded-section border border-dashed px-4 py-5 text-[15px] font-bold transition-colors"
        style={{ borderColor: "rgba(27,20,14,0.22)", color: "#6F6457" }}
      >
        <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "rgba(225,6,0,0.10)", color: "#E10600" }}>
          <Plus size={16} strokeWidth={2.8} />
        </span>
        Add goal
        {short > 0 && (
          <span className="text-[12.5px] font-semibold" style={{ color: "#9A938B" }}>
            · {short} more to reach {MIN_GOALS}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="rounded-section border bg-white p-5"
      style={{ borderColor: "rgba(27,20,14,0.12)", boxShadow: "0 1px 3px rgba(27,20,14,0.05), 0 14px 36px -22px rgba(27,20,14,0.3)" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
      }}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "#A80400" }}>
          New goal · #{props.currentCount + 1}
        </span>
        <button
          type="button"
          onClick={() => { setOpen(false); reset(remaining); }}
          className="text-[13px] font-bold text-ink-muted hover:text-ink-strong transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Client</span>
          <ComboInput value={client} options={props.clientOptions} onChange={setClient} inputRef={clientRef} placeholder="Client" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Subject</span>
          <ComboInput value={subject} options={props.subjectOptions} onChange={setSubject} placeholder="Subject" />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
        <input
          value={targetDone}
          onChange={(e) => setTargetDone(e.target.value)}
          placeholder="What does done look like?"
          className="w-full rounded-md border bg-white px-2.5 py-2 text-[15px] font-medium text-ink-strong outline-none focus:border-altus-red"
          style={{ borderColor: "rgba(27,20,14,0.14)" }}
        />
      </label>

      {/* ── Weight: the goal's share of the week, with a live allocation meter ── */}
      <div className="mt-4 rounded-xl p-3.5" style={{ background: "rgba(27,20,14,0.025)", border: "1px solid rgba(27,20,14,0.08)" }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold text-ink-soft">Weight · share of the week</span>
          <span className="text-[12.5px] font-bold tabular-nums" style={{ color: over ? "#A80400" : "#6F6457" }}>
            {over ? `over by ${projected - TOTAL}` : `${remaining - weight >= 0 ? remaining - weight : 0} left of ${TOTAL}`}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={Math.max(weight, remaining, 1)}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="flex-1 accent-[var(--color-altus-red)] cursor-pointer"
            aria-label="Goal weight"
          />
          <div className="inline-flex items-center rounded-lg border bg-white px-2 py-1" style={{ borderColor: "rgba(27,20,14,0.14)" }}>
            <input
              type="number"
              min={1}
              max={1000}
              value={weight}
              onChange={(e) => setWeight(Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))))}
              className="w-12 bg-transparent text-right text-[15px] font-black tabular-nums text-ink-strong outline-none"
              aria-label="Goal weight value"
            />
            <span className="text-[13px] font-bold text-ink-subtle">wt</span>
          </div>
        </div>
        {/* allocation bar: already-used (ink) + this goal (red) toward 100 */}
        <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(27,20,14,0.08)" }}>
          <span className="h-full" style={{ width: `${usedPct}%`, background: "rgba(27,20,14,0.32)" }} />
          <span className="h-full transition-all" style={{ width: `${Math.max(0, addPct)}%`, background: over ? "#A80400" : "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
        </div>
      </div>

      {/* ── Incentive: Ad-hoc / One-time (manual ₹) · Routine (from catalog) ── */}
      <div className="mt-4 rounded-xl p-3.5" style={{ background: "rgba(27,20,14,0.025)", border: "1px solid rgba(27,20,14,0.08)" }}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-soft">
            <IndianRupee size={13} /> Incentive
          </span>
          <select
            value={incentiveType}
            onChange={(e) => {
              const v = e.target.value as IncentiveType;
              setIncentiveType(v);
              if (v !== "routine") setIncentiveCatalogId("");
              if (v === "") setIncentiveAmount(0);
            }}
            aria-label="Incentive type"
            className="rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] font-bold text-ink-strong outline-none focus:border-altus-red cursor-pointer"
            style={{ borderColor: "rgba(27,20,14,0.14)" }}
          >
            <option value="">No incentive</option>
            <option value="adhoc">Ad-hoc</option>
            <option value="onetime">Regular · One-time</option>
            <option value="routine">Regular · Routine</option>
          </select>

          {(incentiveType === "adhoc" || incentiveType === "onetime") && (
            <div className="inline-flex items-center rounded-md border bg-white px-2 py-1" style={{ borderColor: "rgba(27,20,14,0.14)" }}>
              <span className="text-[13px] font-bold text-ink-subtle">₹</span>
              <input
                type="number"
                min={0}
                value={incentiveAmount || ""}
                onChange={(e) => setIncentiveAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                placeholder="amount"
                aria-label="Incentive amount"
                className="w-24 bg-transparent px-1 text-right text-[14px] font-black tabular-nums text-ink-strong outline-none"
              />
            </div>
          )}

          {incentiveType === "routine" && (
            <select
              value={incentiveCatalogId}
              onChange={(e) => setIncentiveCatalogId(e.target.value)}
              aria-label="Incentive from catalog"
              className="rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] font-medium text-ink-strong outline-none focus:border-altus-red cursor-pointer max-w-[260px]"
              style={{ borderColor: "rgba(27,20,14,0.14)" }}
            >
              <option value="">Pick from catalog…</option>
              {props.catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {formatInr(c.amount)}
                </option>
              ))}
            </select>
          )}

          {incentiveType !== "" && (
            <span className="ml-auto text-[13px] font-black tabular-nums text-altus-red">
              {effectiveIncentiveAmount > 0 ? formatInr(effectiveIncentiveAmount) : "—"}
            </span>
          )}
        </div>
        {incentiveType === "routine" && props.catalog.length === 0 && (
          <p className="mt-2 text-[12px] font-semibold text-ink-muted">No catalog entries yet — add them on the Incentive page.</p>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || over}
          className="wg-btn wg-sheen cursor-pointer ml-auto inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
          Add goal
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] font-semibold text-altus-red">{error}</p>}
      <p className="mt-2 text-[12px] font-semibold text-ink-muted">
        ⌘/Ctrl + Enter to save · weights across the week should total {TOTAL}.
      </p>
    </div>
  );
}
