"use client";

import * as React from "react";
import { Check, Plus, X, ChevronDown, Search } from "lucide-react";
import { quickAddSubject } from "@/app/(app)/tasks/actions";

interface Props {
  /** Currently selected subject name (tasks.subject). */
  value: string;
  onChange: (name: string) => void;
  /** Seed list from the server, alphabetical. */
  subjects: string[];
  id?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * "Subject" picker — a fully-styled searchable combobox (NOT a native
 * <select>, whose OS option list can't be themed). Type to filter, ↑/↓ +
 * Enter to pick, and a "+ Add new subject…" row that flips into an inline add
 * input. Keyboard-first; mouse works too. Mirrors ClientSelect.
 */
export function SubjectSelect({
  value,
  onChange,
  subjects,
  id,
  required,
  className,
  placeholder = "Select a subject…",
  onFocus,
  onBlur,
}: Props) {
  const [options, setOptions] = React.useState<string[]>(subjects);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const addInputRef = React.useRef<HTMLInputElement>(null);

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => setOptions(subjects), [subjects]);
  React.useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  const sorted = React.useMemo(() => {
    const set = new Set(options);
    if (value && !set.has(value)) set.add(value);
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [options, value]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => c.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setHi(0);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    setHi((h) => Math.min(h, filtered.length));
  }, [filtered.length]);
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function startAdd() {
    setOpen(false);
    setError(null);
    setDraft(query.trim());
    setAdding(true);
  }
  function cancelAdd() {
    setAdding(false);
    setDraft("");
    setError(null);
  }
  async function saveAdd() {
    const name = draft.trim();
    if (!name) {
      setError("Enter a subject name.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await quickAddSubject(name);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOptions((prev) =>
      prev.some((c) => c.toLowerCase() === res.name.toLowerCase()) ? prev : [...prev, res.name],
    );
    onChange(res.name);
    setAdding(false);
    setDraft("");
  }

  function searchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi === filtered.length) startAdd();
      else if (filtered[hi]) choose(filtered[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function triggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setOpen(true);
      setQuery(e.key);
    }
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={draft}
            maxLength={120}
            placeholder="New subject name"
            className={className}
            disabled={saving}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveAdd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelAdd();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void saveAdd()}
            disabled={saving}
            aria-label="Save new subject"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-strong transition-colors hover:bg-surface-muted disabled:opacity-50"
            style={{ width: 46, height: 46 }}
          >
            <Check size={18} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={saving}
            aria-label="Cancel"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-50"
            style={{ width: 46, height: 46 }}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error && (
          <p className="text-[13px]" style={{ color: "rgb(168, 4, 0)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={triggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={(className ? className + " " : "") + "flex items-center justify-between gap-2 text-left cursor-pointer"}
      >
        <span
          style={{
            color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
            fontWeight: value ? 600 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value || placeholder}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2.4}
          className="shrink-0 transition-transform"
          style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={() => {}}
          required
          style={{ position: "absolute", opacity: 0, height: 1, width: 1, left: 18, bottom: 4 }}
        />
      )}

      {open && (
        <div
          className="absolute left-0 right-0 mt-2 z-50 rounded-chip border bg-surface-card overflow-hidden"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 20px 50px -12px rgba(15, 23, 42, 0.28), 0 4px 12px rgba(15, 23, 42, 0.10)",
          }}
        >
          <div className="p-2.5" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
            <div
              className="flex items-center gap-2 rounded-lg px-3"
              style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
            >
              <Search size={16} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHi(0);
                }}
                onKeyDown={searchKeyDown}
                placeholder="Search subjects…"
                className="w-full bg-transparent outline-none py-2.5"
                style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)" }}
              />
            </div>
          </div>
          <ul ref={listRef} role="listbox" className="max-h-[300px] overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                No match for “{query}”.
              </li>
            )}
            {filtered.map((name, i) => {
              const isSel = name === value;
              const isHi = i === hi;
              return (
                <li
                  key={name}
                  role="option"
                  aria-selected={isSel}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(name)}
                  className="flex items-center justify-between gap-3 mx-1.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{ background: isHi ? "var(--color-surface-soft)" : "transparent" }}
                >
                  <span className="font-semibold truncate" style={{ fontSize: 15, color: "var(--color-ink-strong)" }}>
                    {name}
                  </span>
                  {isSel && <Check size={17} strokeWidth={2.6} style={{ color: "rgb(var(--vp-cyan-deep))" }} />}
                </li>
              );
            })}
            <li
              role="option"
              aria-selected={hi === filtered.length}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(filtered.length)}
              onClick={() => startAdd()}
              className="flex items-center gap-2 mx-1.5 mt-1 px-3 py-2.5 rounded-lg cursor-pointer font-bold transition-colors"
              style={{
                background: hi === filtered.length ? "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" : "transparent",
                color: "var(--color-altus-red-deep)",
                borderTop: "1px solid var(--color-hairline)",
                fontSize: 15,
              }}
            >
              <Plus size={16} strokeWidth={2.6} />
              Add new subject…
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
