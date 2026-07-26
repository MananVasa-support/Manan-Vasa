"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * Self-contained floating-label field kit for the Exit forms. Mirrors the
 * Candidate Interview Form's premium `.iwf-*` / `.iwc-*` visual language, but
 * ships its OWN CSS (injected by <ExitStyle/>) so the Exit workspace does not
 * depend on the intake wizard being mounted. Pure CSS motion (no framer-motion),
 * reduced-motion respected, fully keyboard-navigable.
 */

const RED = "var(--color-altus-red)";

// One <style> block, injected once at the workspace root.
export const EXIT_CSS = `
@keyframes exStepIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ex-step { animation: exStepIn 0.28s cubic-bezier(0.22,1,0.36,1) both; }

/* ── Floating-label outlined fields ── */
.iwf { position: relative; --iwf-bd: color-mix(in srgb, var(--color-altus-red) 15%, var(--color-hairline)); }
.iwf-control {
  width: 100%;
  min-height: 58px;
  border: 2px solid var(--iwf-bd);
  border-radius: 14px;
  background: #fff;
  padding: 16px 15px;
  font-size: 15.5px;
  line-height: 1.35;
  color: var(--color-ink-strong);
  outline: none;
  transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
}
.iwf-control::placeholder { color: transparent; }
.iwf.is-float .iwf-control::placeholder { color: var(--color-ink-subtle); opacity: 1; }
.iwf-control:hover { border-color: color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline)); }
.iwf-control:focus {
  border-color: var(--color-altus-red);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-altus-red) 13%, transparent);
}
.iwf--area .iwf-control { min-height: 108px; padding-top: 26px; resize: vertical; line-height: 1.55; }
.iwf select.iwf-control { -webkit-appearance: none; appearance: none; cursor: pointer; padding-right: 42px; }

.iwf-label {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  transform-origin: left center;
  padding: 0 6px;
  max-width: calc(100% - 26px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--color-ink-muted);
  font-size: 15.5px;
  font-weight: 500;
  pointer-events: none;
  background: transparent;
  transition: transform .2s cubic-bezier(.22,1,.36,1), color .18s ease, font-size .18s ease;
}
.iwf--area .iwf-label { top: 0; transform: translateY(25px); }
.iwf.is-float .iwf-label {
  top: 0;
  transform: translateY(-10px) scale(.82);
  color: var(--color-altus-red-deep);
  font-weight: 700;
  background: #fff;
}
.iwf-req { color: var(--color-altus-red); margin-left: 2px; }
.iwf-caret { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: var(--color-ink-soft); pointer-events: none; }

/* ── Inline chip radiogroup ── */
.iwc { position: relative; }
.iwc-legend { display: block; font-size: 13px; font-weight: 700; letter-spacing: .01em; color: var(--color-ink-muted); margin-bottom: 9px; }
.iwc-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.iwc-chip {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13.5px; font-weight: 700;
  border: 1.5px solid var(--color-hairline);
  background: #fff; color: var(--color-ink-soft);
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .12s ease;
}
.iwc-chip:hover { border-color: color-mix(in srgb, var(--color-altus-red) 42%, var(--color-hairline)); color: var(--color-ink-strong); }
.iwc-chip.is-on { background: var(--color-altus-red); border-color: var(--color-altus-red); color: #fff; box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--color-altus-red) 85%, transparent); }
.iwc-chip:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 32%, transparent); }
.iwc-chip:active { transform: translateY(1px); }

/* ── Rating matrix (1..5 radio grid) ── */
.exm { border: 1.5px solid var(--color-hairline); border-radius: 16px; overflow: hidden; background: #fff; }
.exm-head, .exm-row { display: grid; grid-template-columns: minmax(180px, 1.6fr) repeat(5, minmax(52px, 1fr)); align-items: stretch; }
.exm-head { background: color-mix(in srgb, var(--color-altus-red) 6%, #fff); border-bottom: 1.5px solid var(--color-hairline); }
.exm-head > div { padding: 11px 12px; font-size: 12px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; color: var(--color-altus-red-deep); text-align: center; }
.exm-head > div:first-child { text-align: left; }
.exm-row { border-bottom: 1px solid var(--color-hairline); }
.exm-row:last-child { border-bottom: 0; }
.exm-row:nth-child(odd) { background: color-mix(in srgb, var(--color-altus-red) 2%, #fff); }
.exm-aspect { padding: 13px 14px; font-size: 14px; font-weight: 600; color: var(--color-ink-strong); display: flex; align-items: center; }
.exm-cell { display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--color-hairline); padding: 8px; }
.exm-dot {
  width: 30px; height: 30px; border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--color-altus-red) 26%, var(--color-hairline));
  background: #fff; cursor: pointer;
  display: grid; place-items: center;
  font-size: 12.5px; font-weight: 800; color: var(--color-ink-soft);
  transition: background-color .14s ease, border-color .14s ease, color .14s ease, transform .12s ease, box-shadow .14s ease;
}
.exm-dot:hover { border-color: var(--color-altus-red); color: var(--color-altus-red-deep); }
.exm-dot.is-on { background: var(--color-altus-red); border-color: var(--color-altus-red); color: #fff; box-shadow: 0 8px 16px -9px color-mix(in srgb, var(--color-altus-red) 85%, transparent); transform: scale(1.06); }
.exm-dot:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 32%, transparent); }

/* ── Checkbox line item ── */
.exchk {
  display: flex; align-items: flex-start; gap: 11px;
  width: 100%; text-align: left;
  padding: 11px 13px; border-radius: 12px;
  border: 1.5px solid var(--color-hairline); background: #fff;
  cursor: pointer; color: var(--color-ink-strong);
  transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
}
.exchk:hover { border-color: color-mix(in srgb, var(--color-altus-red) 40%, var(--color-hairline)); }
.exchk:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-altus-red) 26%, transparent); }
.exchk.is-on { border-color: var(--color-altus-red); background: color-mix(in srgb, var(--color-altus-red) 5%, #fff); }
.exchk-box {
  flex: none; width: 22px; height: 22px; margin-top: 1px;
  border-radius: 7px; border: 2px solid color-mix(in srgb, var(--color-altus-red) 30%, var(--color-hairline));
  background: #fff; display: grid; place-items: center; color: #fff;
  transition: background-color .14s ease, border-color .14s ease;
}
.exchk.is-on .exchk-box { background: var(--color-altus-red); border-color: var(--color-altus-red); }
.exchk-label { font-size: 14.5px; font-weight: 600; line-height: 1.4; }

@media (max-width: 720px) {
  .exm-head, .exm-row { grid-template-columns: 1fr repeat(5, 44px); }
  .exm-head > div { font-size: 10px; padding: 8px 4px; }
  .exm-aspect { font-size: 13px; padding: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .ex-step { animation: none !important; }
  .iwf-label, .iwf-control, .iwc-chip, .exm-dot, .exchk, .exchk-box { transition: none !important; }
}
`;

