"use client";

import * as React from "react";
import { Plus, Check, X, Loader2, ChevronDown, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addGoalLookup, removeGoalLookup } from "@/app/(app)/goals/cascade/actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * A managed dropdown for the goal composer/table's Area · Measure · Type fields.
 * Lists base + admin-added options; ADMINS can inline-add a new option (persists
 * via addGoalLookup) AND delete an admin-added one (removeGoalLookup) — base
 * options are never deletable. mig 0148.
 */
export function GoalLookupSelect({
  kind,
  noun,
  value,
  onChange,
  options,
  custom,
  isAdmin,
  placeholder,
  className,
  compact,
}: {
  kind: "area" | "measure" | "type";
  noun: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** The admin-added (deletable) values for this kind. */
  custom: string[];
  isAdmin: boolean;
  placeholder?: string;
  className?: string;
  /** Tighter trigger for dense table cells. */
  compact?: boolean;
}) {
  const [opts, setOpts] = React.useState<string[]>(options);
  const [deletable, setDeletable] = React.useState<string[]>(custom);
  React.useEffect(() => setOpts(options), [options]);
  React.useEffect(() => setDeletable(custom), [custom]);

  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const deletableSet = React.useMemo(() => new Set(deletable.map((d) => d.toLowerCase())), [deletable]);

  React.useEffect(() => {
    if (adding) requestAnimationFrame(() => inputRef.current?.focus());
  }, [adding]);

  async function commitAdd() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    const res = await addGoalLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    applyOptions(res.options);
    const list = pickList(res.options);
    const match = list.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
    onChange(match);
    setDraft("");
    setAdding(false);
    fireToast({ message: `Added ${noun} "${match}"`, type: "success" });
  }

  async function remove(v: string) {
    if (busy) return;
    setBusy(true);
    const res = await removeGoalLookup({ kind, value: v });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    applyOptions(res.options);
    if (value.toLowerCase() === v.toLowerCase()) onChange("");
    fireToast({ message: `Removed ${noun} "${v}"`, type: "success" });
  }

  function pickList(o: import("@/lib/goals/lookups").GoalLookupOptions): string[] {
    return kind === "area" ? o.areas : kind === "measure" ? o.measures : o.types;
  }
  function applyOptions(o: import("@/lib/goals/lookups").GoalLookupOptions) {
    setOpts(pickList(o));
    setDeletable(kind === "area" ? o.custom.areas : kind === "measure" ? o.custom.measures : o.custom.types);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border bg-white text-left text-ink-strong transition-colors focus:border-altus-red",
            compact ? "h-9 px-2.5 text-[13px]" : "h-10 px-2.5 text-[14px] font-semibold",
            FOCUS_RING,
            className,
          )}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <span className={cn("truncate", !value && "text-ink-subtle font-normal")}>
            {value || placeholder || `Choose a ${noun}`}
          </span>
          <ChevronDown size={15} className="shrink-0 text-ink-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-[12rem] rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <div className="max-h-72 overflow-auto">
          {opts.map((o) => {
            const isSel = o.toLowerCase() === value.toLowerCase();
            const canDelete = isAdmin && deletableSet.has(o.toLowerCase());
            return (
              <div
                key={o}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  isSel ? "" : "hover:bg-black/[0.04]",
                )}
                style={isSel ? { background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {isSel && <Check size={15} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("flex-1 truncate text-[14px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {o}
                  </span>
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(o)}
                    disabled={busy}
                    aria-label={`Remove ${noun} "${o}"`}
                    title={`Remove "${o}"`}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle opacity-0 transition-all hover:bg-altus-red/10 hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            );
          })}
          {opts.length === 0 && (
            <p className="px-3 py-4 text-center text-[13px] text-ink-subtle">No options yet.</p>
          )}
        </div>

        {isAdmin && (
          <div className="mt-1.5 border-t border-hairline pt-1.5">
            {adding ? (
              <div className="flex items-center gap-1.5 px-1">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void commitAdd(); }
                    else if (e.key === "Escape") { setAdding(false); setDraft(""); }
                  }}
                  maxLength={60}
                  placeholder={`New ${noun}…`}
                  className={cn("h-9 flex-1 rounded-md border bg-white px-2.5 text-[13.5px] font-semibold text-ink-strong focus:border-altus-red", FOCUS_RING)}
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                />
                <button
                  type="button"
                  onClick={() => void commitAdd()}
                  disabled={busy || !draft.trim()}
                  aria-label={`Save new ${noun}`}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-white disabled:opacity-50"
                  style={{ background: "var(--color-altus-red)" }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setDraft(""); }}
                  aria-label="Cancel"
                  className="grid size-9 shrink-0 place-items-center rounded-md border bg-white text-ink-subtle hover:text-ink-strong"
                  style={{ borderColor: "var(--color-hairline-strong)" }}
                >
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-bold text-altus-red transition-colors hover:bg-altus-red/[0.06]"
              >
                <Plus size={15} strokeWidth={2.8} /> Add {noun}
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
