"use client";

import { Check, CircleCheck } from "lucide-react";

const RED = "#E10600";
const RED_SOFT = "color-mix(in srgb, #E10600 9%, white)";
const GREEN = "#16a34a";

type StepStatus = "active" | "done" | "error" | "idle";

export function IntakeRail({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: { label: string; status: StepStatus }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const lastIndex = steps.length - 1;

  return (
    <>
      {/* ── Desktop vertical rail ── */}
      <nav
        aria-label="Form sections"
        className="flex h-full w-[280px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-white px-4 py-6 max-md:hidden"
      >
        <div className="px-2 pb-5">
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Registration
          </h2>
          <p className="mt-1 text-[13px] font-medium text-ink-muted">
            {steps.length} Stages to Completion
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          {steps.map((s, i) => {
            const isLast = i === lastIndex;
            const isActive = i === activeIndex;
            return (
              <div key={i}>
                {isLast && <div className="my-1.5 border-t border-hairline" />}
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={isActive ? "step" : undefined}
                  className="group flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[#faf9fb]"
                  style={s.status === "active" ? { background: RED_SOFT } : undefined}
                >
                  <RailChip status={s.status} index={i} isLast={isLast} />
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      isLast ? "text-[14px] font-bold" : "text-[14px] font-semibold"
                    } ${
                      s.status === "active" || s.status === "error"
                        ? "text-altus-red-deep"
                        : "text-ink-strong"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile horizontal progress strip ── */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-hairline bg-white px-4 py-3">
          {steps.map((s, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s.label}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 transition-colors"
                style={isActive ? { background: RED_SOFT } : undefined}
              >
                <RailDot status={s.status} index={i} isLast={i === lastIndex} />
                {isActive && (
                  <span className="max-w-[120px] truncate text-[12px] font-bold text-altus-red-deep">
                    {s.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function chipBg(status: StepStatus): string {
  if (status === "done") return GREEN;
  if (status === "error" || status === "active") return RED;
  return "var(--color-hairline)";
}

function RailChip({
  status,
  index,
  isLast,
}: {
  status: StepStatus;
  index: number;
  isLast: boolean;
}) {
  const idle = status === "idle";
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{ background: chipBg(status), color: idle ? "var(--color-ink-subtle)" : "#fff" }}
    >
      {status === "done" ? (
        <Check size={14} strokeWidth={3} />
      ) : status === "error" ? (
        <span className="text-[13px] font-black leading-none">!</span>
      ) : isLast ? (
        <CircleCheck size={15} />
      ) : (
        <span className="text-[12px] font-bold leading-none">{index + 1}</span>
      )}
    </span>
  );
}

function RailDot({
  status,
  index,
  isLast,
}: {
  status: StepStatus;
  index: number;
  isLast: boolean;
}) {
  const idle = status === "idle";
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{ background: chipBg(status), color: idle ? "var(--color-ink-subtle)" : "#fff" }}
    >
      {status === "done" ? (
        <Check size={13} strokeWidth={3} />
      ) : status === "error" ? (
        <span className="text-[12px] font-black leading-none">!</span>
      ) : isLast ? (
        <CircleCheck size={14} />
      ) : (
        <span className="text-[11px] font-bold leading-none">{index + 1}</span>
      )}
    </span>
  );
}
