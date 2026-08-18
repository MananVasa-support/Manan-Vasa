"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, X, CheckCircle2, Circle, CalendarDays } from "lucide-react";
import { upsertMilestone, setMilestoneDelivered, deleteMilestone } from "@/app/(app)/billing/actions";
import {
  BILLING_MILESTONE_SEED_STAGES,
  milestoneStageLabel,
  nextMilestoneStage,
} from "@/db/enums";
import type { ProposalWithMilestones } from "@/lib/queries/billing-milestones";
import { formatDMonY } from "@/lib/format";
import { DateField } from "@/components/ui/date-field";

/**
 * MILESTONES — the delivery stages of a WMS proposal and the payment due at
 * each. `Advance` then an OPEN-ENDED run of M1, M2, M3, … — "+ Add Milestone"
 * mints the next number automatically. There is no fixed `Final`: a closing
 * balance is a payment concern, handled in the Payment Schedule, not a
 * delivery stage every proposal is forced to carry.
 * One row per stage (the DB enforces uniqueness).
 *
 * Each milestone can be ticked delivered inline, which stamps the delivery date
 * and moves the value bar. Progress is measured BY VALUE, not by count: a
 * delivered Advance on a ₹5L proposal is 20% done, not 50% because it happens
 * to be one of two stages.
 */

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";
const GREEN = "#15803D";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";

const inr = (n: number) =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Draft = {
  id?: string;
  stage: string;
  title: string;
  description: string;
  dueDate: string;
  amount: string;
  isDelivered: boolean;
};

