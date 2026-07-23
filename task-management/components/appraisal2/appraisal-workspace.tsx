"use client";

/**
 * Appraisal v2 — SCORECARD WORKBENCH (the star of the module).
 *
 * One live rolling scorecard per employee. A department filter feeds an
 * employee picker; the selected person gets an OVERALL SCORE RING + rating band
 * + status, then SIX dimension cards in one row. Clicking a dimension card
 * EXPANDS its scoring section below — previously-opened sections STAY visible
 * (cumulative, never replace). Every scored item is a compact RECORD CARD whose
 * fields are a wrapping labelled grid, so the page NEVER scrolls horizontally
 * no matter how many KPIs / skills exist.
 *
 * Self + Manager are advisory (shown side-by-side); MANAGEMENT is the FINAL
 * score that counts. Tier inputs are enabled only for the viewer's own tier
 * (self / manager / management), resolved server-side into data.viewer.
 *
 * Brand tokens only (Altus red + display font + .wg-* motion); keyboard-first;
 * calls the Phase-2/3 server actions exactly.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Award,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import {
  APPR_DIMENSIONS,
  DIMENSION_LABELS,
  ratingBand,
  type ApprDimension,
  type ItemKind,
  type ItemScore,
  type ScoreTier,
} from "@/lib/appraisal2/types";
import type { ScorecardData } from "@/lib/appraisal2/data";
import {
  setItemScore,
  setIncentiveScore,
  setCultureScore,
  finalizeScorecard,
} from "@/app/(app)/appraisal/score-actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";
const INPUT =
  "w-full rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] disabled:opacity-60 disabled:cursor-not-allowed";

export interface WorkspacePerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
}

interface Caps {
  self: boolean;
  manager: boolean;
  management: boolean;
}

type ActionResult = { ok: true } | { ok: false; error: string };

// ─── shared bits ──────────────────────────────────────────────────────────────

/** Run a server action inside a transition; toast + refresh on success. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const run = React.useCallback(
    async (fn: () => Promise<ActionResult>, successMsg: string): Promise<boolean> => {
      setBusy(true);
      setOk(false);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      setOk(true);
      window.setTimeout(() => setOk(false), 1500);
      fireToast({ message: successMsg, type: "success" });
      router.refresh();
      return true;
    },
    [router],
  );
  return { busy, ok, run };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-subtle">
      {children}
    </span>
  );
}

/** A read-only labelled cell for the wrapping record grid. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label>{label}</Label>
      <span className="truncate text-[13.5px] font-semibold text-ink-strong">{children}</span>
    </div>
  );
}

function SaveButton({ busy, ok, disabled }: { busy: boolean; ok: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
      style={{
        background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
        boxShadow: `0 8px 20px -12px ${RED_DEEP}`,
      }}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : ok ? (
        <Check size={14} strokeWidth={2.6} />
      ) : (
        <Save size={14} strokeWidth={2.4} />
      )}
      {busy ? "Saving…" : ok ? "Saved" : "Save"}
    </button>
  );
}

function isScore(v: string): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

/** Deterministic ₹ formatter (Indian grouping, no locale → no hydration drift). */
function inr(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const neg = n < 0;
  const digits = String(Math.round(Math.abs(n)));
  let out: string;
  if (digits.length <= 3) {
    out = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = `${rest},${last3}`;
  }
  return `₹${neg ? "-" : ""}${out}`;
}

// ─── overall score ring ─────────────────────────────────────────────────────────

function ScoreRing({ value, color, size = 128 }: { value: number; color: string; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="wg-ring-glow" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {clamped.toFixed(1)}
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">/ 100</span>
      </div>
    </div>
  );
}

// ─── tier score trio ────────────────────────────────────────────────────────────

interface TierState {
  score: string;
  note: string;
}

