"use client";

import * as React from "react";
import { ChevronDown, Check, Trash2, Plus, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addInterviewPosition, deleteInterviewPosition } from "@/app/(app)/hr/candidate-actions";

/**
 * "Position Applied For" — a dropdown whose options ARE the live Interview
 * Positions master. For authorised users (canManage) each option carries a
 * Delete control and an "Add position" row sits at the bottom; changes persist
 * via the candidate-actions server actions and reflect immediately.
 * Plain CSS/Tailwind only (no motion, no styled-jsx).
 */
const RED = "var(--color-altus-red)";

export function IntakePositionSelect({
  value,
  onChange,
  seed,
  canManage,
  autoFocus,
  error,
  label = "Position Applied For",
}: {
  value: string;
  onChange: (v: string) => void;
  seed: string[];
  canManage: boolean;
  autoFocus?: boolean;
  error?: boolean;
  label?: string;
}) {
  const triggerId = React.useId();
  const [opts, setOpts] = React.useState<string[]>(seed);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [delBusy, setDelBusy] = React.useState<string | null>(null);

  React.useEffect(() => setOpts(seed), [seed]);

  async function add() {
    const label = draft.trim().replace(/\s+/g, " ");
    if (!label) return;
    setBusy(true);
    try {
      const res = await addInterviewPosition(label);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setOpts((p) => (p.includes(res.label) ? p : [...p, res.label]));
      onChange(res.label);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(label: string) {
    setDelBusy(label);
    try {
      const res = await deleteInterviewPosition(label);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setOpts((p) => p.filter((o) => o !== label));
      if (value === label) onChange("");
    } finally {
      setDelBusy(null);
    }
  }

  return (
    <div className={`iwf is-float${error ? " is-error" : ""}`}>
      <button
        id={triggerId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-autofocus={autoFocus || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="iwf-control flex w-full items-center justify-between gap-2 text-left"
        style={{ paddingRight: 42 }}
      >
        <span className={`truncate ${value ? "" : "text-ink-subtle"}`}>{value || "— Select —"}</span>
      </button>
      <label htmlFor={triggerId} className="iwf-label">
        {label}
        <span className="iwf-req" aria-hidden>*</span>
      </label>
      <ChevronDown size={18} className="iwf-caret" aria-hidden />

      {open && (
        <>
          <div className="fixed inset-0 z-[140]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 right-0 z-[141] mt-1.5 max-h-[320px] overflow-y-auto rounded-xl border border-hairline bg-white py-1 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.5)]">
            {opts.length === 0 && <p className="px-3 py-3 text-[13px] text-ink-subtle">No positions yet.</p>}
            {opts.map((o) => {
              const active = value === o;
              return (
                <div key={o} className="group flex items-center gap-1 px-1.5">
                  <button
                    type="button"
                    onClick={() => { onChange(active ? "" : o); setOpen(false); }}
                    className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14.5px] font-medium text-ink-strong hover:bg-surface-muted"
                  >
                    <span className="grid h-4 w-4 place-items-center" style={{ color: RED }}>{active && <Check size={15} strokeWidth={3} />}</span>
                    {o}
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => remove(o)}
                      disabled={delBusy === o}
                      aria-label={`Delete ${o}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-opacity hover:bg-altus-red/10 hover:text-altus-red group-hover:opacity-100"
                    >
                      {delBusy === o ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              );
            })}

            {canManage && (
              <div className="mt-1 flex items-center gap-1.5 border-t border-hairline px-2.5 pt-2 pb-1.5">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                  placeholder="Add a new position…"
                  className="min-w-0 flex-1 rounded-md border border-hairline-strong px-2.5 py-2 text-[14px] outline-none focus:border-altus-red/60"
                />
                <button
                  type="button"
                  onClick={add}
                  disabled={busy || !draft.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  style={{ background: RED }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.6} />} Add
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
