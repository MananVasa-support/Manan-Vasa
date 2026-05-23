"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ImagePlus, Link2, Plus, X, FileImage, Check } from "lucide-react";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  TASK_SUBJECTS,
  type TaskPriority,
  type TaskRecurrence,
} from "@/db/enums";
import { createTask } from "@/app/(app)/tasks/actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ScheduleSection, type ScheduleValue } from "./schedule-section";
import { ClientSelect } from "./client-select";

type EmployeeOption = { id: string; name: string };

interface Props {
  employees: EmployeeOption[];
  /** Client roster for the "Client Name" picker, alphabetical. */
  clients: string[];
  /** Called after a successful create. Default: navigate to /tasks/[id]. */
  onSuccess?: (taskId: string) => void;
  /** Optional defaults for the form (used by the canonical route). */
  defaults?: {
    doerId?: string;
    initiatorId?: string;
    priority?: TaskPriority;
  };
}

const DEFAULT_PRIORITY: TaskPriority = "not_imp_not_urgent";
const MEDIA_SLOT_COUNT = 4;

// Media slots are UI-only for now — files live in component state and
// aren't uploaded anywhere. The Links section is wired: URLs get
// appended to the `notes` payload on submit ("Links:\n- ..."), so they
// survive into the task record without needing a new column.
interface PreviewFile {
  file: File;
  url: string;
}

