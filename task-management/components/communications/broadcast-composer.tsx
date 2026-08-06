"use client";

/**
 * BROADCAST COMPOSER — the Enterprise Communications (ECOS) authoring surface.
 *
 * A single client screen that composes, targets and publishes a company
 * broadcast. It calls the already-built ECOS Server Actions (saveBroadcastDraft,
 * publishBroadcast, previewAudienceCount, aiComposeAssistant) and the local
 * uploadBroadcastAttachment action — it never touches their internals.
 *
 * The rich body editor is the ONLY holder of the @tiptap graph and is loaded
 * exclusively through next/dynamic({ ssr:false }) (webpack cold-compile guard).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Megaphone,
  Loader2,
  Save,
  Send,
  Paperclip,
  X,
  Users,
  Building2,
  Sparkles,
  Wand2,
  Languages,
  AlignLeft,
  PenLine,
  Link2,
  ShieldAlert,
  Mail,
  MonitorSmartphone,
  Search,
  Check,
} from "lucide-react";
import {
  BROADCAST_CATEGORIES,
  BROADCAST_PRIORITIES,
  BROADCAST_ACK_MODES,
  BROADCAST_AUTHOR_IDENTITIES,
  WORKER_TYPES,
  EMPLOYEE_ROLES,
  type BroadcastCategory,
  type BroadcastPriority,
  type BroadcastAckMode,
  type BroadcastAuthorIdentity,
} from "@/db/enums";
import type { AudienceRule } from "@/lib/ecos/audience";
import type {
  SaveBroadcastDraftInput,
  BroadcastAttachment,
} from "@/app/(app)/hr/communications/actions-types";
import {
  saveBroadcastDraft,
  publishBroadcast,
  previewAudienceCount,
  aiComposeAssistant,
} from "@/app/(app)/hr/communications/actions";
import { uploadBroadcastAttachment } from "@/app/(app)/communications/attachment-actions";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import type { RichBodyValue } from "./rich-body-editor";

const RichBodyEditor = dynamic(() => import("./rich-body-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-white px-5 py-10 text-[14px] font-medium text-ink-muted">
      <Loader2 size={18} className="animate-spin" /> Opening the editor…
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/* Label maps (no shared map exists for the ECOS enums)                */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<BroadcastCategory, string> = {
  announcement: "Announcement",
  ceo: "CEO Message",
  policy: "Policy Update",
  compliance: "Compliance",
  emergency: "Emergency",
  department: "Department",
  event: "Event",
  holiday: "Holiday",
  recognition: "Recognition",
  it: "IT / Systems",
  payroll: "Payroll",
  other: "Other",
};

const PRIORITY_LABELS: Record<BroadcastPriority, string> = {
  normal: "Normal",
  important: "Important",
  high: "High",
  critical: "Critical",
  emergency: "Emergency",
};

const ACK_LABELS: Record<BroadcastAckMode, string> = {
  none: "None — informational only",
  read: "Read receipt (auto)",
  acknowledge: "Require acknowledgement",
};

const IDENTITY_LABELS: Record<BroadcastAuthorIdentity, string> = {
  hr: "Altus HR",
  ceo: "CEO",
  founder: "Founder",
};

const WORKER_TYPE_LABELS: Record<(typeof WORKER_TYPES)[number], string> = {
  full_time: "Full-time",
  afternoon_shift: "Afternoon shift",
  part_time: "Part-time",
  project_remote: "Project / Remote",
};

const ROLE_LABELS: Record<(typeof EMPLOYEE_ROLES)[number], string> = {
  doer: "Doer",
  initiator: "Initiator",
  both: "Both",
};

const LOCK_PRIORITIES = new Set<BroadcastPriority>(["critical", "emergency"]);

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

export interface ComposerEmployee {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  designation: string | null;
}
export interface ComposerOption {
  id: string;
  name: string;
}

export interface ComposerDraft {
  id: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  ackMode: BroadcastAckMode;
  requireLock: boolean;
  authorIdentity: BroadcastAuthorIdentity;
  senderName: string | null;
  attachments: BroadcastAttachment[];
  audience: AudienceRule;
  channels: string[];
}

