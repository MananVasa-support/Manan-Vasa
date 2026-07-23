"use client";

/**
 * Appraisal v2 — ADMIN PANEL (client).
 *
 * Left rail: department filter + searchable employee picker. Right: the selected
 * person's scorecard config — assignees, dimension weights (sum-to-100), the
 * <=5 KPIs, the <=3 Skills, the incentive target and the knowledge do/give rule.
 * Every mutation calls a "use server" admin action; on success we refresh the
 * server props so the panel always reflects the saved truth. Brand tokens only,
 * keyboard-friendly (each editor is a submittable form).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, Plus, Trash2, Save, Loader2, Check, UserCog } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import {
  APPR_DIMENSIONS,
  DIMENSION_LABELS,
  type ApprDimension,
} from "@/lib/appraisal2/types";
import {
  setApprConfig,
  setAssignees,
  setWeights,
  upsertKpi,
  removeKpi,
  upsertSkill,
  removeSkill,
} from "@/app/(app)/appraisal/admin-actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

const INPUT =
  "rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] w-full";

export interface AdminEmployee {
  id: string;
  name: string;
  department: string | null;
  designation: string | null;
  avatarUrl: string | null;
}

export interface KpiDraft {
  id: string;
  srNo: number | null;
  area: string | null;
  measure: string | null;
  subWeight: number;
}
export interface SkillDraft {
  id: string;
  name: string | null;
  technical: boolean;
  subWeight: number;
}
export interface EmployeeConfig {
  employeeId: string;
  managerId: string | null;
  managementId: string | null;
  incentiveTarget: string | null;
  knowledgeDo: number;
  knowledgeGive: number;
  weights: Record<ApprDimension, number>;
  kpis: KpiDraft[];
  skills: SkillDraft[];
}

// ─── section shell ────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: CARD_SHADOW }}>
      <div className="mb-3.5">
        <h3
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 17 }}
        >
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-[12.5px] font-medium text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{children}</span>
  );
}

function SaveButton({ busy, ok, label = "Save" }: { busy: boolean; ok: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -12px ${RED_DEEP}` }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} strokeWidth={2.6} /> : <Save size={14} strokeWidth={2.4} />}
      {busy ? "Saving…" : ok ? "Saved" : label}
    </button>
  );
}

/** Small hook: run a server action inside a transition, toast + refresh. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const run = React.useCallback(
    async (
      fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
      successMsg: string,
    ): Promise<boolean> => {
      setBusy(true);
      setOk(false);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      setOk(true);
      setTimeout(() => setOk(false), 1600);
      fireToast({ message: successMsg, type: "success" });
      router.refresh();
      return true;
    },
    [router],
  );
  return { busy, ok, run };
}

// ─── assignees ────────────────────────────────────────────────────────────────

function AssigneesEditor({ config, people }: { config: EmployeeConfig; people: AdminEmployee[] }) {
  const { busy, ok, run } = useAction();
  const [managerId, setManagerId] = React.useState(config.managerId ?? "");
  const [managementId, setManagementId] = React.useState(config.managementId ?? "");

  const options = people.filter((p) => p.id !== config.employeeId);

  return (
    <Section title="Assignees" hint="Manager advises · Management is the final score that counts.">
      <form
        className="grid grid-cols-2 gap-3 max-md:grid-cols-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              setAssignees({
                employeeId: config.employeeId,
                managerId: managerId || null,
                managementId: managementId || null,
              }),
            "Assignees updated",
          );
        }}
      >
        <label className="flex flex-col gap-1.5">
          <Label>Manager (advisory)</Label>
          <select className={INPUT} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— None —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Management (final)</Label>
          <select className={INPUT} value={managementId} onChange={(e) => setManagementId(e.target.value)}>
            <option value="">— None —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex justify-end max-md:col-span-1">
          <SaveButton busy={busy} ok={ok} />
        </div>
      </form>
    </Section>
  );
}

// ─── dimension weights ────────────────────────────────────────────────────────

function WeightsEditor({ config }: { config: EmployeeConfig }) {
  const { busy, ok, run } = useAction();
  const [weights, setLocal] = React.useState<Record<ApprDimension, number>>(config.weights);
  const sum = APPR_DIMENSIONS.reduce((s, d) => s + (Number(weights[d]) || 0), 0);
  const balanced = sum === 100;

  return (
    <Section title="Dimension weights" hint="The six dimensions must sum to exactly 100.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!balanced) {
            fireToast({ message: `Weights must sum to 100 (currently ${sum}).`, type: "error" });
            return;
          }
          void run(() => setWeights({ employeeId: config.employeeId, weights }), "Weights saved");
        }}
      >
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
          {APPR_DIMENSIONS.map((d) => (
            <label key={d} className="flex flex-col gap-1.5">
              <Label>{DIMENSION_LABELS[d]}</Label>
              <input
                type="number"
                min={0}
                max={100}
                className={INPUT}
                value={weights[d]}
                onChange={(e) =>
                  setLocal((w) => ({ ...w, [d]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span
            className="rounded-pill px-3 py-1.5 text-[12.5px] font-bold"
            style={{
              background: balanced
                ? "color-mix(in srgb, #16a34a 14%, transparent)"
                : "color-mix(in srgb, #dc2626 14%, transparent)",
              color: balanced ? "#15803d" : "#b91c1c",
            }}
          >
            Total {sum} / 100 {balanced ? "✓" : ""}
          </span>
          <SaveButton busy={busy} ok={ok} />
        </div>
      </form>
    </Section>
  );
}

// ─── incentive target + knowledge rule ────────────────────────────────────────

function ConfigEditor({ config }: { config: EmployeeConfig }) {
  const { busy, ok, run } = useAction();
  const [incentive, setIncentive] = React.useState(config.incentiveTarget ?? "");
  const [doN, setDoN] = React.useState(config.knowledgeDo);
  const [giveN, setGiveN] = React.useState(config.knowledgeGive);

  return (
    <Section
      title="Incentive target & knowledge rule"
      hint="Target is reference only (final incentive score is entered by Management). Knowledge = do-N / give-N counts from Training."
    >
      <form
        className="grid grid-cols-3 gap-3 max-md:grid-cols-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              setApprConfig({
                employeeId: config.employeeId,
                incentiveTarget: incentive === "" ? null : incentive,
                knowledgeDo: doN,
                knowledgeGive: giveN,
              }),
            "Config saved",
          );
        }}
      >
        <label className="flex flex-col gap-1.5">
          <Label>Incentive target (₹)</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={INPUT}
            value={incentive}
            onChange={(e) => setIncentive(e.target.value)}
            placeholder="e.g. 50000"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Knowledge · do N</Label>
          <input
            type="number"
            min={0}
            className={INPUT}
            value={doN}
            onChange={(e) => setDoN(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Knowledge · give N</Label>
          <input
            type="number"
            min={0}
            className={INPUT}
            value={giveN}
            onChange={(e) => setGiveN(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <div className="col-span-3 flex justify-end max-md:col-span-1">
          <SaveButton busy={busy} ok={ok} />
        </div>
      </form>
    </Section>
  );
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function KpiRowEditor({ row, employeeId }: { row: KpiDraft; employeeId: string }) {
  const { busy, ok, run } = useAction();
  const router = useRouter();
  const [area, setArea] = React.useState(row.area ?? "");
  const [measure, setMeasure] = React.useState(row.measure ?? "");
  const [subWeight, setSubWeight] = React.useState(row.subWeight);
  const [removing, setRemoving] = React.useState(false);

  return (
    <form
      className="grid grid-cols-[44px_1fr_1fr_92px_auto] items-end gap-2 max-md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => upsertKpi({ employeeId, id: row.id, srNo: row.srNo ?? undefined, area, measure, subWeight }),
          "KPI saved",
        );
      }}
    >
      <div className="flex flex-col gap-1.5 max-md:col-span-2">
        <Label>Sr</Label>
        <div className="grid h-[38px] place-items-center rounded-xl bg-surface-soft text-[14px] font-bold text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          {row.srNo ?? "—"}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Area</Label>
        <input className={INPUT} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Result area" />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Measure</Label>
        <input className={INPUT} value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="How it's measured" />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Sub-wt</Label>
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT}
          value={subWeight}
          onChange={(e) => setSubWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
      </label>
      <div className="flex items-center gap-1.5 pb-0.5 max-md:col-span-2 max-md:justify-end">
        <SaveButton busy={busy} ok={ok} />
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            const res = await removeKpi(row.id);
            setRemoving(false);
            if (!res.ok) {
              fireToast({ message: res.error, type: "error" });
              return;
            }
            fireToast({ message: "KPI removed", type: "success" });
            router.refresh();
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:text-[color:var(--color-altus-red)]"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          aria-label="Remove KPI"
        >
          {removing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={2.2} />}
        </button>
      </div>
    </form>
  );
}

function KpiAdder({ employeeId, nextSr }: { employeeId: string; nextSr: number }) {
  const { busy, ok, run } = useAction();
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [subWeight, setSubWeight] = React.useState(20);

  return (
    <form
      className="grid grid-cols-[44px_1fr_1fr_92px_auto] items-end gap-2 rounded-xl bg-surface-soft/60 p-2 max-md:grid-cols-2"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await run(
          () => upsertKpi({ employeeId, srNo: nextSr, area, measure, subWeight }),
          "KPI added",
        );
        if (done) {
          setArea("");
          setMeasure("");
          setSubWeight(20);
        }
      }}
    >
      <div className="flex flex-col gap-1.5 max-md:col-span-2">
        <Label>Sr</Label>
        <div className="grid h-[38px] place-items-center rounded-xl bg-surface-card text-[14px] font-bold text-ink-muted">{nextSr}</div>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Area</Label>
        <input className={INPUT} value={area} onChange={(e) => setArea(e.target.value)} placeholder="New result area" />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Measure</Label>
        <input className={INPUT} value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="How it's measured" />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Sub-wt</Label>
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT}
          value={subWeight}
          onChange={(e) => setSubWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
      </label>
      <div className="flex items-center pb-0.5 max-md:col-span-2 max-md:justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold disabled:opacity-60"
          style={{ background: "var(--color-surface-card)", color: RED, boxShadow: `inset 0 0 0 1.5px ${RED}` }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.6} />}
          Add
        </button>
      </div>
    </form>
  );
}

function KpiSection({ config }: { config: EmployeeConfig }) {
  const kpis = config.kpis;
  const sum = kpis.reduce((s, k) => s + (k.subWeight || 0), 0);
  const atCap = kpis.length >= 5;
  const nextSr = (kpis.reduce((m, k) => Math.max(m, k.srNo ?? 0), 0) || kpis.length) + 1;

  return (
    <Section title={`KPIs (${kpis.length}/5)`} hint="Result areas scored per item. Sub-weights ideally sum to 100 across your KPIs.">
      <div className="flex flex-col gap-2.5">
        {kpis.map((k) => (
          <KpiRowEditor key={k.id} row={k} employeeId={config.employeeId} />
        ))}
        {kpis.length === 0 && (
          <p className="text-[13px] font-medium text-ink-subtle">No KPIs yet — add up to 5 below.</p>
        )}
        {!atCap && <KpiAdder employeeId={config.employeeId} nextSr={nextSr} />}
      </div>
      {kpis.length > 0 && (
        <div className="mt-3">
          <span
            className="rounded-pill px-3 py-1.5 text-[12px] font-bold"
            style={{
              background: sum === 100 ? "color-mix(in srgb, #16a34a 14%, transparent)" : "var(--color-surface-soft)",
              color: sum === 100 ? "#15803d" : "var(--color-ink-muted)",
            }}
          >
            Sub-weights total {sum}{sum === 100 ? " / 100 ✓" : " / 100"}
          </span>
        </div>
      )}
    </Section>
  );
}

// ─── Skills ───────────────────────────────────────────────────────────────────

function SkillRowEditor({ row, employeeId }: { row: SkillDraft; employeeId: string }) {
  const { busy, ok, run } = useAction();
  const router = useRouter();
  const [name, setName] = React.useState(row.name ?? "");
  const [technical, setTechnical] = React.useState(row.technical);
  const [subWeight, setSubWeight] = React.useState(row.subWeight);
  const [removing, setRemoving] = React.useState(false);

  return (
    <form
      className="grid grid-cols-[1fr_auto_92px_auto] items-end gap-2 max-md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => upsertSkill({ employeeId, id: row.id, name, technical, subWeight }), "Skill saved");
      }}
    >
      <label className="flex flex-col gap-1.5">
        <Label>Skill to learn</Label>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill" />
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Technical</Label>
        <button
          type="button"
          onClick={() => setTechnical((v) => !v)}
          className="inline-flex h-[38px] items-center gap-2 rounded-xl px-3 text-[13px] font-bold"
          style={{
            background: technical ? `color-mix(in srgb, ${RED} 12%, transparent)` : "var(--color-surface-soft)",
            color: technical ? RED : "var(--color-ink-muted)",
            boxShadow: technical ? `inset 0 0 0 1.5px ${RED}` : "inset 0 0 0 1px var(--color-hairline)",
          }}
        >
          {technical ? <Check size={14} strokeWidth={2.6} /> : null}
          {technical ? "Technical" : "Behavioural"}
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Sub-wt</Label>
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT}
          value={subWeight}
          onChange={(e) => setSubWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
      </label>
      <div className="flex items-center gap-1.5 pb-0.5 max-md:col-span-2 max-md:justify-end">
        <SaveButton busy={busy} ok={ok} />
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            const res = await removeSkill(row.id);
            setRemoving(false);
            if (!res.ok) {
              fireToast({ message: res.error, type: "error" });
              return;
            }
            fireToast({ message: "Skill removed", type: "success" });
            router.refresh();
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:text-[color:var(--color-altus-red)]"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          aria-label="Remove skill"
        >
          {removing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={2.2} />}
        </button>
      </div>
    </form>
  );
}

function SkillAdder({ employeeId }: { employeeId: string }) {
  const { busy, ok, run } = useAction();
  const [name, setName] = React.useState("");
  const [technical, setTechnical] = React.useState(false);
  const [subWeight, setSubWeight] = React.useState(33);

  return (
    <form
      className="grid grid-cols-[1fr_auto_92px_auto] items-end gap-2 rounded-xl bg-surface-soft/60 p-2 max-md:grid-cols-2"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await run(() => upsertSkill({ employeeId, name, technical, subWeight }), "Skill added");
        if (done) {
          setName("");
          setTechnical(false);
          setSubWeight(33);
        }
      }}
    >
      <label className="flex flex-col gap-1.5">
        <Label>Skill to learn</Label>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="New skill" />
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Technical</Label>
        <button
          type="button"
          onClick={() => setTechnical((v) => !v)}
          className="inline-flex h-[38px] items-center gap-2 rounded-xl px-3 text-[13px] font-bold"
          style={{
            background: technical ? `color-mix(in srgb, ${RED} 12%, transparent)` : "var(--color-surface-card)",
            color: technical ? RED : "var(--color-ink-muted)",
            boxShadow: technical ? `inset 0 0 0 1.5px ${RED}` : "inset 0 0 0 1px var(--color-hairline)",
          }}
        >
          {technical ? <Check size={14} strokeWidth={2.6} /> : null}
          {technical ? "Technical" : "Behavioural"}
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Sub-wt</Label>
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT}
          value={subWeight}
          onChange={(e) => setSubWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
      </label>
      <div className="flex items-center pb-0.5 max-md:col-span-2 max-md:justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold disabled:opacity-60"
          style={{ background: "var(--color-surface-card)", color: RED, boxShadow: `inset 0 0 0 1.5px ${RED}` }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.6} />}
          Add
        </button>
      </div>
    </form>
  );
}

function SkillSection({ config }: { config: EmployeeConfig }) {
  const skills = config.skills;
  const atCap = skills.length >= 3;
  return (
    <Section title={`Skills to learn (${skills.length}/3)`} hint="Up to 3 skills — flag each as Technical or Behavioural.">
      <div className="flex flex-col gap-2.5">
        {skills.map((s) => (
          <SkillRowEditor key={s.id} row={s} employeeId={config.employeeId} />
        ))}
        {skills.length === 0 && (
          <p className="text-[13px] font-medium text-ink-subtle">No skills yet — add up to 3 below.</p>
        )}
        {!atCap && <SkillAdder employeeId={config.employeeId} />}
      </div>
    </Section>
  );
}

// ─── left rail (picker) ───────────────────────────────────────────────────────

function Picker({
  people,
  departments,
  selectedId,
}: {
  people: AdminEmployee[];
  departments: string[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [dept, setDept] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const filtered = people.filter((p) => {
    if (dept && p.department !== dept) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="rounded-2xl bg-surface-card p-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full rounded-xl border border-hairline bg-surface-soft py-2 pl-9 pr-3 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <DeptPill label="All" active={dept === null} onClick={() => setDept(null)} />
        {departments.map((d) => (
          <DeptPill key={d} label={d} active={dept === d} onClick={() => setDept(d)} />
        ))}
      </div>

      <div className="flex max-h-[560px] flex-col gap-1 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/appraisal/admin?emp=${p.id}` as Route)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition"
              style={{
                background: on ? `color-mix(in srgb, ${RED} 10%, transparent)` : "transparent",
                boxShadow: on ? `inset 0 0 0 1.5px ${RED}` : "none",
              }}
            >
              <EmployeeAvatar name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink-strong">{p.name}</div>
                <div className="truncate text-[12px] text-ink-subtle">
                  {p.designation || p.department || "—"}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-ink-subtle">No matches.</p>
        )}
      </div>
    </div>
  );
}

function DeptPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill px-2.5 py-1 text-[12px] font-bold transition"
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

// ─── panel ────────────────────────────────────────────────────────────────────

export function AdminPanel({
  people,
  departments,
  selectedId,
  config,
}: {
  people: AdminEmployee[];
  departments: string[];
  selectedId: string | null;
  config: EmployeeConfig | null;
}) {
  const selected = selectedId ? people.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="grid grid-cols-[340px_1fr] gap-5 max-lg:grid-cols-1">
      <Picker people={people} departments={departments} selectedId={selectedId} />

      {config && selected ? (
        <div className="flex flex-col gap-4" key={selected.id}>
          <div
            className="flex items-center gap-4 rounded-2xl bg-surface-card p-4"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <EmployeeAvatar name={selected.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-black text-ink-strong">{selected.name}</div>
              <div className="text-[13px] text-ink-subtle">
                {[selected.designation, selected.department].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </div>

          <AssigneesEditor config={config} people={people} />
          <WeightsEditor config={config} />
          <ConfigEditor config={config} />
          <KpiSection config={config} />
          <SkillSection config={config} />
        </div>
      ) : (
        <div
          className="grid place-items-center rounded-2xl bg-surface-card p-16 text-center"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div>
            <div
              className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
            >
              <UserCog size={26} strokeWidth={2.2} />
            </div>
            <p className="text-[15px] font-bold text-ink-strong">Pick a person to configure</p>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              Choose from the list to set their KPIs, skills, weights and assignees.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