export function NewTaskForm({ employees, clients, onSuccess, defaults }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [title, setTitle] = React.useState("");
  const [description, setDesc] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [doerIds, setDoerIds] = React.useState<string[]>(
    defaults?.doerId ? [defaults.doerId] : [],
  );
  const [initiatorId, setInit] = React.useState(defaults?.initiatorId ?? "");
  const [priority, setPriority] = React.useState<TaskPriority>(
    defaults?.priority ?? DEFAULT_PRIORITY,
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [schedule, setSchedule] = React.useState<ScheduleValue>({
    startsAt: null,
    endsAt: null,
    allDay: false,
    recurrence: null,
  });
  // Default due: 7 days out.
  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [dueAt, setDueAt] = React.useState(
    sevenDays.toISOString().slice(0, 10),
  );

  const [media, setMedia] = React.useState<PreviewFile[]>([]);
  const [linkInput, setLinkInput] = React.useState("");
  const [links, setLinks] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Release object-URLs the moment the dialog tears down so we don't
  // leak blobs into the document for the rest of the session.
  React.useEffect(() => {
    return () => {
      media.forEach((m) => URL.revokeObjectURL(m.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MEDIA_SLOT_COUNT - media.length;
    if (remaining <= 0) return;
    const next: PreviewFile[] = [];
    for (let i = 0; i < files.length && next.length < remaining; i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) continue;
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setMedia((prev) => [...prev, ...next]);
  }

  function removeMedia(idx: number) {
    setMedia((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addLink() {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    if (links.includes(trimmed)) {
      setLinkInput("");
      return;
    }
    setLinks((prev) => [...prev, trimmed]);
    setLinkInput("");
  }

  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (doerIds.length === 0 || !initiatorId) {
      setError("Pick at least one Doer and an Initiator.");
      return;
    }
    // The <input type="date"> gives YYYY-MM-DD; convert to ISO at noon UTC
    // so timezone wrap-arounds don't push the due into the wrong day.
    const dueIso = new Date(`${dueAt}T12:00:00.000Z`).toISOString();

    // Stamp link URLs onto the notes payload — they survive into the
    // task record so the team can click through later. Media files are
    // UI-only for now (blob backend not wired yet).
    const linksBlock =
      links.length > 0
        ? `\n\nLinks:\n${links.map((l) => `- ${l}`).join("\n")}`
        : "";
    const composedNotes = (notes + linksBlock).trim() || null;

    // Commit any pending tag text the user hasn't pressed Enter on yet.
    const pendingTag = tagInput.trim();
    const finalTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    startTransition(async () => {
      const result = await createTask({
        title,
        doerIds,                      // multi-doer fanout — N tasks if N doers
        initiatorId,
        priority,
        dueAt: dueIso,
        description: description || null,
        subject: subject || null,
        notes: composedNotes,
        tags: finalTags.length > 0 ? finalTags : null,
        // Tier-4 — GCal-style scheduling. All fields nullable; only ship
        // values when the user actually filled in the Schedule section.
        startsAt: schedule.startsAt
          ? schedule.startsAt.toISOString()
          : null,
        endsAt: schedule.endsAt ? schedule.endsAt.toISOString() : null,
        allDay: schedule.allDay,
        recurrence: schedule.recurrence,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Single doer → land on the task's detail page. Multi-doer fanout →
      // land on the filtered task list (showing the freshly-minted batch).
      if (onSuccess) onSuccess(result.id);
      else if (result.ids.length === 1) {
        router.push(`/tasks/${result.id}` as Route);
      } else {
        router.push("/tasks" as Route);
      }
    });
  }

  function toggleDoer(id: string) {
    setDoerIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  function commitTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(idx: number) {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Client Name — full width hero field (was: Title) */}
      <Field id="nt-title" label="Client Name" required>
        <ClientSelect
          id="nt-title"
          required
          value={title}
          onChange={setTitle}
          clients={clients}
          className="nt-input"
        />
      </Field>

      {/* Metadata row — Initiator first now, then Doer · Priority · Due Date.
          Tier-3 mobile fix: collapse straight to 1-col at md (768), the
          2-col tablet step was too cramped for the multi-doer chip selector
          and native date pickers. */}
      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-1 max-md:gap-3">
        <Field id="nt-initiator" label="Initiator" required>
          <select
            id="nt-initiator"
            required
            value={initiatorId}
            onChange={(e) => setInit(e.target.value)}
            className="nt-input"
          >
            <option value="">Select an employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="nt-doer"
          label={`Doer${doerIds.length > 1 ? ` · ${doerIds.length} selected` : ""}`}
          required
        >
          <DoerMultiSelect
            employees={employees}
            selected={doerIds}
            onToggle={toggleDoer}
          />
        </Field>
        <Field id="nt-priority" label="Priority">
          <select
            id="nt-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="nt-input"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="nt-due" label="Due Date" required>
          <input
            id="nt-due"
            type="date"
            required
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="nt-input"
          />
        </Field>
      </div>

      {/* Subject · Task Description · Initiator Notes — each full-width
          single column, stacked top-to-bottom per spec. */}
      <Field id="nt-subject" label="Subject">
        <select
          id="nt-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="nt-input"
        >
          <option value="">Select a category…</option>
          {TASK_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field id="nt-desc" label="Task Description">
        <textarea
          id="nt-desc"
          rows={4}
          value={description}
          onChange={(e) => setDesc(e.target.value)}
          className="nt-input resize-y"
          placeholder="What needs to happen, in detail…"
        />
      </Field>

      <Field id="nt-notes" label="Initiator Notes">
        <textarea
          id="nt-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="nt-input resize-y"
          placeholder="Notes only the team sees…"
        />
      </Field>

      {/* Tags — free-form chips. Type a tag, hit Enter or comma to commit.
          Stored as text[] on the task; each chip is searchable later. */}
      <Field id="nt-tags" label={`Tags${tags.length > 0 ? ` · ${tags.length}` : ""}`}>
        <TagsInput
          id="nt-tags"
          tags={tags}
          input={tagInput}
          onInputChange={setTagInput}
          onCommit={commitTag}
          onRemove={removeTag}
        />
      </Field>

      {/* Schedule — GCal-style start/end + recurrence. Internal metadata
          only; not synced to any actual calendar API. */}
      <ScheduleSection value={schedule} onChange={setSchedule} />

      {/* Media + Links — side by side on desktop */}
      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <MediaSection
          media={media}
          onAdd={addFiles}
          onRemove={removeMedia}
        />
        <LinksSection
          links={links}
          input={linkInput}
          onInputChange={setLinkInput}
          onAdd={addLink}
          onRemove={removeLink}
        />
      </div>

      {error && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {error}
        </p>
      )}

      <div
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            boxShadow: "0 6px 16px rgba(225, 6, 0, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
          onMouseEnter={(e) => {
            if (pending) return;
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 10px 24px rgba(225, 6, 0, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 6px 16px rgba(225, 6, 0, 0.34)";
          }}
        >
          {pending ? "Creating…" : "Create Task"}
        </button>
      </div>
    </form>
  );
}

/**
 * Multi-select dropdown for Doer. Each pick adds a chip; submitting the
 * form creates one task per selected doer (the action fans out server-side).
 *
 * Styled to read the same as the .nt-input single-line inputs above it so
 * the row stays visually balanced.
 */
function DoerMultiSelect({
  employees,
  selected,
  onToggle,
}: {
  employees: EmployeeOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const byId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nt-input flex items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex flex-wrap items-center gap-1.5 min-h-[24px] max-h-[88px] overflow-y-auto">
          {selected.length === 0 ? (
            <span style={{ color: "var(--color-ink-subtle)" }}>
              Pick one or more…
            </span>
          ) : (
            selected.map((id) => {
              const name = byId.get(id) ?? "Unknown";
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1"
                  style={{
                    background: "var(--vp-cyan-tint)",
                    color: "rgb(var(--vp-cyan-deep))",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <EmployeeAvatar name={name} size="sm" />
                  {name}
                  <span
                    role="button"
                    aria-label={`Remove ${name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(id);
                    }}
                    className="inline-flex items-center justify-center"
                    style={{ width: 18, height: 18, borderRadius: 999 }}
                  >
                    <X size={12} strokeWidth={2.6} />
                  </span>
                </span>
              );
            })
          )}
        </span>
        <span
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 160ms ease",
            color: "var(--color-ink-muted)",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 mt-2 z-50 max-h-[280px] overflow-y-auto rounded-chip border bg-surface-card shadow-xl"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          {employees.length === 0 ? (
            <li
              className="px-4 py-3 font-semibold"
              style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
            >
              No employees available.
            </li>
          ) : (
            employees.map((emp) => {
              const isSel = selected.includes(emp.id);
              return (
                <li
                  key={emp.id}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => onToggle(emp.id)}
                  className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors"
                  style={{
                    background: isSel ? "var(--vp-cyan-tint)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel)
                      e.currentTarget.style.background =
                        "var(--color-surface-soft)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <EmployeeAvatar name={emp.name} size="sm" />
                  <span
                    className="flex-1 font-semibold"
                    style={{
                      fontSize: 15,
                      color: "var(--color-ink-strong)",
                    }}
                  >
                    {emp.name}
                  </span>
                  {isSel && (
                    <Check
                      size={18}
                      strokeWidth={2.6}
                      style={{ color: "rgb(var(--vp-cyan-deep))" }}
                    />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Tag-chip input. Press Enter or comma to commit the pending text into a
 * chip. Backspace on an empty input removes the last chip. Chips stored
 * client-side in `tags: string[]` and shipped to the action.
 */
function TagsInput({
  id,
  tags,
  input,
  onInputChange,
  onCommit,
  onRemove,
}: {
  id: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onCommit: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div
      className="nt-input flex flex-wrap items-center gap-1.5"
      style={{ padding: "10px 12px", minHeight: 56 }}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1"
          style={{
            background: "var(--vp-cyan-tint)",
            color: "rgb(var(--vp-cyan-deep))",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {t}
          <span
            role="button"
            aria-label={`Remove tag ${t}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
            className="inline-flex items-center justify-center"
            style={{ width: 18, height: 18, borderRadius: 999 }}
          >
            <X size={12} strokeWidth={2.6} />
          </span>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
            onRemove(tags.length - 1);
          }
        }}
        placeholder={
          tags.length === 0
            ? "Type a tag and press Enter or comma to add…"
            : "Add another tag…"
        }
        className="flex-1 min-w-[180px] bg-transparent outline-none"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--color-ink-strong)",
          border: "none",
          padding: 0,
        }}
      />
    </div>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor={id}
        className="uppercase font-black tracking-[0.10em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 14,
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "rgb(168, 4, 0)" }}> *</span>
        )}
      </label>
      {children}
    </div>
  );
}

function MediaSection({
  media,
  onAdd,
  onRemove,
}: {
  media: PreviewFile[];
  onAdd: (files: FileList | null) => void;
  onRemove: (idx: number) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      className="rounded-section p-5"
      style={{
        border: "1px solid var(--color-hairline)",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "rgb(var(--vp-cyan-deep))",
          }}
        >
          <ImagePlus size={22} strokeWidth={2.2} />
          Attach media
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontSize: 14,
            color: "var(--color-ink-muted)",
          }}
        >
          {media.length} / {MEDIA_SLOT_COUNT}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files);
          // Reset so re-selecting the same file still fires onChange.
          if (e.target) e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onAdd(e.dataTransfer.files);
        }}
        className="grid grid-cols-4 gap-2.5 max-sm:grid-cols-2"
        style={{
          padding: 4,
          borderRadius: 12,
          background: dragOver ? "var(--vp-cyan-tint)" : "transparent",
          transition: "background 180ms ease",
        }}
      >
        {Array.from({ length: MEDIA_SLOT_COUNT }).map((_, i) => {
          const item = media[i];
          return item ? (
            <FilledSlot
              key={`f-${item.url}`}
              url={item.url}
              name={item.file.name}
              onRemove={() => onRemove(i)}
            />
          ) : (
            <EmptySlot
              key={`e-${i}`}
              onClick={() => fileInputRef.current?.click()}
            />
          );
        })}
      </div>

      <p
        className="mt-4 font-semibold"
        style={{
          fontSize: 14,
          color: "var(--color-ink-muted)",
          lineHeight: 1.5,
        }}
      >
        Drop images anywhere in the grid, or click a slot to pick. PNG / JPG up
        to {MEDIA_SLOT_COUNT} files.
      </p>
    </div>
  );
}

function EmptySlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add image"
      className="relative aspect-square flex flex-col items-center justify-center gap-1.5 rounded-chip transition-all"
      style={{
        background:
          "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
        border: "1.5px dashed #cbd5e1",
        color: "#94a3b8",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "linear-gradient(135deg, var(--vp-cyan-tint) 0%, #e0f2fe 100%)";
        e.currentTarget.style.borderColor = "rgb(var(--vp-cyan))";
        e.currentTarget.style.color = "rgb(var(--vp-cyan-deep))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)";
        e.currentTarget.style.borderColor = "#cbd5e1";
        e.currentTarget.style.color = "#94a3b8";
      }}
    >
      <FileImage size={34} strokeWidth={1.8} />
      <span
        className="uppercase font-extrabold tracking-[0.10em]"
        style={{ fontSize: 12 }}
      >
        Add image
      </span>
    </button>
  );
}