function TierColumn({
  label,
  tier,
  editTier,
  savedScore,
  savedNote,
  state,
  onChange,
  noteLabel,
  isFinal,
}: {
  label: string;
  tier: ScoreTier;
  editTier: ScoreTier | null;
  savedScore: number | null;
  savedNote: string | null;
  state: TierState;
  onChange: (next: TierState) => void;
  noteLabel: string;
  isFinal?: boolean;
}) {
  const editable = tier === editTier;
  const accent = isFinal ? RED : "var(--color-hairline)";
  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 rounded-xl p-2.5"
      style={{
        background: isFinal ? `color-mix(in srgb, ${RED} 6%, transparent)` : "var(--color-surface-soft)",
        boxShadow: `inset 0 0 0 ${isFinal ? "1.5px" : "1px"} ${accent}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <Label>{label}</Label>
        {isFinal ? (
          <span className="inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white" style={{ background: RED }}>
            <ShieldCheck size={10} strokeWidth={2.6} /> Final
          </span>
        ) : (
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-subtle">Advisory</span>
        )}
      </div>
      {editable ? (
        <>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            className={INPUT}
            value={state.score}
            placeholder="0–100"
            onChange={(e) => onChange({ ...state, score: e.target.value })}
          />
          <textarea
            rows={2}
            className={`${INPUT} resize-none !py-1.5 text-[12.5px]`}
            value={state.note}
            placeholder={noteLabel}
            onChange={(e) => onChange({ ...state, note: e.target.value })}
          />
        </>
      ) : (
        <>
          <div
            className="tabular-nums flex h-[38px] items-center rounded-xl bg-surface-card px-3 text-[16px] font-black text-ink-strong"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            {savedScore ?? "—"}
            {savedScore != null && <span className="ml-0.5 text-[11px] font-bold text-ink-subtle">%</span>}
          </div>
          {savedNote ? (
            <p className="line-clamp-2 text-[12px] font-medium text-ink-muted">{savedNote}</p>
          ) : (
            <p className="text-[12px] font-medium text-ink-subtle/70">No note</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── generic item record card ───────────────────────────────────────────────────

function ItemScoreCard({
  employeeId,
  itemKind,
  itemId,
  score,
  caps,
  header,
  meta,
  measure,
  show,
  noteLabels,
}: {
  employeeId: string;
  itemKind: ItemKind;
  itemId: string;
  score: ItemScore | undefined;
  caps: Caps;
  header: React.ReactNode;
  meta: React.ReactNode;
  measure?: string | null;
  show: { actual?: boolean; evidence?: boolean; approved?: boolean; remarks?: boolean };
  noteLabels: { self: string; manager: string; management: string };
}) {
  const { busy, ok, run } = useAction();
  const editTier: ScoreTier | null = caps.management
    ? "management"
    : caps.manager
      ? "manager"
      : caps.self
        ? "self"
        : null;
  const canVerify = editTier === "manager" || editTier === "management";

  const [self, setSelf] = React.useState<TierState>({
    score: score?.selfScore != null ? String(score.selfScore) : "",
    note: score?.selfNote ?? "",
  });
  const [manager, setManager] = React.useState<TierState>({
    score: score?.managerScore != null ? String(score.managerScore) : "",
    note: score?.managerNote ?? "",
  });
  const [management, setManagement] = React.useState<TierState>({
    score: score?.managementScore != null ? String(score.managementScore) : "",
    note: score?.managementNote ?? "",
  });
  const [actual, setActual] = React.useState(score?.actual ?? "");
  const [evidence, setEvidence] = React.useState(score?.evidenceUrl ?? "");
  const [approved, setApproved] = React.useState<boolean | null>(score?.approved ?? null);
  const [remarks, setRemarks] = React.useState(score?.remarks ?? "");

  const activeState = editTier === "self" ? self : editTier === "manager" ? manager : management;
  const canSave = editTier != null && isScore(activeState.score);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editTier == null) return;
    if (!isScore(activeState.score)) {
      fireToast({ message: "Enter a score between 0 and 100.", type: "error" });
      return;
    }
    void run(
      () =>
        setItemScore({
          employeeId,
          itemKind,
          itemId,
          tier: editTier,
          score: Number(activeState.score),
          note: activeState.note || undefined,
          ...(canVerify
            ? {
                actual: show.actual ? actual || undefined : undefined,
                evidenceUrl: show.evidence ? evidence || undefined : undefined,
                approved: show.approved && approved != null ? approved : undefined,
                remarks: show.remarks ? remarks || undefined : undefined,
              }
            : {}),
        }),
      "Score saved",
    );
  }

  return (
    <form
      onSubmit={submit}
      className="wg-rise rounded-2xl bg-surface-card p-4"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{header}</div>
        {editTier ? (
          <span className="rounded-pill bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            You score: {editTier}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            <Lock size={11} /> Read-only
          </span>
        )}
      </div>

      {/* wrapping labelled grid — reflows into rows, never scrolls right */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {meta}
        {show.approved &&
          (canVerify ? (
            <div className="flex min-w-0 flex-col gap-1">
              <Label>Approved</Label>
              <div className="flex gap-1.5">
                {([["Yes", true], ["No", false]] as const).map(([lbl, val]) => {
                  const on = approved === val;
                  return (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setApproved(on ? null : val)}
                      className="flex-1 rounded-xl py-1.5 text-[12.5px] font-bold"
                      style={{
                        background: on ? (val ? "color-mix(in srgb, #16a34a 15%, transparent)" : `color-mix(in srgb, ${RED} 12%, transparent)`) : "var(--color-surface-soft)",
                        color: on ? (val ? "#15803d" : RED) : "var(--color-ink-muted)",
                        boxShadow: on ? `inset 0 0 0 1.5px ${val ? "#16a34a" : RED}` : "inset 0 0 0 1px var(--color-hairline)",
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Field label="Approved">
              {score?.approved == null ? "—" : score.approved ? "Yes" : "No"}
            </Field>
          ))}
        {show.actual &&
          (canVerify ? (
            <label className="flex min-w-0 flex-col gap-1">
              <Label>Actual</Label>
              <input className={INPUT} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual result" />
            </label>
          ) : (
            <Field label="Actual">{score?.actual || "—"}</Field>
          ))}
        {show.evidence &&
          (canVerify ? (
            <label className="flex min-w-0 flex-col gap-1">
              <Label>Evidence URL</Label>
              <input className={INPUT} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" />
            </label>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <Label>Evidence</Label>
              {score?.evidenceUrl ? (
                <a href={score.evidenceUrl} target="_blank" rel="noreferrer" className="truncate text-[13px] font-semibold text-[color:var(--color-altus-red)] underline">
                  View
                </a>
              ) : (
                <span className="text-[13.5px] font-semibold text-ink-strong">—</span>
              )}
            </div>
          ))}
      </div>

      {measure && (
        <p className="mt-3 rounded-xl bg-surface-soft px-3 py-2 text-[13px] font-medium text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <span className="font-bold text-ink-subtle">Measure · </span>
          {measure}
        </p>
      )}

      {/* Self / Manager / Management (final) */}
      <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <TierColumn
          label="Self"
          tier="self"
          editTier={editTier}
          savedScore={score?.selfScore ?? null}
          savedNote={score?.selfNote ?? null}
          state={self}
          onChange={setSelf}
          noteLabel={noteLabels.self}
        />
        <TierColumn
          label="Manager"
          tier="manager"
          editTier={editTier}
          savedScore={score?.managerScore ?? null}
          savedNote={score?.managerNote ?? null}
          state={manager}
          onChange={setManager}
          noteLabel={noteLabels.manager}
        />
        <TierColumn
          label="Management"
          tier="management"
          editTier={editTier}
          savedScore={score?.managementScore ?? null}
          savedNote={score?.managementNote ?? null}
          state={management}
          onChange={setManagement}
          noteLabel={noteLabels.management}
          isFinal
        />
      </div>

      {show.remarks && (
        <div className="mt-2.5">
          {canVerify ? (
            <label className="flex flex-col gap-1">
              <Label>Remarks</Label>
              <textarea rows={2} className={`${INPUT} resize-none`} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Overall remarks" />
            </label>
          ) : score?.remarks ? (
            <Field label="Remarks">{score.remarks}</Field>
          ) : null}
        </div>
      )}

      {editTier && (
        <div className="mt-3 flex justify-end">
          <SaveButton busy={busy} ok={ok} disabled={!canSave} />
        </div>
      )}
    </form>
  );
}

// ─── dimension section wrapper ──────────────────────────────────────────────────

function SectionShell({
  dimension,
  pct,
  weight,
  contribution,
  onClose,
  children,
}: {
  dimension: ApprDimension;
  pct: number;
  weight: number;
  contribution: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const band = ratingBand(pct);
  return (
    <section className="wg-rise rounded-[22px] p-5 max-md:p-4" style={{ background: "var(--color-surface-card)", boxShadow: CARD_SHADOW }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-1.5 rounded-full" style={{ background: band.color }} />
          <div>
            <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em" }}>
              {DIMENSION_LABELS[dimension]}
            </h3>
            <p className="text-[12.5px] font-semibold text-ink-subtle">
              Weight {weight} · Effective {contribution.toFixed(1)} pts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums rounded-pill px-3 py-1.5 text-[14px] font-black" style={{ background: `color-mix(in srgb, ${band.color} 14%, transparent)`, color: band.color }}>
            {pct.toFixed(1)}%
          </span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle hover:text-[color:var(--color-altus-red)]" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }} aria-label="Collapse section">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

// ─── incentive section ──────────────────────────────────────────────────────────

function IncentiveSection({ data }: { data: ScorecardData }) {
  const { busy, ok, run } = useAction();
  const canManage = data.viewer.canManagementScore;
  const [score, setScore] = React.useState(data.card?.incentiveScore != null ? String(data.card.incentiveScore) : "");
  const [note, setNote] = React.useState(data.card?.incentiveNote ?? "");
  const ref = data.reference;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        <RefTile label="Monthly CTC" value={inr(ref.salary?.monthlyCtc ?? null)} />
        <RefTile label="Annual CTC" value={inr(ref.salary?.annualCtc ?? null)} />
        <RefTile label="Last payout" value={inr(ref.salary?.finalPayment ?? null)} sub={ref.salary?.month ?? undefined} />
        <RefTile label="Incentive target" value={inr(ref.incentive.target)} />
        <RefTile label="Earned (YTD)" value={inr(ref.incentive.earned)} />
        <RefTile label="Paid (YTD)" value={inr(ref.incentive.paid)} />
      </div>
      <p className="text-[12.5px] font-medium text-ink-subtle">
        Salary, target and incentive figures are reference-only (auto-pulled). Management enters the final Incentive score directly.
      </p>
      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface-soft p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!isScore(score)) {
            fireToast({ message: "Enter a score between 0 and 100.", type: "error" });
            return;
          }
          void run(() => setIncentiveScore({ employeeId: data.employee.id, score: Number(score), note: note || undefined }), "Incentive score saved");
        }}
      >
        <label className="flex min-w-[130px] flex-col gap-1">
          <Label>Incentive score %</Label>
          <input type="number" min={0} max={100} className={INPUT} value={score} disabled={!canManage} onChange={(e) => setScore(e.target.value)} placeholder="0–100" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <Label>Note</Label>
          <input className={INPUT} value={note} disabled={!canManage} onChange={(e) => setNote(e.target.value)} placeholder="Reasoning (optional)" />
        </label>
        <EffectiveTile pct={Number(isScore(score) ? score : data.card?.incentiveScore ?? 0)} weight={weightOf(data, "incentive")} />
        {canManage && <SaveButton busy={busy} ok={ok} disabled={!isScore(score)} />}
      </form>
      {!canManage && <LockNote>Only Management can set the Incentive score.</LockNote>}
    </div>
  );
}

function RefTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface-soft p-3" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <Label>{label}</Label>
      <div className="tabular-nums mt-1 text-[18px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] font-semibold text-ink-subtle">{sub}</div>}
    </div>
  );
}

function EffectiveTile({ pct, weight }: { pct: number; weight: number }) {
  const eff = Math.round((pct * weight) / 100 * 10) / 10;
  return (
    <div className="rounded-2xl px-4 py-2 text-center" style={{ background: `color-mix(in srgb, ${RED} 9%, transparent)`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${RED} 40%, transparent)` }}>
      <Label>Effective</Label>
      <div className="tabular-nums text-[18px] font-black" style={{ color: RED, fontFamily: "var(--font-display), system-ui, sans-serif" }}>
        {eff.toFixed(1)}
      </div>
      <div className="text-[10px] font-bold text-ink-subtle">of {weight}</div>
    </div>
  );
}

