"use client";

import { useCallback, useState } from "react";
import {
  Undo2,
  Redo2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Save,
  Milestone,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { GrowthStep } from "@/lib/hr-docs/types";
import {
  addGrowthStep,
  editGrowthStep,
  removeGrowthStep,
} from "@/app/(app)/hr-docs/ctc-actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * Growth Journey — the vertical milestone timeline inside the CTC editor, with a
 * FULL client-side undo/redo history stack. Add / edit / delete steps locally
 * (each mutation pushes a history snapshot; undo/redo walk the stack), then
 * "Save journey" reconciles the current snapshot against the last-persisted
 * baseline through the granular server actions (remove → edit → add) and adopts
 * the server's authoritative journey as the new baseline.
 *
 * Mount with `key={ctcId}` so switching CTC versions resets the history cleanly.
 */
export function GrowthJourney({
  ctcId,
  initialSteps,
  onPreviewChange,
}: {
  ctcId: string;
  initialSteps: GrowthStep[];
  onPreviewChange?: (steps: GrowthStep[]) => void;
}) {
  const [history, setHistory] = useState<GrowthStep[][]>([initialSteps]);
  const [pointer, setPointer] = useState(0);
  const [baseline, setBaseline] = useState<GrowthStep[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftStep>({ date: "", title: "", detail: "" });

  const present = history[pointer]!;
  const canUndo = pointer > 0;
  const canRedo = pointer < history.length - 1;
  const dirty = !sameSteps(present, baseline);

  const commit = useCallback(
    (next: GrowthStep[]) => {
      setHistory((h) => [...h.slice(0, pointer + 1), next]);
      setPointer((p) => p + 1);
      onPreviewChange?.(next);
    },
    [pointer, onPreviewChange],
  );

  function undo() {
    if (!canUndo) return;
    const p = pointer - 1;
    setPointer(p);
    onPreviewChange?.(history[p]!);
  }
  function redo() {
    if (!canRedo) return;
    const p = pointer + 1;
    setPointer(p);
    onPreviewChange?.(history[p]!);
  }

  function startAdd() {
    setEditingId(null);
    setDraft({ date: "", title: "", detail: "" });
    setAdding(true);
  }
  function startEdit(step: GrowthStep) {
    setAdding(false);
    setEditingId(step.id);
    setDraft({ date: step.date, title: step.title, detail: step.detail });
  }
  function cancelDraft() {
    setAdding(false);
    setEditingId(null);
    setDraft({ date: "", title: "", detail: "" });
  }

  function commitAdd() {
    const d = normaliseDraft(draft);
    if (!d.title && !d.detail && !d.date) {
      fireToast({ message: "Add a title, date or detail for the step.", type: "error" });
      return;
    }
    commit([...present, { id: tmpId(), ...d }]);
    cancelDraft();
  }
  function commitEdit(id: string) {
    const d = normaliseDraft(draft);
    commit(present.map((s) => (s.id === id ? { ...s, ...d } : s)));
    cancelDraft();
  }
  function del(id: string) {
    if (editingId === id) cancelDraft();
    commit(present.filter((s) => s.id !== id));
  }

  async function persist() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      let latest: GrowthStep[] | null = null;

      // Removals — steps in the saved baseline that are gone from the snapshot.
      for (const b of baseline) {
        if (!present.some((p) => p.id === b.id)) {
          const r = await removeGrowthStep({ id: ctcId, stepId: b.id });
          if (!r.ok) {
            fireToast({ message: r.error, type: "error" });
            return;
          }
          latest = r.ctc.growthJourney;
        }
      }

      // Edits — persisted steps whose content changed.
      for (const p of present) {
        if (isTmp(p.id)) continue;
        const b = baseline.find((x) => x.id === p.id);
        if (b && (b.date !== p.date || b.title !== p.title || b.detail !== p.detail)) {
          const r = await editGrowthStep({
            id: ctcId,
            stepId: p.id,
            date: p.date,
            title: p.title,
            detail: p.detail,
          });
          if (!r.ok) {
            fireToast({ message: r.error, type: "error" });
            return;
          }
          latest = r.ctc.growthJourney;
        }
      }

      // Additions — locally-added steps (temp ids) get real server ids on insert.
      for (const p of present) {
        if (!isTmp(p.id)) continue;
        const r = await addGrowthStep({
          id: ctcId,
          date: p.date,
          title: p.title,
          detail: p.detail,
        });
        if (!r.ok) {
          fireToast({ message: r.error, type: "error" });
          return;
        }
        latest = r.ctc.growthJourney;
      }

      const finalSteps = latest ?? present;
      setBaseline(finalSteps);
      setHistory([finalSteps]);
      setPointer(0);
      onPreviewChange?.(finalSteps);
      fireToast({ message: "Growth journey saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          <Milestone size={13} strokeWidth={2.4} style={{ color: ACCENT_DEEP }} /> Growth journey
        </h4>
        <div className="flex items-center gap-1">
          <IconBtn onClick={undo} disabled={!canUndo || busy} label="Undo">
            <Undo2 size={14} strokeWidth={2.4} />
          </IconBtn>
          <IconBtn onClick={redo} disabled={!canRedo || busy} label="Redo">
            <Redo2 size={14} strokeWidth={2.4} />
          </IconBtn>
        </div>
      </div>

      {/* timeline */}
      {present.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-hairline-strong px-4 py-6 text-center text-[12.5px] font-medium text-ink-subtle">
          No milestones yet. Add the promotions, awards and pay revisions that tell this person&apos;s story.
        </p>
      ) : (
        <ol className="relative ml-1 space-y-2 border-l-2 pl-4" style={{ borderColor: `${ACCENT}33` }}>
          {present.map((step) =>
            editingId === step.id ? (
              <li key={step.id} className="relative">
                <Dot />
                <StepForm
                  draft={draft}
                  setDraft={setDraft}
                  onSave={() => commitEdit(step.id)}
                  onCancel={cancelDraft}
                  saveLabel="Update"
                />
              </li>
            ) : (
              <li key={step.id} className="group relative">
                <Dot />
                <div className="rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {step.date.trim() && (
                        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                          {step.date}
                        </div>
                      )}
                      {step.title.trim() && (
                        <div className="text-[13.5px] font-semibold text-ink-strong">{step.title}</div>
                      )}
                      {step.detail.trim() && (
                        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{step.detail}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                      <IconBtn onClick={() => startEdit(step)} disabled={busy} label="Edit step">
                        <Pencil size={12.5} strokeWidth={2.4} />
                      </IconBtn>
                      <IconBtn onClick={() => del(step.id)} disabled={busy} label="Delete step" danger>
                        <Trash2 size={12.5} strokeWidth={2.4} />
                      </IconBtn>
                    </div>
                  </div>
                </div>
              </li>
            ),
          )}
          {adding && (
            <li className="relative">
              <Dot />
              <StepForm
                draft={draft}
                setDraft={setDraft}
                onSave={commitAdd}
                onCancel={cancelDraft}
                saveLabel="Add"
              />
            </li>
          )}
        </ol>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {!adding && editingId === null ? (
          <button
            type="button"
            onClick={startAdd}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong hover:border-ink-soft disabled:opacity-50"
          >
            <Plus size={13} strokeWidth={2.6} /> Add milestone
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={persist}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-45"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={2.4} />}
          {busy ? "Saving…" : dirty ? "Save journey" : "Saved"}
        </button>
      </div>
    </div>
  );
}

interface DraftStep {
  date: string;
  title: string;
  detail: string;
}

function StepForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: DraftStep;
  setDraft: (d: DraftStep) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="rounded-xl border border-hairline-strong bg-surface-card p-3">
      <div className="grid grid-cols-1 gap-2">
        <input
          className="gj-input"
          placeholder="Date / period (e.g. Apr 2025)"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          autoFocus
        />
        <input
          className="gj-input"
          placeholder="Title (e.g. Promoted to Senior Associate)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <textarea
          className="gj-input"
          placeholder="Detail (optional)"
          rows={2}
          value={draft.detail}
          onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
          style={{ resize: "vertical" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[12px] font-semibold text-ink-muted hover:border-ink-soft"
        >
          <X size={12} strokeWidth={2.6} /> Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          <Check size={12} strokeWidth={2.8} /> {saveLabel}
        </button>
      </div>
      <style jsx>{`
        .gj-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--color-hairline-strong);
          background: var(--color-surface-card);
          padding: 7px 9px;
          font-size: 12.5px;
          color: var(--color-ink-strong);
          outline: none;
        }
        .gj-input:focus {
          border-color: ${ACCENT};
          box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 16%, transparent);
        }
      `}</style>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--color-surface-card)]"
      style={{ background: ACCENT }}
    />
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-40 ${
        danger
          ? "text-ink-soft hover:bg-[color:color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-[#dc2626]"
          : "text-ink-soft hover:bg-surface-muted hover:text-ink-strong"
      }`}
    >
      {children}
    </button>
  );
}

function normaliseDraft(d: DraftStep): DraftStep {
  return { date: d.date.trim(), title: d.title.trim(), detail: d.detail.trim() };
}
function isTmp(id: string): boolean {
  return id.startsWith("tmp-");
}
function tmpId(): string {
  const rnd =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `tmp-${rnd}`;
}
function sameSteps(a: GrowthStep[], b: GrowthStep[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