export function ExitStyle() {
  return <style dangerouslySetInnerHTML={{ __html: EXIT_CSS }} />;
}

// ── Floating input / textarea ──

export function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "tel" | "email";
  autoFocus?: boolean;
  required?: boolean;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const alwaysFloat = type === "date";
  const float = alwaysFloat || focused || (value ?? "").trim() !== "";
  return (
    <div className={`iwf${float ? " is-float" : ""}`}>
      <input
        id={id}
        type={type}
        value={value}
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        placeholder=" "
        maxLength={500}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      <label htmlFor={id} className="iwf-label">
        {label}
        {required && <span className="iwf-req" aria-hidden>*</span>}
      </label>
    </div>
  );
}

export function FloatingTextarea({
  label,
  value,
  onChange,
  autoFocus,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  rows?: number;
}) {
  const id = React.useId();
  const [focused, setFocused] = React.useState(false);
  const float = focused || (value ?? "").trim() !== "";
  return (
    <div className={`iwf iwf--area${float ? " is-float" : ""}`}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={4000}
        data-autofocus={autoFocus || undefined}
        className="iwf-control"
        placeholder=" "
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      <label htmlFor={id} className="iwf-label">
        {label}
      </label>
    </div>
  );
}

// ── Chip radiogroup (Yes/No, Excellent/Good/…) ──

export function ChipGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend?: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = options.indexOf(value);

  function focusAndSelect(i: number) {
    const n = options.length;
    if (n === 0) return;
    const idx = ((i % n) + n) % n;
    const opt = options[idx];
    if (opt != null) onChange(opt);
    btnRefs.current[idx]?.focus();
  }
  function onKey(e: React.KeyboardEvent, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="iwc" role="radiogroup" aria-label={legend}>
      {legend && <span className="iwc-legend">{legend}</span>}
      <div className="iwc-opts">
        {options.map((o, i) => {
          const on = value === o;
          const isStop = on || (selectedIdx === -1 && i === 0);
          return (
            <button
              key={o}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={isStop ? 0 : -1}
              onClick={() => onChange(on ? "" : o)}
              onKeyDown={(e) => onKey(e, i)}
              className={`iwc-chip${on ? " is-on" : ""}`}
            >
              {on && <Check size={13} strokeWidth={3} aria-hidden />}
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 1..5 rating matrix (accessible radio grid) ──

export function RatingMatrix({
  aspects,
  legend,
  values,
  onChange,
}: {
  aspects: { id: string; label: string }[];
  legend: string[];
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
}) {
  const scores = [1, 2, 3, 4, 5];
  const dotRefs = React.useRef<Record<string, (HTMLButtonElement | null)[]>>({});

  function focusAndSet(aspectId: string, score: number) {
    const s = Math.max(1, Math.min(5, score));
    onChange(aspectId, s);
    dotRefs.current[aspectId]?.[s - 1]?.focus();
  }

  return (
    <div className="exm" role="group" aria-label="Rate each aspect from 1 (Poor) to 5 (Excellent)">
      <div className="exm-head" aria-hidden>
        <div>Aspect</div>
        {legend.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      {aspects.map((a) => {
        const cur = values[a.id] ?? 0;
        dotRefs.current[a.id] = dotRefs.current[a.id] ?? [];
        return (
          <div className="exm-row" key={a.id} role="radiogroup" aria-label={a.label}>
            <div className="exm-aspect">{a.label}</div>
            {scores.map((s, i) => {
              const on = cur === s;
              const isStop = on || (cur === 0 && s === 1);
              return (
                <div className="exm-cell" key={s}>
                  <button
                    ref={(el) => {
                      (dotRefs.current[a.id] ??= [])[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${a.label}: ${s} of 5`}
                    tabIndex={isStop ? 0 : -1}
                    className={`exm-dot${on ? " is-on" : ""}`}
                    onClick={() => onChange(a.id, on ? 0 : s)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        focusAndSet(a.id, (cur || 0) + 1);
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        focusAndSet(a.id, (cur || 1) - 1 || 1);
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        focusAndSet(a.id, 1);
                      } else if (e.key === "End") {
                        e.preventDefault();
                        focusAndSet(a.id, 5);
                      }
                    }}
                  >
                    {s}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Checkbox line item ──

export function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`exchk${checked ? " is-on" : ""}`}
    >
      <span className="exchk-box" aria-hidden>
        {checked && <Check size={14} strokeWidth={3.4} />}
      </span>
      <span className="exchk-label">{label}</span>
    </button>
  );
}

export { RED as EXIT_RED };