export interface BroadcastComposerProps {
  employees: ComposerEmployee[];
  departments: ComposerOption[];
  designations: ComposerOption[];
  draft?: ComposerDraft | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert a plain-text AI reply into simple paragraph HTML for the editor. */
function textToHtml(text: string): string {
  const blocks = text.trim().split(/\n{2,}/);
  return blocks
    .map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

const CARD =
  "rounded-2xl border border-hairline bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-30px_rgba(15,23,42,0.4)]";
const LABEL = "block text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle mb-2";
const FIELD =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition focus:border-[color:var(--color-altus-red)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-altus-red)_28%,transparent)]";

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function BroadcastComposer({
  employees,
  departments,
  designations,
  draft,
}: BroadcastComposerProps) {
  const router = useRouter();

  const [draftId, setDraftId] = useState<string | undefined>(draft?.id);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(draft?.bodyHtml ?? "");
  const [bodyText, setBodyText] = useState(draft?.bodyText ?? "");
  const [seed, setSeed] = useState<{ html: string; key: number }>({
    html: draft?.bodyHtml ?? "",
    key: 0,
  });

  const [category, setCategory] = useState<BroadcastCategory>(draft?.category ?? "announcement");
  const [priority, setPriority] = useState<BroadcastPriority>(draft?.priority ?? "normal");
  const [ackMode, setAckMode] = useState<BroadcastAckMode>(draft?.ackMode ?? "read");
  const [requireLock, setRequireLock] = useState(draft?.requireLock ?? false);
  const [authorIdentity, setAuthorIdentity] = useState<BroadcastAuthorIdentity>(
    draft?.authorIdentity ?? "hr",
  );
  const [senderName, setSenderName] = useState(draft?.senderName ?? "");
  const [emailChannel, setEmailChannel] = useState(
    draft ? draft.channels.includes("email") : true,
  );

  const [attachments, setAttachments] = useState<BroadcastAttachment[]>(draft?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // Audience
  const initAud = draft?.audience;
  const [scope, setScope] = useState<"org" | "custom">(initAud?.scope ?? "org");
  const [departmentIds, setDepartmentIds] = useState<string[]>(initAud?.departmentIds ?? []);
  const [designationIds, setDesignationIds] = useState<string[]>(initAud?.designationIds ?? []);
  const [workerTypes, setWorkerTypes] = useState<string[]>(initAud?.workerTypes ?? []);
  const [roles, setRoles] = useState<string[]>(initAud?.roles ?? []);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initAud?.employeeIds ?? []);
  const [empQuery, setEmpQuery] = useState("");

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // AI
  const [aiBusy, setAiBusy] = useState<null | "generate" | "rewrite" | "translate" | "summarize">(
    null,
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLang, setAiLang] = useState("Hindi");

  const lockAllowed = LOCK_PRIORITIES.has(priority);

  // Force app-lock off whenever the priority leaves critical/emergency.
  useEffect(() => {
    if (!lockAllowed && requireLock) setRequireLock(false);
  }, [lockAllowed, requireLock]);

  const employeeById = useMemo(() => {
    const m = new Map<string, ComposerEmployee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  // The live audience rule.
  const audience: AudienceRule = useMemo(() => {
    if (scope === "org") return { scope: "org" };
    return {
      scope: "custom",
      departmentIds,
      designationIds,
      workerTypes,
      roles,
      employeeIds,
    };
  }, [scope, departmentIds, designationIds, workerTypes, roles, employeeIds]);

  const audienceKey = JSON.stringify(audience);

  // Debounced live recipient count.
  const reqSeq = useRef(0);
  useEffect(() => {
    const seq = ++reqSeq.current;
    setCounting(true);
    const t = setTimeout(async () => {
      try {
        const { count } = await previewAudienceCount(JSON.parse(audienceKey) as AudienceRule);
        if (seq === reqSeq.current) setRecipientCount(count);
      } catch {
        if (seq === reqSeq.current) setRecipientCount(null);
      } finally {
        if (seq === reqSeq.current) setCounting(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [audienceKey]);

  const onBodyChange = useCallback((v: RichBodyValue) => {
    setBodyHtml(v.html);
    setBodyText(v.text);
  }, []);

  /* ---- Attachments ---- */
  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadBroadcastAttachment(fd);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setAttachments((prev) => [...prev, res.attachment]);
    } catch (err) {
      fireToast({ message: `Upload failed: ${(err as Error)?.message ?? "unknown"}`, type: "error" });
    } finally {
      setUploading(false);
    }
  }, []);

  const addLink = useCallback(() => {
    const url = linkUrl.trim();
    if (!url) return;
    setAttachments((prev) => [
      ...prev,
      { path: url, name: linkName.trim() || url, mime: "text/uri-list", size: 0 },
    ]);
    setLinkName("");
    setLinkUrl("");
  }, [linkUrl, linkName]);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  /* ---- AI assistant ---- */
  const runAi = useCallback(
    async (action: "generate" | "rewrite" | "translate" | "summarize") => {
      if (action === "generate" && !aiPrompt.trim()) {
        fireToast({ message: "Describe what to write first.", type: "info" });
        return;
      }
      if ((action === "rewrite" || action === "translate" || action === "summarize") && !bodyText.trim()) {
        fireToast({ message: "Write some body text first.", type: "info" });
        return;
      }
      setAiBusy(action);
      try {
        const res = await aiComposeAssistant({
          action,
          text: bodyText,
          prompt: aiPrompt.trim() || undefined,
          language: action === "translate" ? aiLang : undefined,
        });
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        const html = textToHtml(res.text);
        // Generate appends when there's already a draft; the rest replace.
        const nextHtml =
          action === "generate" && bodyText.trim() ? `${bodyHtml}${html}` : html;
        setSeed((s) => ({ html: nextHtml, key: s.key + 1 }));
        fireToast({ message: "Body updated by the assistant.", type: "success" });
      } catch (err) {
        fireToast({
          message: `Assistant unavailable: ${(err as Error)?.message ?? "unknown"}`,
          type: "error",
        });
      } finally {
        setAiBusy(null);
      }
    },
    [aiPrompt, aiLang, bodyText, bodyHtml],
  );

  /* ---- Build the save payload ---- */
  const buildInput = useCallback(
    (): SaveBroadcastDraftInput => ({
      id: draftId,
      title: title.trim(),
      bodyHtml,
      bodyText,
      category,
      priority,
      ackMode,
      requireLock: requireLock && lockAllowed,
      authorIdentity,
      senderName: authorIdentity === "hr" ? undefined : senderName.trim() || undefined,
      attachments,
      audience,
      channels: emailChannel ? ["in_app", "email"] : ["in_app"],
    }),
    [
      draftId,
      title,
      bodyHtml,
      bodyText,
      category,
      priority,
      ackMode,
      requireLock,
      lockAllowed,
      authorIdentity,
      senderName,
      attachments,
      audience,
      emailChannel,
    ],
  );

  const onSaveDraft = useCallback(async () => {
    if (!title.trim()) {
      fireToast({ message: "Give the broadcast a title.", type: "info" });
      return;
    }
    setSavingDraft(true);
    try {
      const res = await saveBroadcastDraft(buildInput());
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setDraftId(res.id);
      fireToast({ message: "Draft saved.", type: "success" });
    } finally {
      setSavingDraft(false);
    }
  }, [title, buildInput]);

  const validatePublish = useCallback((): string | null => {
    if (!title.trim()) return "Give the broadcast a title.";
    if (!bodyText.trim()) return "Write the message body.";
    if (scope === "custom" &&
      departmentIds.length + designationIds.length + workerTypes.length + roles.length + employeeIds.length === 0)
      return "Pick at least one audience filter, or switch to Whole Organization.";
    if (!recipientCount || recipientCount === 0) return "This audience reaches nobody.";
    return null;
  }, [title, bodyText, scope, departmentIds, designationIds, workerTypes, roles, employeeIds, recipientCount]);

  const onPublishClick = useCallback(() => {
    const err = validatePublish();
    if (err) {
      fireToast({ message: err, type: "info" });
      return;
    }
    setConfirmOpen(true);
  }, [validatePublish]);

  const doPublish = useCallback(async () => {
    setPublishing(true);
    try {
      // Persist the latest content first, then publish that id.
      const saved = await saveBroadcastDraft(buildInput());
      if (!saved.ok) {
        fireToast({ message: saved.error, type: "error" });
        return;
      }
      setDraftId(saved.id);
      const res = await publishBroadcast(saved.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Published to ${res.recipientCount} people.`, type: "success" });
      setConfirmOpen(false);
      router.push(`/communications/${saved.id}` as Route);
    } finally {
      setPublishing(false);
    }
  }, [buildInput, router]);

  // Esc closes the confirm dialog.
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const empMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((e) => !employeeIds.includes(e.id) && e.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [empQuery, employees, employeeIds]);

  const countTone =
    recipientCount == null || recipientCount === 0
      ? "var(--color-altus-red)"
      : "var(--color-green-deep)";

  return (
    <div className="flex flex-col gap-6">
      {/* Two-column grid: compose (left) · settings + audience + AI (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ── LEFT: compose ─────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <section className={`${CARD} wg-rise`}>
            <label htmlFor="bc-title" className={LABEL}>
              Title
            </label>
            <input
              id="bc-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali holiday schedule 2026"
              className={`${FIELD} !text-[18px] !font-semibold`}
              maxLength={200}
            />

            <div className="mt-5">
              <span className={LABEL}>Message</span>
              <RichBodyEditor
                initialHtml={seed.html}
                seedKey={seed.key}
                onChange={onBodyChange}
                onReady={() => {}}
              />
            </div>
          </section>

          {/* Attachments */}
          <section className={`${CARD} wg-rise`}>
            <div className="mb-3 flex items-center gap-2">
              <Paperclip size={16} className="text-ink-subtle" />
              <span className={`${LABEL} !mb-0`}>Attachments</span>
            </div>

            {attachments.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2">
                {attachments.map((a) => (
                  <li
                    key={a.path}
                    className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-[color:color-mix(in_srgb,var(--color-altus-red)_3%,#fff)] px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {a.mime === "text/uri-list" ? (
                        <Link2 size={15} className="shrink-0 text-ink-subtle" />
                      ) : (
                        <Paperclip size={15} className="shrink-0 text-ink-subtle" />
                      )}
                      <span className="truncate text-[13.5px] font-medium text-ink-strong">
                        {a.name}
                      </span>
                      {a.size > 0 && (
                        <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
                          {(a.size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => removeAttachment(a.path)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-ink-subtle transition hover:bg-black/5 hover:text-ink-strong"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-strong transition hover:border-hairline-strong disabled:opacity-60"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                Upload file
              </button>
              <input ref={fileRef} type="file" className="sr-only" onChange={onPickFile} />
              <span className="text-[12px] text-ink-subtle">up to 20 MB</span>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="Link label (optional)"
                  className={`${FIELD} !py-2 !text-[13px]`}
                />
              </div>
              <div className="min-w-[180px] flex-[1.4]">
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="https://…  (paste-a-link fallback)"
                  className={`${FIELD} !py-2 !text-[13px]`}
                />
              </div>
              <button
                type="button"
                onClick={addLink}
                disabled={!linkUrl.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong transition hover:border-hairline-strong disabled:opacity-50"
              >
                <Link2 size={14} /> Add link
              </button>
            </div>
          </section>

          {/* AI assistant */}
          <section className={`${CARD} wg-rise`}>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-[color:var(--color-altus-red)]" />
              <span className={`${LABEL} !mb-0`}>AI writing assistant</span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runAi("generate");
                      }
                    }}
                    placeholder="Describe the announcement to generate…"
                    className={`${FIELD} !py-2 !text-[13.5px]`}
                  />
                </div>
                <AiButton
                  icon={<Wand2 size={15} />}
                  label="Generate"
                  busy={aiBusy === "generate"}
                  disabled={aiBusy !== null}
                  onClick={() => void runAi("generate")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AiButton
                  icon={<PenLine size={15} />}
                  label="Rewrite"
                  busy={aiBusy === "rewrite"}
                  disabled={aiBusy !== null}
                  onClick={() => void runAi("rewrite")}
                />
                <AiButton
                  icon={<AlignLeft size={15} />}
                  label="Summarize"
                  busy={aiBusy === "summarize"}
                  disabled={aiBusy !== null}
                  onClick={() => void runAi("summarize")}
                />
                <div className="flex items-center gap-1.5">
                  <AiButton
                    icon={<Languages size={15} />}
                    label="Translate"
                    busy={aiBusy === "translate"}
                    disabled={aiBusy !== null}
                    onClick={() => void runAi("translate")}
                  />
                  <input
                    value={aiLang}
                    onChange={(e) => setAiLang(e.target.value)}
                    aria-label="Translate to language"
                    className={`${FIELD} !w-[110px] !py-1.5 !text-[13px]`}
                  />
                </div>
              </div>
              <p className="text-[12px] text-ink-subtle">
                Rewrite / Summarize / Translate work on the current body. Generate uses the prompt
                above.
              </p>
            </div>
          </section>
        </div>

        {/* ── RIGHT: settings + audience ────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Settings */}
          <section className={`${CARD} wg-rise`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="bc-cat" className={LABEL}>
                  Category
                </label>
                <select
                  id="bc-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BroadcastCategory)}
                  className={FIELD}
                >
                  {BROADCAST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bc-pri" className={LABEL}>
                  Priority
                </label>
                <select
                  id="bc-pri"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as BroadcastPriority)}
                  className={FIELD}
                >
                  {BROADCAST_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="bc-ack" className={LABEL}>
                Acknowledgement
              </label>
              <select
                id="bc-ack"
                value={ackMode}
                onChange={(e) => setAckMode(e.target.value as BroadcastAckMode)}
                className={FIELD}
              >
                {BROADCAST_ACK_MODES.map((a) => (
                  <option key={a} value={a}>
                    {ACK_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>

            {/* App-lock */}
            <div className="mt-4">
              <button
                type="button"
                role="switch"
                aria-checked={requireLock}
                disabled={!lockAllowed}
                onClick={() => setRequireLock((v) => !v)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  lockAllowed
                    ? "border-hairline hover:border-hairline-strong"
                    : "cursor-not-allowed border-hairline opacity-60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ShieldAlert
                    size={17}
                    className={requireLock ? "text-[color:var(--color-altus-red)]" : "text-ink-subtle"}
                  />
                  <span>
                    <span className="block text-[13.5px] font-bold text-ink-strong">
                      Require app-lock
                    </span>
                    <span className="block text-[12px] text-ink-subtle">
                      {lockAllowed
                        ? "Freezes the app until acknowledged"
                        : "Only for Critical or Emergency priority"}
                    </span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className="relative h-6 w-11 shrink-0 rounded-full transition"
                  style={{
                    background: requireLock
                      ? "var(--color-altus-red)"
                      : "color-mix(in srgb, var(--color-ink-subtle, #64748b) 34%, transparent)",
                  }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: requireLock ? "22px" : "2px" }}
                  />
                </span>
              </button>
            </div>

            {/* Author identity */}
            <div className="mt-4">
              <span className={LABEL}>Send as</span>
              <div className="flex flex-wrap gap-2">
                {BROADCAST_AUTHOR_IDENTITIES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAuthorIdentity(id)}
                    aria-pressed={authorIdentity === id}
                    className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition ${
                      authorIdentity === id
                        ? "border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] text-[color:var(--color-altus-red-deep)]"
                        : "border-hairline text-ink-strong hover:border-hairline-strong"
                    }`}
                  >
                    {IDENTITY_LABELS[id]}
                  </button>
                ))}
              </div>
              {authorIdentity !== "hr" && (
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder={`Display name for the ${IDENTITY_LABELS[authorIdentity]} (optional)`}
                  className={`${FIELD} mt-2`}
                />
              )}
            </div>

            {/* Channels */}
            <div className="mt-4">
              <span className={LABEL}>Channels</span>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color:var(--color-altus-red-deep)]">
                  <MonitorSmartphone size={15} /> In-app
                  <Check size={14} className="opacity-70" />
                </span>
                <button
                  type="button"
                  onClick={() => setEmailChannel((v) => !v)}
                  aria-pressed={emailChannel}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition ${
                    emailChannel
                      ? "border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] text-[color:var(--color-altus-red-deep)]"
                      : "border-hairline text-ink-strong hover:border-hairline-strong"
                  }`}
                >
                  <Mail size={15} /> Email
                  {emailChannel && <Check size={14} className="opacity-70" />}
                </button>
              </div>
            </div>
          </section>

          {/* Audience */}
          <section className={`${CARD} wg-rise`}>
            <div className="mb-3 flex items-center gap-2">
              <Users size={16} className="text-ink-subtle" />
              <span className={`${LABEL} !mb-0`}>Audience</span>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope("org")}
                aria-pressed={scope === "org"}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                  scope === "org"
                    ? "border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] text-[color:var(--color-altus-red-deep)]"
                    : "border-hairline text-ink-strong hover:border-hairline-strong"
                }`}
              >
                <Building2 size={15} className="mr-1.5 inline" /> Whole organization
              </button>
              <button
                type="button"
                onClick={() => setScope("custom")}
                aria-pressed={scope === "custom"}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                  scope === "custom"
                    ? "border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_10%,transparent)] text-[color:var(--color-altus-red-deep)]"
                    : "border-hairline text-ink-strong hover:border-hairline-strong"
                }`}
              >
                <Users size={15} className="mr-1.5 inline" /> Custom
              </button>
            </div>

            {scope === "custom" && (
              <div className="flex flex-col gap-4">
                <ChipGroup
                  title="Departments"
                  options={departments}
                  selected={departmentIds}
                  onToggle={(id) => toggle(departmentIds, setDepartmentIds, id)}
                />
                <ChipGroup
                  title="Designations"
                  options={designations}
                  selected={designationIds}
                  onToggle={(id) => toggle(designationIds, setDesignationIds, id)}
                />
                <ChipGroup
                  title="Worker types"
                  options={WORKER_TYPES.map((w) => ({ id: w, name: WORKER_TYPE_LABELS[w] }))}
                  selected={workerTypes}
                  onToggle={(id) => toggle(workerTypes, setWorkerTypes, id)}
                />
                <ChipGroup
                  title="Roles"
                  options={EMPLOYEE_ROLES.map((r) => ({ id: r, name: ROLE_LABELS[r] }))}
                  selected={roles}
                  onToggle={(id) => toggle(roles, setRoles, id)}
                />

                {/* Individual employees — search & add (no cap) */}
                <div>
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                    Specific people
                  </span>
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                    />
                    <input
                      value={empQuery}
                      onChange={(e) => setEmpQuery(e.target.value)}
                      placeholder="Search a name to add…"
                      className={`${FIELD} !pl-9`}
                    />
                    {empMatches.length > 0 && (
                      <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-hairline bg-white p-1 shadow-lg">
                        {empMatches.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setEmployeeIds((prev) => [...prev, e.id]);
                                setEmpQuery("");
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-black/5"
                            >
                              <Avatar name={e.name} avatarUrl={e.avatarUrl} size={26} />
                              <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-semibold text-ink-strong">
                                  {e.name}
                                </span>
                                {(e.designation || e.department) && (
                                  <span className="block truncate text-[12px] text-ink-subtle">
                                    {[e.designation, e.department].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {employeeIds.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {employeeIds.map((id) => {
                        const e = employeeById.get(id);
                        return (
                          <li
                            key={id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white py-1 pl-1 pr-2"
                          >
                            <Avatar name={e?.name ?? "?"} avatarUrl={e?.avatarUrl} size={20} />
                            <span className="text-[12.5px] font-semibold text-ink-strong">
                              {e?.name ?? "Unknown"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${e?.name ?? "person"}`}
                              onClick={() =>
                                setEmployeeIds((prev) => prev.filter((x) => x !== id))
                              }
                              className="grid h-5 w-5 place-items-center rounded-full text-ink-subtle transition hover:bg-black/5 hover:text-ink-strong"
                            >
                              <X size={13} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Live count */}
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-hairline bg-[color:color-mix(in_srgb,var(--color-altus-red)_3%,#fff)] px-4 py-3">
              {counting ? (
                <Loader2 size={17} className="animate-spin text-ink-subtle" />
              ) : (
                <Users size={17} style={{ color: countTone }} />
              )}
              <span className="text-[14px] font-semibold text-ink-strong">
                {counting ? (
                  "Counting…"
                ) : recipientCount == null ? (
                  "Recipient count unavailable"
                ) : (
                  <>
                    Will reach{" "}
                    <span className="tabular-nums" style={{ color: countTone }}>
                      {recipientCount}
                    </span>{" "}
                    {recipientCount === 1 ? "person" : "people"}
                  </>
                )}
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────── */}
      <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-white/95 px-5 py-3 shadow-[0_20px_44px_-24px_rgba(15,23,42,0.5)] backdrop-blur">
        <span className="text-[13px] font-medium text-ink-subtle">
          {draftId ? "Draft saved · edits are unsaved until you save again" : "Not saved yet"}
        </span>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={savingDraft || publishing}
            className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-[14px] font-bold text-ink-strong transition hover:border-hairline-strong disabled:opacity-60"
          >
            {savingDraft ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save draft
          </button>
          <button
            type="button"
            onClick={onPublishClick}
            disabled={publishing || savingDraft}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 14px 30px -14px rgba(168,4,0,0.6)",
            }}
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Publish
          </button>
        </div>
      </div>

      {/* ── Confirm dialog ────────────────────────────────────── */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm publish"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="wg-rise w-full max-w-md rounded-2xl border border-hairline bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2">
              <Megaphone size={20} className="text-[color:var(--color-altus-red)]" />
              <h2 className="text-[18px] font-extrabold text-ink-strong">Publish this broadcast?</h2>
            </div>
            <p className="text-[14px] leading-relaxed text-ink-muted">
              &ldquo;{title.trim() || "Untitled"}&rdquo; will be delivered{" "}
              {emailChannel ? "in-app and by email" : "in-app"} to{" "}
              <span className="font-bold tabular-nums text-ink-strong">
                {recipientCount ?? 0}
              </span>{" "}
              {recipientCount === 1 ? "person" : "people"}
              {ackMode === "acknowledge" ? ", who must acknowledge it" : ""}
              {requireLock && lockAllowed ? " and the app will lock until they do" : ""}. This
              can&rsquo;t be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={publishing}
                className="rounded-xl border border-hairline bg-white px-4 py-2.5 text-[14px] font-bold text-ink-strong transition hover:border-hairline-strong disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={doPublish}
                disabled={publishing}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white transition disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                  boxShadow: "0 14px 30px -14px rgba(168,4,0,0.6)",
                }}
              >
                {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Publish now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function AiButton({
  icon,
  label,
  busy,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong transition hover:border-[color:var(--color-altus-red)] hover:text-[color:var(--color-altus-red-deep)] disabled:opacity-50"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ComposerOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                on
                  ? "border-[color:var(--color-altus-red)] bg-[color:color-mix(in_srgb,var(--color-altus-red)_12%,transparent)] text-[color:var(--color-altus-red-deep)]"
                  : "border-hairline text-ink-muted hover:border-hairline-strong hover:text-ink-strong"
              }`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BroadcastComposer;