function FilledSlot({
  url,
  name,
  onRemove,
}: {
  url: string;
  name: string;
  onRemove: () => void;
}) {
  return (
    <div
      className="relative aspect-square rounded-chip overflow-hidden group"
      style={{
        border: "1.5px solid rgb(var(--vp-cyan))",
        background: "#ffffff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center rounded-full transition-all"
        style={{
          width: 26,
          height: 26,
          background: "rgba(15, 23, 42, 0.78)",
          color: "#ffffff",
          backdropFilter: "blur(4px)",
        }}
      >
        <X size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}

function LinksSection({
  links,
  input,
  onInputChange,
  onAdd,
  onRemove,
}: {
  links: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div
      className="rounded-section p-5 flex flex-col"
      style={{
        border: "1px solid var(--color-hairline)",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "rgb(var(--vp-cyan-deep))",
          }}
        >
          <Link2 size={22} strokeWidth={2.2} />
          Add links
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontSize: 14,
            color: "var(--color-ink-muted)",
          }}
        >
          {links.length} {links.length === 1 ? "link" : "links"}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <input
          type="url"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="https://docs.example.com/borrower/4471"
          className="nt-input flex-1"
        />
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add link"
          className="inline-flex items-center justify-center rounded-chip transition-all"
          style={{
            width: 52,
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            color: "#ffffff",
            border: "none",
            boxShadow: "0 4px 12px rgba(225, 6, 0, 0.32)",
          }}
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </div>

      {/* Link chips — wraps as more are added */}
      <ul className="mt-3 flex flex-col gap-1.5 flex-1">
        {links.length === 0 ? (
          <li
            className="flex-1 flex items-center justify-center rounded-chip"
            style={{
              minHeight: 80,
              background:
                "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
              border: "1.5px dashed #cbd5e1",
              color: "#94a3b8",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Link2 size={18} strokeWidth={2} />
              No links yet — paste a URL above.
            </span>
          </li>
        ) : (
          links.map((url, i) => (
            <li
              key={`${url}-${i}`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-chip"
              style={{
                background: "#ffffff",
                border: "1px solid var(--color-hairline)",
              }}
            >
              <Link2
                size={16}
                strokeWidth={2.2}
                style={{ color: "rgb(var(--vp-cyan-deep))" }}
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-ink-strong font-bold"
                style={{ fontSize: 16 }}
              >
                {url}
              </a>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove link"
                className="inline-flex items-center justify-center rounded-full text-ink-subtle hover:text-ink-strong"
                style={{ width: 28, height: 28 }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