export function ProposalMilestones({ detail }: { detail: ProposalWithMilestones }) {
  const { proposal, milestones, totals } = detail;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const usedStages = new Set(milestones.map((m) => m.stage));
  // Seed stages still unused (Advance, M1-M3), then the next minted number.
  // `Advance` is offered while free; past the seeds the sequence just continues.
  const freeSeeds = BILLING_MILESTONE_SEED_STAGES.filter((s) => !usedStages.has(s));
  const autoStage = freeSeeds[0] ?? nextMilestoneStage([...usedStages]);

  function openCreate() {
    setError(null);
    setDraft({
      stage: autoStage,
      title: "",
      description: "",
      dueDate: "",
      amount: "",
      isDelivered: false,
    });
  }

  function openEdit(m: ProposalWithMilestones["milestones"][number]) {
    setError(null);
    setDraft({
      id: m.id,
      stage: m.stage,
      title: m.title ?? "",
      description: m.description ?? "",
      dueDate: m.dueDate ?? "",
      amount: m.amount === null ? "" : String(m.amount),
      isDelivered: m.isDelivered,
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertMilestone({
        ...(draft.id ? { id: draft.id } : {}),
        proposalId: proposal.id,
        stage: draft.stage,
        title: draft.title || null,
        description: draft.description || null,
        dueDate: draft.dueDate || null,
        // Blank stays null — "no payment due" must not become "₹0 due".
        amount: draft.amount.trim() === "" ? null : Number(draft.amount),
        isDelivered: draft.isDelivered,
      });
      if (res.ok) setDraft(null);
      else setError(res.error);
    });
  }

  function toggle(m: ProposalWithMilestones["milestones"][number]) {
    startTransition(async () => {
      const res = await setMilestoneDelivered(m.id, !m.isDelivered);
      if (!res.ok) alert(res.error);
    });
  }

  function remove(m: ProposalWithMilestones["milestones"][number]) {
    if (!confirm(`Delete the ${milestoneStageLabel(m.stage)} milestone?`)) return;
    startTransition(async () => {
      const res = await deleteMilestone(m.id);
      if (!res.ok) alert(res.error);
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section
      className="rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Milestones"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-extrabold tracking-tight text-ink-strong">Milestones</h2>
          <p className="text-[12.5px] text-ink-subtle">
            Delivery stages and the payment due at each — Advance, then M1, M2, M3 and as many as you need.
          </p>
        </div>
        {/* Never disabled — the sequence is open-ended, so there is always a
            next stage to mint. */}
        <button
          type="button"
          onClick={openCreate}
          className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
        >
          <Plus size={15} strokeWidth={2.8} /> Add Milestone
          <span className="rounded-pill bg-white/20 px-1.5 py-0.5 text-[11px] tabular-nums">
            {milestoneStageLabel(autoStage)}
          </span>
        </button>
      </header>

      {/* Value summary */}
      {totals.count > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Milestone value" value={inr(totals.total)} caption={`${totals.count} stage${totals.count === 1 ? "" : "s"}`} />
          <Stat
            label="Delivered"
            value={inr(totals.delivered)}
            caption={`${totals.deliveredCount} of ${totals.count} stages`}
            tone={GREEN}
          />
          <Stat
            label="Pending"
            value={inr(totals.pending)}
            caption={totals.pending > 0 ? "not yet delivered" : "all delivered"}
            tone={totals.pending > 0 ? "var(--color-altus-red)" : GREEN}
          />
          <div className="sm:col-span-3">
            <div className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-ink-subtle">
              <span>Delivery progress (by value)</span>
              <span className="tabular-nums">{Math.round(totals.progress * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
              <span
                className="block h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(2, totals.progress * 100)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${PURPLE} 65%, #fff), ${PURPLE})`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-strong py-12 text-center">
          <p className="text-[14.5px] font-bold text-ink-strong">No milestones yet</p>
          <p className="mt-1 text-[13px] text-ink-subtle">
            Add the stages this proposal will be delivered and invoiced in.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Title / description</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3 text-right">Payment</th>
                <th className="px-3 py-3">Delivered</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => {
                const overdue = !m.isDelivered && !!m.dueDate && m.dueDate < today;
                return (
                  <tr key={m.id} className="border-t border-hairline">
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
                        style={{ background: `color-mix(in srgb, ${PURPLE} 12%, transparent)`, color: PURPLE }}
                      >
                        {milestoneStageLabel(m.stage)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-ink-strong">
                        {m.title ?? milestoneStageLabel(m.stage)}
                      </div>
                      {m.description && <div className="text-[11.5px] text-ink-subtle">{m.description}</div>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {m.dueDate ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={12} className="text-ink-subtle" />
                          {formatDMonY(m.dueDate)}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                      {overdue && (
                        <div
                          className="mt-0.5 inline-flex rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
                          style={{
                            background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                            color: "var(--color-altus-red)",
                          }}
                        >
                          Overdue
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-strong">
                      {m.amount === null ? <span className="font-normal text-ink-subtle">—</span> : inr(m.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(m)}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"
                        style={{ color: m.isDelivered ? GREEN : "var(--color-ink-subtle)" }}
                      >
                        {m.isDelivered ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        {m.isDelivered ? (m.deliveredOn ? formatDMonY(m.deliveredOn) : "Delivered") : "Mark delivered"}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          aria-label={`Edit ${milestoneStageLabel(m.stage)}`}
                          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          aria-label={`Delete ${milestoneStageLabel(m.stage)}`}
                          className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* The sequence continues here rather than ending at a fixed
                  stage — this row IS the "what comes next" affordance, sitting
                  where the next milestone will appear. */}
              <tr className="border-t border-hairline">
                <td colSpan={6} className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04]"
                    style={{ color: PURPLE }}
                  >
                    <Plus size={14} strokeWidth={3} />
                    Add Milestone
                    <span
                      className="rounded-pill px-2 py-0.5 text-[11px] tabular-nums"
                      style={{ background: `color-mix(in srgb, ${PURPLE} 12%, transparent)` }}
                    >
                      {milestoneStageLabel(autoStage)}
                    </span>
                  </button>
                </td>
              </tr>
              <tr className="border-t border-hairline-strong bg-black/[0.02]">
                <td colSpan={3} className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                  Total
                </td>
                <td className="px-3 py-3 text-right text-[15px] font-extrabold tabular-nums text-ink-strong">
                  {inr(totals.total)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm max-md:p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "Edit milestone" : "Add milestone"}
            className="my-8 w-full max-w-[560px] rounded-[22px] bg-surface-card shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <h2 className="text-[19px] font-extrabold tracking-tight text-ink-strong">
                  {draft.id ? "Edit milestone" : "Add milestone"}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-subtle">{proposal.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={save} className="px-6 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                    color: "var(--color-altus-red)",
                  }}
                >
                  {error}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* The stage is assigned, not chosen: creating mints the next
                    number in the sequence, and editing keeps the one the client
                    was already quoted. Letting it be re-picked would either
                    collide with the unique index or silently renumber work. */}
                <Field
                  label="Stage"
                  hint={draft.id ? "A milestone keeps its stage." : "Next in this proposal's sequence."}
                >
                  <input className={`${inputCls} cursor-not-allowed opacity-70`} value={milestoneStageLabel(draft.stage)} readOnly />
                </Field>
                <Field label="Due date">
                  <DateField
                    className={inputCls}
                    value={draft.dueDate}
                    onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  />
                </Field>
                <Field label="Title">
                  <input
                    className={inputCls}
                    placeholder={milestoneStageLabel(draft.stage)}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </Field>
                <Field label="Payment amount" hint="Leave blank if no payment is due at this stage.">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-soft md:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.isDelivered}
                    onChange={(e) => setDraft({ ...draft, isDelivered: e.target.checked })}
                  />
                  Mark as delivered
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="wg-btn rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                  style={{
                    background: "var(--color-surface-card)",
                    color: "var(--color-ink-soft)",
                    boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
                >
                  {pending ? "Saving…" : draft.id ? "Save changes" : "Add milestone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</div>
      <div
        className="mt-1 tabular-nums"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 21,
          letterSpacing: "-0.02em",
          color: tone ?? "var(--color-ink-strong)",
        }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-subtle">{caption}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label} {required && <span style={{ color: "var(--color-altus-red)" }}>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-subtle">{hint}</span>}
    </label>
  );
}
