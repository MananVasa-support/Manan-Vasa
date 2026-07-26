"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveExitRecord } from "@/app/(app)/hr/exit/exit-actions";
import { CLEARANCE_ROWS, HANDOVER_INSTRUCTIONS } from "@/lib/hr/exit/content";
import { FloatingInput, CheckRow } from "./exit-fields";

type Fields = Record<string, string>;
type Checked = Record<string, boolean>;

interface InitialData {
  fields?: Fields;
  checked?: Checked;
}

export function ExitHandoverForm({
  employeeId,
  employeeName,
  recordId,
  initial,
  onBack,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  recordId: string | null;
  initial?: InitialData;
  onBack: () => void;
  onSaved?: (id: string) => void;
}) {
  const [fields, setFields] = React.useState<Fields>(() => ({
    header_employeeName: employeeName,
    ...(initial?.fields ?? {}),
  }));
  const [checked, setChecked] = React.useState<Checked>(() => initial?.checked ?? {});
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(recordId ? new Date() : null);

  const idRef = React.useRef<string | null>(recordId);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const stateRef = React.useRef({ fields, checked });
  stateRef.current = { fields, checked };

  const setF = React.useCallback((k: string, v: string) => {
    setFields((p) => ({ ...p, [k]: v }));
    dirtyRef.current = true;
  }, []);
  const toggle = React.useCallback((id: string) => {
    setChecked((p) => ({ ...p, [id]: !p[id] }));
    dirtyRef.current = true;
  }, []);

  const persist = React.useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      try {
        const s = stateRef.current;
        const res = await saveExitRecord({
          id: idRef.current ?? undefined,
          employeeId,
          kind: "handover",
          data: { fields: s.fields, checked: s.checked },
        });
        if (res.ok) {
          idRef.current = res.id;
          setSavedAt(new Date());
          dirtyRef.current = false;
          if (!silent) fireToast({ message: "Handover checklist saved." });
          onSaved?.(res.id);
          return true;
        }
        if (!silent) fireToast({ message: res.error, type: "error" });
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [employeeId, onSaved],
  );

  React.useEffect(() => {
    const iv = setInterval(() => {
      if (dirtyRef.current) void persist(true);
    }, 1400);
    return () => {
      clearInterval(iv);
      if (dirtyRef.current) void persist(true);
    };
  }, [persist]);

  async function onSaveClick() {
    setSaving(true);
    try {
      await persist(false);
    } finally {
      setSaving(false);
    }
  }

  const totalItems = CLEARANCE_ROWS.reduce((n, r) => n + r.items.length, 0);
  const doneItems = CLEARANCE_ROWS.reduce((n, r) => n + r.items.filter((it) => checked[it.id]).length, 0);

  return (
    <div className="ex-step mx-auto w-full max-w-[960px] px-6 pb-40 pt-8 max-md:px-4">
      <div className="mb-6">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-muted">Annexure A</span>
        <h1
          className="mt-1 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.01em" }}
        >
          Handover &amp; Clearance Checklist
        </h1>
        <p
          className="mt-3 rounded-xl px-4 py-3 text-[13.5px] leading-relaxed text-ink-strong"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 5%, #fff)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, #fff)",
          }}
        >
          <strong style={{ color: "var(--color-altus-red-deep)" }}>Instructions:</strong> {HANDOVER_INSTRUCTIONS}
        </p>
      </div>

      {/* header fields */}
      <div className="mb-8 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <FloatingInput label="Employee Name" value={fields.header_employeeName ?? ""} onChange={(v) => setF("header_employeeName", v)} autoFocus />
        <FloatingInput label="Employee ID" value={fields.header_employeeId ?? ""} onChange={(v) => setF("header_employeeId", v)} />
        <FloatingInput label="Department" value={fields.header_department ?? ""} onChange={(v) => setF("header_department", v)} />
        <FloatingInput label="Last Working Day" type="date" value={fields.header_lastWorkingDay ?? ""} onChange={(v) => setF("header_lastWorkingDay", v)} />
      </div>

      {/* progress */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%`,
              background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
              transition: "width .4s cubic-bezier(.22,1,.36,1)",
            }}
          />
        </div>
        <span className="text-[12.5px] font-bold tabular-nums text-ink-muted">
          {doneItems}/{totalItems} cleared
        </span>
      </div>

      {/* clearance rows */}
      <div className="flex flex-col gap-4">
        {CLEARANCE_ROWS.map((row) => {
          const rowDone = row.items.every((it) => checked[it.id]);
          return (
            <section key={row.id} className="overflow-hidden rounded-2xl border border-hairline bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5 max-md:px-4" style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, #fff)" }}>
                <h3 className="text-[15px] font-extrabold text-ink-strong">{row.department}</h3>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                  style={
                    rowDone
                      ? { background: "color-mix(in srgb, #16a34a 14%, #fff)", color: "#15803d" }
                      : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }
                  }
                >
                  {rowDone && <Check size={12} strokeWidth={3} />}
                  {row.items.filter((it) => checked[it.id]).length}/{row.items.length}
                </span>
              </div>
              <div className="grid gap-2.5 p-5 max-md:p-4">
                <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                  {row.items.map((it) => (
                    <CheckRow key={it.id} label={it.label} checked={Boolean(checked[it.id])} onToggle={() => toggle(it.id)} />
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <FloatingInput
                    label="Sign-off (name)"
                    value={fields[`signoff_${row.id}_name`] ?? ""}
                    onChange={(v) => setF(`signoff_${row.id}_name`, v)}
                  />
                  <FloatingInput
                    label="Date"
                    type="date"
                    value={fields[`signoff_${row.id}_date`] ?? ""}
                    onChange={(v) => setF(`signoff_${row.id}_date`, v)}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-white/95 px-6 py-3.5 backdrop-blur max-md:px-4">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-ink-soft"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "#16a34a" }}>
                <Check size={13} strokeWidth={3} /> Saved
              </span>
            )}
            <button
              onClick={onSaveClick}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saving ? "Saving…" : "Save checklist"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
