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
const MAX_GOALS = 10;

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

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
  const [targetDate, setTargetDate] = React.useState("");
  const [incentiveType, setIncentiveType] = React.useState<IncentiveType>("");
  const [incentiveAmount, setIncentiveAmount] = React.useState(0);
  const [incentiveCatalogId, setIncentiveCatalogId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const clientRef = React.useRef<HTMLInputElement>(null);

  // Default a new goal to the current EVEN share, so simply accepting the default
  // gives a clean equal split. The server re-balances every goal to total exactly
  // 100 right after the add, so this number is only the goal's RELATIVE weight —
  // bump it up to make a goal count for more than an even share.
  const evenShare = Math.min(TOTAL, props.currentCount > 0 ? Math.round(TOTAL / props.currentCount) : TOTAL);
  const [weight, setWeight] = React.useState<number>(evenShare);

  const canAdd = Boolean(props.employeeId) && props.employeeId !== "all";
  const atMax = props.currentCount >= MAX_GOALS;
  if (!canAdd) return null;

  const sharePct = Math.min(100, (weight / TOTAL) * 100);

  function reset() {
    setClient("");
    setSubject("");
    setTargetDone("");
    setTargetDate("");
    setIncentiveType("");
    setIncentiveAmount(0);
    setIncentiveCatalogId("");
    setError(null);
    setWeight(Math.min(TOTAL, props.currentCount > 0 ? Math.round(TOTAL / props.currentCount) : TOTAL));
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
    if (weight < 1 || weight > TOTAL) {
      setError(`Give the goal a weight between 1 and ${TOTAL}.`);
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
      targetDate: targetDate || null,
      weight,
      incentiveType: incentiveType || null,
      incentiveAmount: incentiveType === "routine" ? 0 : incentiveAmount,
      incentiveCatalogId: incentiveType === "routine" ? incentiveCatalogId || null : null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) return setError(res.error);
        // Weights are auto-balanced to 100 server-side; reset for the next add.
        reset();
        clientRef.current?.focus();
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save the goal. Try again.");
      });
  }

  if (atMax) {
    return (
      <div
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-[13.5px] font-bold"
        style={{ borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-subtle)", background: "var(--color-surface-soft)" }}
      >
        Weekly maximum reached · {MAX_GOALS}/{MAX_GOALS} goals
      </div>
    );
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
        className={`cursor-pointer group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed px-4 py-5 text-[15px] font-bold transition-colors hover:bg-surface-soft ${FOCUS_RING}`}
        style={{ borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }}
      >
        <span className="inline-flex size-7 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red)" }}>
          <Plus size={16} strokeWidth={2.8} />
        </span>
        Add goal
        {short > 0 ? (
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            · {short} more to reach {MIN_GOALS}
          </span>
        ) : (
          <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
            · {props.currentCount}/{MAX_GOALS}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: "var(--color-surface-card)",
        borderColor: "var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05), 0 14px 36px -26px rgba(15,23,42,0.28)",
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
      }}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--color-altus-red-deep)" }}>
          New goal · #{props.currentCount + 1}
        </span>
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          className={`rounded-full px-1.5 text-[13px] font-bold text-ink-muted hover:text-ink-strong transition-colors cursor-pointer ${FOCUS_RING}`}
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

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block min-w-0">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
          <input
            value={targetDone}
            onChange={(e) => setTargetDone(e.target.value)}
            placeholder="What does done look like?"
            className={`h-10 w-full rounded-md border bg-white px-2.5 text-[15px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            aria-label="Target date"
            className={`h-10 rounded-md border bg-white px-2.5 text-[14px] font-semibold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
        </label>
      </div>

      {/* ── Weight: the goal's relative importance; the week auto-balances to 100 ── */}
      <div className="mt-4 rounded-xl p-3.5" style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold text-ink-soft">Weight · importance</span>
          <span className="text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            auto-balances to total 100
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={TOTAL}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className={`h-1.5 flex-1 accent-[var(--color-altus-red)] cursor-pointer rounded-full ${FOCUS_RING}`}
            aria-label="Goal weight"
          />
          <div className="inline-flex items-center rounded-lg border bg-white px-2 py-1" style={{ borderColor: "var(--color-hairline-strong)" }}>
            <input
              type="number"
              min={1}
              max={TOTAL}
              value={weight}
              onChange={(e) => setWeight(Math.max(1, Math.min(TOTAL, Math.round(Number(e.target.value) || 0))))}
              className={`w-12 bg-transparent text-right text-[15px] font-black tabular-nums text-ink-strong ${FOCUS_RING}`}
              aria-label="Goal weight value"
            />
            <span className="text-[13px] font-bold text-ink-subtle">wt</span>
          </div>
        </div>
        {/* this goal's relative share of the week */}
        <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
          <span className="h-full transition-all" style={{ width: `${sharePct}%`, background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
        </div>
      </div>

      {/* ── Incentive: Ad-hoc / One-time (manual ₹) · Routine (from catalog) ── */}
      <div className="mt-4 rounded-xl p-3.5" style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
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
            className={`rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] font-bold text-ink-strong focus:border-altus-red cursor-pointer ${FOCUS_RING}`}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <option value="">No incentive</option>
            <option value="adhoc">Ad-hoc</option>
            <option value="onetime">Regular · One-time</option>
            <option value="routine">Regular · Routine</option>
          </select>

          {(incentiveType === "adhoc" || incentiveType === "onetime") && (
            <div className="inline-flex items-center rounded-md border bg-white px-2 py-1" style={{ borderColor: "var(--color-hairline-strong)" }}>
              <span className="text-[13px] font-bold text-ink-subtle">₹</span>
              <input
                type="number"
                min={0}
                value={incentiveAmount || ""}
                onChange={(e) => setIncentiveAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                placeholder="amount"
                aria-label="Incentive amount"
                className={`w-24 bg-transparent px-1 text-right text-[14px] font-black tabular-nums text-ink-strong ${FOCUS_RING}`}
              />
            </div>
          )}

          {incentiveType === "routine" && (
            <select
              value={incentiveCatalogId}
              onChange={(e) => setIncentiveCatalogId(e.target.value)}
              aria-label="Incentive from catalog"
              className={`rounded-md border bg-white px-2.5 py-1.5 text-[13.5px] font-medium text-ink-strong focus:border-altus-red cursor-pointer max-w-[260px] ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
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
          disabled={saving}
          className={`wg-sheen cursor-pointer ml-auto inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
          Add goal
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] font-semibold text-altus-red">{error}</p>}
      <p className="mt-2 text-[12px] font-semibold text-ink-muted">
        ⌘/Ctrl + Enter to save · weights auto-balance so your week always totals {TOTAL} · up to {MAX_GOALS} goals.
      </p>
    </div>
  );
}
