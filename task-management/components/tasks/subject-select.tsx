"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { quickAddSubject } from "@/app/(app)/tasks/actions";

const ADD_NEW = "__add_new_subject__";

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
 * "Subject" picker. A native select over the shared subject roster plus a
 * "+ Add new subject…" option that flips the control into an inline text
 * input. Saving persists the name (quickAddSubject) so it's there next
 * time, then selects it. Mirrors ClientSelect.
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
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setOptions(subjects);
  }, [subjects]);

  React.useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const sorted = React.useMemo(() => {
    const set = new Set(options);
    if (value && !set.has(value)) set.add(value);
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [options, value]);

  function startAdd() {
    setError(null);
    setDraft("");
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
      prev.some((c) => c.toLowerCase() === res.name.toLowerCase())
        ? prev
        : [...prev, res.name],
    );
    onChange(res.name);
    setAdding(false);
    setDraft("");
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={80}
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
            style={{ width: 42, height: 42 }}
          >
            <Check size={18} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={saving}
            aria-label="Cancel"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-50"
            style={{ width: 42, height: 42 }}
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
    <select
      id={id}
      required={required}
      value={value}
      className={className}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) {
          startAdd();
          return;
        }
        onChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {sorted.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value={ADD_NEW}>+ Add New Subject…</option>
    </select>
  );
}
