"use client";
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { cn } from "@/lib/utils";
import { focusNextFrom } from "@/lib/focus-next";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Show the search box. Defaults to auto (on when >8 options). */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  /** Forwarded to the trigger button (e.g. FieldShell focus-glow handlers). */
  onFocus?: () => void;
  onBlur?: () => void;
  /** Extra classes on the trigger button. */
  className?: string;
  /** Drop the default trigger look (border/bg/height) so `className` fully
   *  drives it — used to match the `.nt-input` fields in the New Task form. */
  unstyled?: boolean;
  /** Extra classes on the dropdown panel. */
  contentClassName?: string;
  ariaLabel?: string;
}

/**
 * Modern single-select. A polished, fully-styled replacement for native
 * `<select>` — built on the app's Popover + cmdk (same primitives as
 * MultiSelect) so it gets keyboard nav, optional type-ahead search, portalled
 * positioning, and the house visual language (hairline border, red focus ring,
 * soft shadow, check-on-selected). Controlled: pair with RHF `Controller`.
 */
export function Select({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchable,
  searchPlaceholder = "Search…",
  disabled,
  unstyled,
  id,
  onFocus,
  onBlur,
  className,
  contentClassName,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);
  const showSearch = searchable ?? options.length > 8;

  // cmdk auto-highlights the first item on every query change, so Tab must only
  // commit when the user has deliberately arrow-navigated — otherwise Tabbing
  // out silently commits the first filtered option. Reset whenever the popover
  // (re)opens; set on ArrowUp/ArrowDown inside the Command.
  const userNavigated = React.useRef(false);
  React.useEffect(() => {
    if (open) userNavigated.current = false;
  }, [open]);

  // Tab commits the highlighted option (cmdk only commits on Enter / click) and
  // moves on to the next field — so the whole form is keyboard-navigable.
  function onCommandKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      userNavigated.current = true;
      return;
    }
    // Typing changes the query → cmdk re-auto-highlights, so navigation intent
    // is no longer current. Reset (but don't treat Tab/Enter as typing).
    if (e.key !== "Tab" && e.key !== "Enter") {
      if (e.key === "Backspace" || e.key === "Delete" || e.key.length === 1) {
        userNavigated.current = false;
      }
      return;
    }
    if (e.key !== "Tab") return;
    if (!userNavigated.current) {
      // No deliberate navigation: close without committing the auto-highlight.
      setOpen(false);
      return;
    }
    const active = e.currentTarget.querySelector<HTMLElement>(
      '[cmdk-item][aria-selected="true"]',
    );
    if (!active) {
      setOpen(false);
      return;
    }
    e.preventDefault();
    active.click(); // commits via onSelect (which also closes the popover)
    requestAnimationFrame(() => focusNextFrom(triggerRef.current, e.shiftKey ? -1 : 1));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            unstyled
              ? "flex w-full items-center justify-between gap-2 text-left outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              : cn(
                  "flex w-full items-center gap-2 h-11 px-3.5 rounded-chip border border-hairline bg-surface-card text-[15px] text-left text-ink-strong outline-none transition-all",
                  "hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/25",
                  "data-[state=open]:border-altus-red data-[state=open]:ring-2 data-[state=open]:ring-altus-red/25",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ),
            className,
          )}
        >
          <span className={cn("flex-1 truncate", !selected && "text-ink-subtle")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            className={cn(
              "shrink-0 text-ink-subtle transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        // Closing must NOT restore focus to the trigger: that fights the
        // browser's Tab (focus can't advance after a commit) and, for triggers
        // that open-on-focus, would re-fire onFocus → reopen loop. Keyboard-
        // first teams Tab through these constantly.
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "p-0 w-[var(--radix-popover-trigger-width)] min-w-[12rem]",
          contentClassName,
        )}
      >
        <Command onKeyDown={onCommandKeyDown}>
          {showSearch ? (
            <CommandInput placeholder={searchPlaceholder} />
          ) : (
            // Short lists don't show a search box, but cmdk still needs a
            // focused input for arrow-key nav + Tab-to-commit + typeahead.
            <CommandInput className="sr-only" aria-label="Filter options" placeholder="" />
          )}
          <CommandList className="max-h-[22rem] overflow-auto">
            <CommandEmpty className="px-3 py-3 text-[15px] text-ink-subtle">
              No results.
            </CommandEmpty>
            {options.map((opt) => {
              const isSel = opt.value === value;
              return (
                <CommandItem
                  // cmdk filters on `value` — use the label so type-ahead
                  // matches what the user reads; the NUL keeps it unique.
                  key={opt.value}
                  value={`${opt.label}${opt.value}`}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  aria-selected={isSel || undefined}
                  className={cn("rounded-md", isSel && "font-bold")}
                  // The CHOSEN value stays clearly marked (persistent red-tint +
                  // red-deep bold label + check) so it's obvious which is picked.
                  style={
                    isSel
                      ? { background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)" }
                      : undefined
                  }
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      {isSel && (
                        <Check size={16} strokeWidth={3} className="text-altus-red" />
                      )}
                    </span>
                    <span className={cn("flex-1", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {opt.label}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