function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-subtle">
      <Lock size={12} /> {children}
    </p>
  );
}

function weightOf(data: ScorecardData, dim: ApprDimension): number {
  return data.scorecard.perDimension.find((d) => d.dimension === dim)?.weight ?? 0;
}

// ─── culture section ────────────────────────────────────────────────────────────

function CultureSection({ data }: { data: ScorecardData }) {
  const { busy, ok, run } = useAction();
  const canManage = data.viewer.canManagementScore;
  const [score, setScore] = React.useState(data.card?.cultureScore != null ? String(data.card.cultureScore) : "");

  return (
    <div className="flex flex-col gap-4">
      {data.constitution.length === 0 ? (
        <p className="rounded-2xl bg-surface-soft p-4 text-[13.5px] font-medium text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          No constitution paragraphs published yet — Management scores culture holistically.
        </p>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {data.constitution.map((c) => (
            <div key={c.id} className="rounded-2xl bg-surface-soft p-3.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                  {c.position}
                </span>
                {c.title && <span className="truncate text-[13.5px] font-bold text-ink-strong">{c.title}</span>}
              </div>
              <p className="text-[12.5px] font-medium leading-relaxed text-ink-muted">{c.body}</p>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface-soft p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!isScore(score)) {
            fireToast({ message: "Enter a score between 0 and 100.", type: "error" });
            return;
          }
          void run(() => setCultureScore({ employeeId: data.employee.id, score: Number(score) }), "Culture score saved");
        }}
      >
        <label className="flex min-w-[150px] flex-col gap-1">
          <Label>Culture score %</Label>
          <input type="number" min={0} max={100} className={INPUT} value={score} disabled={!canManage} onChange={(e) => setScore(e.target.value)} placeholder="0–100" />
        </label>
        <EffectiveTile pct={Number(isScore(score) ? score : data.card?.cultureScore ?? 0)} weight={weightOf(data, "culture")} />
        {canManage && <SaveButton busy={busy} ok={ok} disabled={!isScore(score)} />}
      </form>
      {!canManage && <LockNote>Only Management can set the Culture score.</LockNote>}
    </div>
  );
}

// ─── knowledge section ──────────────────────────────────────────────────────────

function KnowledgeSection({ data }: { data: ScorecardData }) {
  const k = data.reference.knowledge;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        <RefTile label="Sessions attended" value={`${k.done}`} sub={`Target ${k.doTarget}`} />
        <RefTile label="Sessions delivered" value={`${k.given}`} sub={`Target ${k.giveTarget}`} />
        <RefTile label="Source" value={k.wired ? "Training Centre" : "No records yet"} />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-soft p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <div className="inline-flex items-center gap-2">
          <Sparkles size={16} style={{ color: RED }} />
          <span className="text-[13px] font-bold text-ink-strong">Auto-computed from the Training module</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <Label>Knowledge %</Label>
            <div className="tabular-nums text-[22px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              {k.pct.toFixed(1)}
            </div>
          </div>
          <EffectiveTile pct={k.pct} weight={weightOf(data, "knowledge")} />
        </div>
      </div>
      <p className="text-[12.5px] font-medium text-ink-subtle">
        Knowledge Sharing scores itself — attend / deliver the do-N and give-N sessions configured in Admin and this fills automatically.
      </p>
    </div>
  );
}

// ─── the six dimension cards + accordion sections ───────────────────────────────

function DimensionCard({
  dimension,
  pct,
  weight,
  contribution,
  open,
  onToggle,
}: {
  dimension: ApprDimension;
  pct: number;
  weight: number;
  contribution: number;
  open: boolean;
  onToggle: () => void;
}) {
  const band = ratingBand(pct);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="wg-sheen wg-rise group flex flex-col gap-2 rounded-2xl p-3.5 text-left transition"
      style={{
        background: "var(--color-surface-card)",
        boxShadow: open ? `inset 0 0 0 1.5px ${RED}, 0 10px 28px -20px rgba(15,23,42,0.35)` : CARD_SHADOW,
      }}
      aria-expanded={open}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[12.5px] font-bold leading-tight text-ink-strong">{DIMENSION_LABELS[dimension]}</span>
        <ChevronDown size={15} className="shrink-0 text-ink-subtle transition" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </div>
      <div className="tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", color: band.color, lineHeight: 1 }}>
        {pct.toFixed(0)}
        <span className="text-[12px] font-bold text-ink-subtle">%</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: band.color, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
        <span>Wt {weight}</span>
        <span className="tabular-nums">{contribution.toFixed(1)} pts</span>
      </div>
    </button>
  );
}

