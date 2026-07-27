"use client";

import { useMemo } from "react";
import {
  CTC_COMPONENTS,
  GROUP_LABELS,
  annualOf,
  monthlyOf,
  computeTotals,
  formatINR,
  num,
  type CtcComponentDef,
  type CtcComponents,
  type CtcGroup,
} from "@/lib/hr/ctc/model";

const RED = "#E10600";
const RED_DEEP = "#A80400";

const GROUP_ORDER: CtcGroup[] = ["earning", "deduction", "employer"];
const GROUP_ACCENT: Record<CtcGroup, string> = {
  earning: "#0F766E",
  deduction: "#B45309",
  employer: "#4338CA",
};

/**
 * The structured CTC sheet: three grouped sections (earnings / deductions /
 * employer contributions), each row carrying a Monthly + Annual figure — the
 * native-periodicity column is an editable input, the other is derived live. A
 * "hide 0s" toggle drops empty rows; per-group subtotals and the full Gross → Net
 * → CTC ladder recompute on every keystroke. Presentational — state lives in the
 * workbench. Keyboard-first: Tab walks the amount inputs top-to-bottom.
 */
export function CtcSheet({
  components,
  onChange,
  onCommit,
  hideZeros,
  disabled,
}: {
  components: CtcComponents;
  onChange: (id: string, value: number) => void;
  onCommit: () => void;
  hideZeros: boolean;
  disabled?: boolean;
}) {
  const totals = useMemo(() => computeTotals(components), [components]);

  return (
    <div className="ctc-sheet">
      <style>{SHEET_CSS}</style>

      <div className="ctc-grid-head" aria-hidden>
        <span>Component</span>
        <span className="ctc-num">Monthly</span>
        <span className="ctc-num">Annual</span>
      </div>

      {GROUP_ORDER.map((group) => {
        const rows = CTC_COMPONENTS.filter((c) => c.group === group);
        const visible = rows.filter((c) => !hideZeros || num(components[c.id]) > 0);
        const sub = subtotal(group, components);
        return (
          <section key={group} className="ctc-group" style={{ ["--accent" as string]: GROUP_ACCENT[group] }}>
            <header className="ctc-group-head">
              <span className="ctc-group-dot" />
              <span className="ctc-group-name">{GROUP_LABELS[group]}</span>
            </header>

            {visible.length === 0 ? (
              <p className="ctc-empty">No {GROUP_LABELS[group].toLowerCase()} entered.</p>
            ) : (
              visible.map((def) => (
                <Row
                  key={def.id}
                  def={def}
                  value={num(components[def.id])}
                  onChange={(v) => onChange(def.id, v)}
                  onCommit={onCommit}
                  disabled={disabled}
                />
              ))
            )}

            <div className="ctc-subtotal">
              <span>Total {GROUP_LABELS[group]}</span>
              <span className="ctc-num">{formatINR(sub.monthly)}</span>
              <span className="ctc-num">{formatINR(sub.annual)}</span>
            </div>
          </section>
        );
      })}

      {/* ── Ladder: Gross → Net → CTC ─────────────────────────── */}
      <section className="ctc-ladder">
        <LadderRow label="Gross Salary" monthly={totals.grossMonthly} annual={totals.grossAnnual} />
        <LadderRow label="Less: Deductions" monthly={-totals.deductionsMonthly} annual={-totals.deductionsAnnual} muted />
        <LadderRow label="Net Take-Home" monthly={totals.netMonthly} annual={totals.netAnnual} strong />
        <LadderRow
          label="Add: Employer Contributions"
          monthly={totals.employerMonthly}
          annual={totals.employerAnnual}
          muted
        />
        <LadderRow label="Cost to Firm (CTC)" monthly={totals.ctcMonthly} annual={totals.ctcAnnual} hero />
      </section>
    </div>
  );
}

function subtotal(group: CtcGroup, components: CtcComponents): { monthly: number; annual: number } {
  let monthly = 0;
  for (const def of CTC_COMPONENTS) {
    if (def.group !== group) continue;
    monthly += monthlyOf(def, num(components[def.id]));
  }
  return { monthly, annual: monthly * 12 };
}

