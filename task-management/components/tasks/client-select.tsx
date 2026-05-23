"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { quickAddClient } from "@/app/(app)/tasks/actions";

const ADD_NEW = "__add_new_client__";

interface Props {
  /** Currently selected client name (the task title). */
  value: string;
  onChange: (name: string) => void;
  /** Seed list from the server, alphabetical. */
  clients: string[];
  id?: string;
  required?: boolean;
  /** Class applied to the underlying <select>/<input> so the control
   *  matches each form's field styling (nt-input vs the edit form's box). */
  className?: string;
  placeholder?: string;
  /** Forwarded to the control — used by the edit form's FieldShell to
   *  drive its focus underline. */
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * "Client Name" picker. A native select over the shared client roster
 * plus a "+ Add new client…" option that flips the control into an inline
 * text input. Saving persists the name (createClient) so it's there next
 * time, then selects it. Sorting is case-insensitive alphabetical.
 */
export function ClientSelect({
  value,
  onChange,
  clients,
  id,
  required,
  className,
  placeholder = "Select a client…",
  onFocus,
  onBlur,
}: Props) {
  // Local copy so a freshly-added name appears immediately without a reload.
  const [options, setOptions] = React.useState<string[]>(clients);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setOptions(clients);
  }, [clients]);

  React.useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const sorted = React.useMemo(() => {
    const set = new Set(options);
    // A task being edited may carry a legacy free-text client not in the
    // roster — surface it so the select can show the current value.
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
      setError("Enter a client name.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await quickAddClient(name);
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
            maxLength={120}
            placeholder="New client name"
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
            aria-label="Save new client"
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
      <option value={ADD_NEW}>+ Add new client…</option>
    </select>
  );
}
