"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/db/enums";
import { createWeeklyGoal } from "@/app/(app)/weekly-goals/actions";
import { ComboInput } from "@/components/weekly-goals/field-controls";

interface Props {
  /** The person the new goal is filed against. "" / "all" disables the form. */
  employeeId: string;
  weekStart: string;
  clientOptions: string[];
  subjectOptions: string[];
}

/**
 * Inline "+ Add goal" card for the redesigned Weekly Goals board. Collapsed to a
 * single dashed button until clicked, then a compact form (Client · Subject ·
 * Priority · Incentive · KPI · Goal) that saves one goal and stays open for the
 * next quick entry. ⌘/Ctrl+Enter saves.
 */
export function GoalQuickAdd(props: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // NOTE: a local `saving` flag — deliberately NOT useTransition. Wrapping the
  // create + router.refresh() in a transition kept `pending` true for the whole
  // (slow) server refresh, leaving the Add button disabled so you could never
  // add a second goal. This flips false the moment the insert returns; the
  // refresh runs in the background.
  const [saving, setSaving] = React.useState(false);
  const [client, setClient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("imp_not_urgent");
  const [incentive, setIncentive] = React.useState(false);
  const [kpi, setKpi] = React.useState(false);
  const [targetDone, setTargetDone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const clientRef = React.useRef<HTMLInputElement>(null);

  const canAdd = Boolean(props.employeeId) && props.employeeId !== "all";
  if (!canAdd) return null;

  function reset() {
    setClient("");
    setSubject("");
    setTargetDone("");
    setIncentive(false);
    setKpi(false);
    setError(null);
  }

  function submit() {
    if (!client.trim() && !subject.trim() && !targetDone.trim()) {
      setError("Add a client, subject, or goal before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    createWeeklyGoal({
      employeeId: props.employeeId,
      weekStart: props.weekStart,
      client: client.trim() || null,
      subject: subject.trim() || null,
      priority,
      incentive,
      kpi,
      targetDone: targetDone.trim() || null,
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Re-enable + clear immediately so the next goal can be typed right away;
        // refresh the list in the background (doesn't block the button).
        reset();
        clientRef.current?.focus();
        router.refresh();
      })
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Couldn't save the goal. Try again.");
      });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => clientRef.current?.focus());
        }}
        className="wg-btn cursor-pointer group flex w-full items-center justify-center gap-2 rounded-section border border-dashed border-hairline-strong bg-surface-card px-4 py-5 text-[15px] font-bold text-ink-muted hover:border-altus-red/50 hover:text-altus-red hover:bg-altus-red/[0.03]"
      >
        <Plus size={18} strokeWidth={2.4} />
        Add goal
      </button>
    );
  }

  return (
    <div
      className="rounded-section border border-hairline bg-surface-card p-4"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
          New goal
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[13px] font-bold text-ink-muted hover:text-ink-strong transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Client</span>
          <ComboInput
            value={client}
            options={props.clientOptions}
            onChange={setClient}
            inputRef={clientRef}
            placeholder="Client"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-ink-soft">Subject</span>
          <ComboInput
            value={subject}
            options={props.subjectOptions}
            onChange={setSubject}
            placeholder="Subject"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
        <input
          value={targetDone}
          onChange={(e) => setTargetDone(e.target.value)}
          placeholder="What does done look like?"
          className="w-full rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[15px] font-medium text-ink-strong outline-none focus:border-altus-red/50"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-bold text-ink-strong outline-none"
          aria-label="Priority"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-soft">
          <input type="checkbox" checked={incentive} onChange={(e) => setIncentive(e.target.checked)} />
          Incentive
        </label>
        <label className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-soft">
          <input type="checkbox" checked={kpi} onChange={(e) => setKpi(e.target.checked)} />
          KPI
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="wg-btn wg-sheen cursor-pointer ml-auto inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[14px] font-bold text-white hover:brightness-110 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add goal
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] font-semibold text-altus-red">{error}</p>}
      <p className="mt-2 text-[12px] font-semibold text-ink-muted">
        Tip: press ⌘/Ctrl + Enter to save.
      </p>
    </div>
  );
}
