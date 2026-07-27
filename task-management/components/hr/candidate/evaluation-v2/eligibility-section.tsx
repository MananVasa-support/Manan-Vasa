"use client";

import * as React from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Ban } from "lucide-react";
import { SECTION_BY_ID, sectionItemIds } from "@/lib/hr/candidate/evaluation-v2";
import { eligibilityVerdict } from "@/lib/hr/candidate/evaluation-v2-scoring";
import { SegmentedPassFail } from "./controls";
import { RowNotes, VoiceTextbox } from "./voice";
import type { EvalController } from "./controller";

const RED = "var(--color-altus-red)";
const section = SECTION_BY_ID.eligibility!;

const LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  section.groups.flatMap((g) => g.items.map((i) => [i.id, i.label])),
);

/**
 * A · Eligibility / Non-Negotiables. Strict Yes/No/N-A rows with dictatable
 * per-row notes, a live deal-breaker banner, and an Exceptions box that (when
 * filled) waives the deal-breaker. When tripped, a one-tap "Mark as Reject".
 */
export function EligibilitySection({ ctrl }: { ctrl: EvalController }) {
  const { instance } = ctrl;
  const verdict = eligibilityVerdict(instance);
  const items = sectionItemIds(section);
  const answered = verdict.answered;

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <VerdictBanner
        state={
          verdict.dealbreaker
            ? "dealbreaker"
            : verdict.noItems.length > 0
              ? "excepted"
              : answered === 0
                ? "empty"
                : "clear"
        }
        noLabels={verdict.noItems.map((id) => LABEL_BY_ID[id] ?? id)}
        answered={answered}
        total={verdict.total}
        onReject={() => ctrl.setRecommendation("reject")}
        isReject={instance.recommendation === "reject"}
      />

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
        {section.groups[0]?.items.map((item, i) => {
          const val = instance.passfail[item.id];
          const isNo = val === "no";
          return (
            <div
              key={item.id}
              className="flex flex-col gap-2.5 border-b border-hairline px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              style={isNo ? { background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" } : undefined}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: RED }}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-ink-strong">{item.label}</p>
                  <RowNotes value={instance.notes[item.id] ?? ""} onChange={(v) => ctrl.setNote(item.id, v)} />
                </div>
              </div>
              <div className="shrink-0 sm:pl-4">
                <SegmentedPassFail value={val} onChange={(v) => ctrl.setPassfail(item.id, v)} label={item.label} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Exceptions */}
      <div className="rounded-2xl border border-hairline bg-surface-soft p-4">
        <VoiceTextbox
          label="Exceptions (waives any deal-breaker above)"
          value={instance.sectionNotes["eligibility"] ?? ""}
          onChange={(v) => ctrl.setSectionNote("eligibility", v)}
          placeholder="If a ‘No’ is acceptable for this candidate, record why here — this clears the deal-breaker…"
          rows={3}
          minHeight={80}
          hint="A recorded exception overrides the strict pass/fail so the candidate isn't auto-rejected."
        />
      </div>
    </div>
  );
}

function VerdictBanner({
  state,
  noLabels,
  answered,
  total,
  onReject,
  isReject,
}: {
  state: "clear" | "dealbreaker" | "excepted" | "empty";
  noLabels: string[];
  answered: number;
  total: number;
  onReject: () => void;
  isReject: boolean;
}) {
  if (state === "empty") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-soft px-4 py-3.5">
        <ShieldQuestion size={20} className="shrink-0 text-ink-subtle" />
        <p className="text-[13.5px] font-semibold text-ink-muted">
          Answer each non-negotiable — any un-excepted “No” is an immediate deal-breaker.
        </p>
        <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-ink-subtle">
          {answered} / {total}
        </span>
      </div>
    );
  }

  if (state === "clear") {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
        style={{ borderColor: "color-mix(in srgb, #16a34a 30%, white)", background: "color-mix(in srgb, #16a34a 8%, white)" }}
      >
        <ShieldCheck size={20} className="shrink-0" style={{ color: "#15803d" }} />
        <p className="text-[14px] font-bold" style={{ color: "#15803d" }}>
          All clear — no deal-breakers.
        </p>
        <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "#15803d" }}>
          {answered} / {total} answered
        </span>
      </div>
    );
  }

  if (state === "excepted") {
    return (
      <div
        className="rounded-2xl border px-4 py-3.5"
        style={{ borderColor: "color-mix(in srgb, #f59e0b 40%, white)", background: "color-mix(in srgb, #f59e0b 10%, white)" }}
      >
        <div className="flex items-center gap-3">
          <ShieldAlert size={20} className="shrink-0" style={{ color: "#b45309" }} />
          <p className="text-[14px] font-bold" style={{ color: "#b45309" }}>
            {noLabels.length} concern{noLabels.length === 1 ? "" : "s"} waived by a recorded exception.
          </p>
        </div>
        {noLabels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
            {noLabels.map((l) => (
              <span key={l} className="inline-flex rounded-pill px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #f59e0b 18%, white)", color: "#b45309" }}>
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // dealbreaker
  return (
    <div
      className="rounded-2xl border px-4 py-3.5"
      style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 45%, white)", background: "color-mix(in srgb, var(--color-altus-red) 9%, white)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Ban size={20} className="shrink-0" style={{ color: RED }} />
        <p className="text-[14px] font-black" style={{ color: "var(--color-altus-red-deep)" }}>
          Deal-breaker — {noLabels.length} non-negotiable{noLabels.length === 1 ? "" : "s"} failed.
        </p>
        <button
          type="button"
          onClick={onReject}
          disabled={isReject}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors disabled:opacity-60"
          style={{ background: isReject ? "var(--color-altus-red-deep)" : RED }}
        >
          <Ban size={13} strokeWidth={2.6} /> {isReject ? "Marked as Reject" : "Mark as Reject"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
        {noLabels.map((l) => (
          <span key={l} className="inline-flex rounded-pill px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, white)", color: "var(--color-altus-red-deep)" }}>
            {l}
          </span>
        ))}
      </div>
      <p className="mt-2 pl-8 text-[12.5px] font-medium" style={{ color: "var(--color-altus-red-deep)" }}>
        Record an Exception below to waive this, or mark the candidate as a reject.
      </p>
    </div>
  );
}