function Row({
  def,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  def: CtcComponentDef;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  const monthly = monthlyOf(def, value);
  const annual = annualOf(def, value);
  const nativeMonthly = def.periodicity === "monthly";

  const input = (
    <input
      type="text"
      inputMode="numeric"
      className="ctc-input"
      value={value ? String(value) : ""}
      placeholder="0"
      disabled={disabled}
      aria-label={`${def.label} (${def.periodicity})`}
      onChange={(e) => onChange(num(e.target.value))}
      onBlur={onCommit}
      onFocus={(e) => e.currentTarget.select()}
    />
  );

  return (
    <div className="ctc-row">
      <span className="ctc-row-label">
        {def.label}
        <span className="ctc-row-native">{nativeMonthly ? "/mo" : "/yr"}</span>
      </span>
      <span className="ctc-num ctc-cell">
        {nativeMonthly ? input : <span className="ctc-derived">{monthly ? formatINR(monthly) : "—"}</span>}
      </span>
      <span className="ctc-num ctc-cell">
        {nativeMonthly ? <span className="ctc-derived">{annual ? formatINR(annual) : "—"}</span> : input}
      </span>
    </div>
  );
}

function LadderRow({
  label,
  monthly,
  annual,
  muted,
  strong,
  hero,
}: {
  label: string;
  monthly: number;
  annual: number;
  muted?: boolean;
  strong?: boolean;
  hero?: boolean;
}) {
  const cls = hero ? "ctc-ladder-row ctc-ladder-hero" : strong ? "ctc-ladder-row ctc-ladder-strong" : muted ? "ctc-ladder-row ctc-ladder-muted" : "ctc-ladder-row";
  return (
    <div className={cls}>
      <span>{label}</span>
      <span className="ctc-num">{formatINR(monthly)}</span>
      <span className="ctc-num">{formatINR(annual)}</span>
    </div>
  );
}

const SHEET_CSS = `
.ctc-sheet{
  border:1px solid var(--color-hairline, #e2e8f0);
  border-radius:18px;background:#fff;overflow:hidden;
  box-shadow:0 24px 60px -40px rgba(15,23,42,.4);
}
.ctc-grid-head{
  display:grid;grid-template-columns:1fr 150px 150px;gap:8px;
  padding:12px 20px;align-items:center;
  background:linear-gradient(180deg, #fbfbfd, #f5f5f8);
  border-bottom:1px solid var(--color-hairline, #e2e8f0);
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.ctc-num{text-align:right;font-variant-numeric:tabular-nums;}
.ctc-group{padding:6px 0;border-bottom:1px solid var(--color-hairline, #eef0f4);}
.ctc-group-head{display:flex;align-items:center;gap:9px;padding:12px 20px 6px;}
.ctc-group-dot{width:9px;height:9px;border-radius:9999px;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);}
.ctc-group-name{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13px;font-weight:800;letter-spacing:.02em;color:var(--color-ink-strong, #0f172a);
}
.ctc-empty{padding:4px 20px 10px;font-size:13px;font-style:italic;color:var(--color-ink-muted, #94a3b8);margin:0;}
.ctc-row{
  display:grid;grid-template-columns:1fr 150px 150px;gap:8px;align-items:center;
  padding:5px 20px;transition:background .12s ease;
}
.ctc-row:hover{background:color-mix(in srgb, var(--accent) 5%, transparent);}
.ctc-row-label{
  display:flex;align-items:baseline;gap:8px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
}
.ctc-row-native{
  font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--color-ink-muted, #94a3b8);
  padding:1px 6px;border-radius:6px;background:var(--color-surface-soft, #f1f5f9);
}
.ctc-cell{display:flex;justify-content:flex-end;align-items:center;}
.ctc-derived{font-size:13.5px;font-weight:600;color:var(--color-ink-muted, #64748b);font-variant-numeric:tabular-nums;}
.ctc-input{
  width:130px;text-align:right;
  padding:7px 10px;border-radius:9px;
  font-size:14px;font-weight:700;color:var(--color-ink-strong, #0f172a);
  font-variant-numeric:tabular-nums;
  background:#fff;border:1.5px solid var(--color-hairline-strong, #cbd5e1);
  transition:border-color .12s ease, box-shadow .12s ease, background .12s ease;
}
.ctc-input::placeholder{color:#cbd5e1;font-weight:600;}
.ctc-input:hover:not(:disabled){border-color:var(--color-ink-muted, #94a3b8);}
.ctc-input:focus{outline:none;border-color:${RED};background:rgba(225,6,0,.04);box-shadow:0 0 0 3px rgba(225,6,0,.13);}
.ctc-input:disabled{background:var(--color-surface-soft, #f8fafc);color:var(--color-ink-muted, #94a3b8);}
.ctc-subtotal{
  display:grid;grid-template-columns:1fr 150px 150px;gap:8px;align-items:center;
  padding:9px 20px;margin-top:2px;
  border-top:1px dashed var(--color-hairline-strong, #d7dce4);
  font-size:13px;font-weight:800;color:var(--accent);
  font-variant-numeric:tabular-nums;
}
/* Ladder */
.ctc-ladder{padding:10px 8px 12px;background:linear-gradient(180deg, #fbfbfd, #f6f6f9);}
.ctc-ladder-row{
  display:grid;grid-template-columns:1fr 150px 150px;gap:8px;align-items:center;
  padding:8px 12px;border-radius:10px;
  font-size:14px;font-weight:700;color:var(--color-ink-strong, #0f172a);
  font-variant-numeric:tabular-nums;
}
.ctc-ladder-muted{color:var(--color-ink-muted, #64748b);font-weight:600;font-size:13.5px;}
.ctc-ladder-strong{background:#fff;border:1px solid var(--color-hairline, #e2e8f0);font-weight:800;}
.ctc-ladder-hero{
  margin-top:6px;padding:14px 16px;
  background:linear-gradient(120deg, ${RED}, ${RED_DEEP});color:#fff;
  font-size:16px;font-weight:900;letter-spacing:.01em;
  box-shadow:0 16px 34px -18px rgba(168,4,0,.85);
}
.ctc-ladder-hero .ctc-num{color:#fff;}
@media (max-width:640px){
  .ctc-grid-head,.ctc-row,.ctc-subtotal,.ctc-ladder-row{grid-template-columns:1fr 96px 96px;}
  .ctc-input{width:88px;padding:6px 8px;font-size:13px;}
}
`;

export default CtcSheet;