function DimensionSectionBody({ data, dimension }: { data: ScorecardData; dimension: ApprDimension }) {
  const caps: Caps = {
    self: data.viewer.canSelfScore,
    manager: data.viewer.canManagerScore,
    management: data.viewer.canManagementScore,
  };
  const byItem = new Map<string, ItemScore>();
  for (const s of data.scores) byItem.set(s.itemId, s);

  if (dimension === "incentive") return <IncentiveSection data={data} />;
  if (dimension === "culture") return <CultureSection data={data} />;
  if (dimension === "knowledge") return <KnowledgeSection data={data} />;

  if (dimension === "kpi") {
    if (data.kpis.length === 0) return <EmptyItems label="No KPIs configured yet — add them in Admin." />;
    return (
      <div className="flex flex-col gap-3">
        {data.kpis.map((k) => (
          <ItemScoreCard
            key={k.id}
            employeeId={data.employee.id}
            itemKind="kpi"
            itemId={k.id}
            score={byItem.get(k.id)}
            caps={caps}
            measure={k.measure}
            header={
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                  {k.srNo ?? "—"}
                </span>
                <span className="text-[15px] font-black text-ink-strong">{k.area || "Untitled KPI"}</span>
              </div>
            }
            meta={<Field label="Sub-weight">{k.subWeight}</Field>}
            show={{ actual: true, evidence: true, approved: true, remarks: true }}
            noteLabels={{ self: "Self justification", manager: "Manager note", management: "Final note" }}
          />
        ))}
      </div>
    );
  }

  if (dimension === "skill") {
    if (data.skills.length === 0) return <EmptyItems label="No skills configured yet — add up to 3 in Admin." />;
    return (
      <div className="flex flex-col gap-3">
        {data.skills.map((s) => (
          <ItemScoreCard
            key={s.id}
            employeeId={data.employee.id}
            itemKind="skill"
            itemId={s.id}
            score={byItem.get(s.id)}
            caps={caps}
            header={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-black text-ink-strong">{s.name || "Untitled skill"}</span>
                <span className="rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.technical ? `color-mix(in srgb, ${RED} 12%, transparent)` : "var(--color-surface-soft)", color: s.technical ? RED : "var(--color-ink-muted)" }}>
                  {s.technical ? "Technical" : "Behavioural"}
                </span>
              </div>
            }
            meta={<Field label="Sub-weight">{s.subWeight}</Field>}
            show={{ evidence: true, remarks: true }}
            noteLabels={{ self: "Self justification", manager: "Manager explanation", management: "Final explanation" }}
          />
        ))}
      </div>
    );
  }

  // attitude
  if (data.attitude.length === 0) return <EmptyItems label="Attitude items are seeding — refresh in a moment." />;
  return (
    <div className="flex flex-col gap-3">
      {data.attitude.map((a) => (
        <ItemScoreCard
          key={a.id}
          employeeId={data.employee.id}
          itemKind="attitude"
          itemId={a.id}
          score={byItem.get(a.id)}
          caps={caps}
          header={<span className="text-[15px] font-black text-ink-strong">{a.label || a.key}</span>}
          meta={<Field label="Weight">{a.weight}</Field>}
          show={{ remarks: true }}
          noteLabels={{ self: "Self reflection", manager: "Manager note", management: "Final note" }}
        />
      ))}
    </div>
  );
}

function EmptyItems({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-surface-soft p-6 text-center text-[13.5px] font-medium text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      {label}
    </div>
  );
}

// ─── scorecard (selected employee) ──────────────────────────────────────────────

function Scorecard({ data, isAdmin }: { data: ScorecardData; isAdmin: boolean }) {
  const [open, setOpen] = React.useState<Set<ApprDimension>>(() => new Set<ApprDimension>(["kpi"]));
  const finalize = useAction();
  const sc = data.scorecard;
  const finalized = sc.status === "finalized";
  const canFinalize = data.viewer.canManagementScore;

  const toggle = React.useCallback((d: ApprDimension) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }, []);

  const perDim = new Map(sc.perDimension.map((p) => [p.dimension, p]));
  const openList = APPR_DIMENSIONS.filter((d) => open.has(d));

  return (
    <div className="flex flex-col gap-5" key={data.employee.id}>
      {/* header */}
      <div className="wg-rise relative overflow-hidden rounded-[26px] p-6 max-md:p-4" style={{ background: "var(--color-surface-card)", boxShadow: CARD_SHADOW }}>
        <div className="flex flex-wrap items-center gap-6 max-md:gap-4">
          <ScoreRing value={sc.total} color={sc.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Avatar name={data.employee.name} avatarUrl={data.employee.avatarUrl} size={44} />
              <div className="min-w-0">
                <h2 className="truncate text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px,2.4vw,30px)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                  {data.employee.name}
                </h2>
                <p className="truncate text-[13.5px] font-semibold text-ink-subtle">
                  {[data.employee.designation, data.employee.department].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-pill px-3 py-1.5 text-[12.5px] font-black text-white" style={{ background: sc.color }}>
                {sc.ratingLabel} · {sc.total.toFixed(1)}/100
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold"
                style={{
                  background: finalized ? "color-mix(in srgb, #16a34a 14%, transparent)" : "var(--color-surface-soft)",
                  color: finalized ? "#15803d" : "var(--color-ink-muted)",
                  boxShadow: finalized ? "none" : "inset 0 0 0 1px var(--color-hairline)",
                }}
              >
                {finalized ? <ShieldCheck size={13} strokeWidth={2.6} /> : <Loader2 size={13} />}
                {finalized ? "Finalized" : "In progress"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 max-md:w-full max-md:flex-row max-md:justify-end">
            {isAdmin && (
              <a
                href={`/appraisal/admin?emp=${data.employee.id}` as Route}
                className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[12.5px] font-bold text-ink-strong"
                style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
              >
                <Settings2 size={14} /> Configure
              </a>
            )}
            {canFinalize && !finalized && (
              <button
                type="button"
                disabled={finalize.busy}
                onClick={() => void finalize.run(() => finalizeScorecard(data.employee.id), "Scorecard finalized")}
                className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 10px 24px -12px ${RED_DEEP}` }}
              >
                {finalize.busy ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} strokeWidth={2.4} />}
                Finalize
              </button>
            )}
          </div>
        </div>
      </div>

      {/* six dimension cards in one row */}
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-sm:grid-cols-2">
        {APPR_DIMENSIONS.map((d) => {
          const p = perDim.get(d);
          return (
            <DimensionCard
              key={d}
              dimension={d}
              pct={p?.pct ?? 0}
              weight={p?.weight ?? 0}
              contribution={p?.contribution ?? 0}
              open={open.has(d)}
              onToggle={() => toggle(d)}
            />
          );
        })}
      </div>

      {/* cumulative expanded sections */}
      {openList.length === 0 ? (
        <div className="rounded-2xl bg-surface-card p-8 text-center text-[13.5px] font-medium text-ink-muted" style={{ boxShadow: CARD_SHADOW }}>
          Click any dimension above to open its scoring section. Sections stack here — open as many as you like.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {openList.map((d) => {
            const p = perDim.get(d);
            return (
              <SectionShell
                key={d}
                dimension={d}
                pct={p?.pct ?? 0}
                weight={p?.weight ?? 0}
                contribution={p?.contribution ?? 0}
                onClose={() => toggle(d)}
              >
                <DimensionSectionBody data={data} dimension={d} />
              </SectionShell>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── picker + workspace root ────────────────────────────────────────────────────

export function AppraisalWorkspace({
  people,
  departments,
  selectedId,
  data,
  isAdmin,
}: {
  people: WorkspacePerson[];
  departments: string[];
  selectedId: string | null;
  data: ScorecardData | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [dept, setDept] = React.useState<string | null>(null);

  const filtered = dept ? people.filter((p) => p.department === dept) : people;

  const grouped = React.useMemo(() => {
    const m = new Map<string, WorkspacePerson[]>();
    for (const p of filtered) {
      const key = p.department || "Unassigned";
      const arr = m.get(key) ?? [];
      arr.push(p);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function go(id: string) {
    if (id) router.push(`/appraisal?emp=${id}` as Route);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* control bar */}
      <div className="wg-rise flex flex-wrap items-center gap-3 rounded-2xl bg-surface-card p-3.5" style={{ boxShadow: CARD_SHADOW }}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <DeptPill label="All" active={dept === null} onClick={() => setDept(null)} />
          {departments.map((d) => (
            <DeptPill key={d} label={d} active={dept === d} onClick={() => setDept(d)} />
          ))}
        </div>
        <select
          value={selectedId ?? ""}
          onChange={(e) => go(e.target.value)}
          className="min-w-[220px] rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
        >
          <option value="" disabled>
            Select a person…
          </option>
          {dept === null
            ? grouped.map(([g, list]) => (
                <optgroup key={g} label={g}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
        </select>
      </div>

      {data ? (
        <Scorecard data={data} isAdmin={isAdmin} />
      ) : (
        <div className="grid place-items-center rounded-[26px] bg-surface-card p-16 text-center" style={{ boxShadow: CARD_SHADOW }}>
          <div>
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              <Award size={26} strokeWidth={2.2} />
            </div>
            <p className="text-[15px] font-bold text-ink-strong">
              {people.length === 0 ? "No scorecards in your scope yet." : "Pick a person to open their live scorecard."}
            </p>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              Self and Manager advise · Management is the final score that counts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DeptPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill px-3 py-1.5 text-[12px] font-bold transition"
      style={{
        background: active ? `linear-gradient(135deg, ${RED}, ${RED_DEEP})` : "var(--color-surface-soft)",
        color: active ? "#fff" : "var(--color-ink-muted)",
        boxShadow: active ? "none" : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      {label}
    </button>
  );
}
