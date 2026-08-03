"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Copy,
  MoreHorizontal,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronDown,
  Loader2,
  Flag,
  Layers,
  Tag as TagIcon,
  Clock3,
  Timer,
  Archive,
  Trash2,
  MessageSquare,
  Paperclip,
  History as HistoryIcon,
  ListChecks,
  Link2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { TaskDetail as TaskDetailModel } from "@/lib/queries/tasks";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { ChecklistItemView, AttachmentView } from "@/lib/queries/task-detail-extras";
import type { TaskInsight } from "@/lib/tasks/insight";
import { progressFromStatus, formatEstimate } from "@/lib/tasks/insight";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import {
  ADMIN_TASK_STATUSES,
  USER_TASK_STATUSES,
  PRIORITY_LABELS,
  type TaskStatus,
} from "@/db/enums";
import { setTaskStatus, archiveTask, deleteTask } from "@/app/(app)/tasks/actions";
import { duplicateTask } from "@/app/(app)/tasks/duplicate-action";
import { setTaskEstimatedMinutes } from "@/app/(app)/tasks/estimate-action";
import { markDoneAction } from "@/app/(app)/tasks/time-actions";
import { AuditFeed } from "@/components/tasks/audit-feed";
import { CommentInput } from "@/components/tasks/comment-input";
import { TaskEditForm } from "@/components/tasks/task-edit-form";
import { TaskTimePanel, type TaskTimePanelData } from "@/components/tasks/time/task-time-panel";
import { TaskChecklist } from "@/components/tasks/detail/task-checklist";
import { TaskAttachments } from "@/components/tasks/detail/task-attachments";
import { TaskTimelineRail, TimeSpentCard, AIInsightsCard } from "@/components/tasks/detail/detail-rail";

type Me = { id: string; name: string; avatarUrl: string | null; department: string | null; isAdmin: boolean };

interface Props {
  task: TaskDetailModel;
  me: Me;
  canEdit: boolean;
  canManageContent: boolean;
  events: AuditFeedRow[];
  clients: string[];
  subjects: string[];
  projectNodes?: { id: string; label: string }[];
  statusLabels: Record<TaskStatus, string>;
  timePanel: TaskTimePanelData | null;
  checklist: ChecklistItemView[];
  attachments: AttachmentView[];
  insight: TaskInsight;
}

const PRIORITY_TONE: Record<string, { bg: string; fg: string }> = {
  imp_urgent: { bg: "color-mix(in srgb, #e10600 12%, white)", fg: "#a80400" },
  imp_not_urgent: { bg: "#fef3c7", fg: "#b45309" },
  not_imp_urgent: { bg: "#dbeafe", fg: "#1d4ed8" },
  not_imp_not_urgent: { bg: "var(--color-surface-soft)", fg: "var(--color-ink-muted)" },
};

type Tab = "overview" | "comments" | "attachments" | "history" | "timelog" | "related";

function Avatar({ name, url, size = 28 }: { name: string | null; url?: string | null; size?: number }) {
  const initials = ((name ?? "?").trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("") || "?").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name ?? ""} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="grid place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-altus-red)_12%,white)] font-black text-altus-red-deep" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function TaskDetailRedesign(props: Props) {
  const { task, me, canEdit, canManageContent, events, clients, subjects, projectNodes, statusLabels, timePanel, checklist, attachments, insight } = props;
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const expectedUpdatedAt = task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt);
  const locked = task.approvalStatus === "approved";
  const progress = progressFromStatus(task.status, task.approvalStatus);
  const statusList = me.isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES;

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string } | void>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res && "ok" in res && res.ok === false) fireToast({ message: res.message ?? res.error ?? "Failed", type: "error" });
      else after?.();
      router.refresh();
    });
  }

  function changeStatus(s: TaskStatus) {
    setStatusOpen(false);
    if (s === task.status) return;
    run(() => setTaskStatus(task.id, s, expectedUpdatedAt));
  }

  if (editing) {
    return (
      <div className="relative">
        <button onClick={() => setEditing(false)} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted hover:text-ink-strong">
          <ChevronLeft size={16} /> Back to task
        </button>
        <TaskEditForm
          taskId={task.id}
          clients={clients}
          subjects={subjects}
          projectNodes={projectNodes}
          initial={{
            title: task.title,
            description: task.description,
            subject: task.subject,
            notes: task.notes,
            priority: task.priority,
            dueAt: task.revisedTargetDate ?? task.dueAt,
            tags: task.tags,
            approvalStatus: task.approvalStatus,
            revisedTargetDate: task.revisedTargetDate,
            startsAt: task.startsAt,
            endsAt: task.endsAt,
            allDay: task.allDay,
            recurrence: (task.recurrence as never) ?? null,
            recurrenceRule: task.recurrenceRule,
            projectNodeId: task.projectNodeId,
          }}
          expectedUpdatedAt={expectedUpdatedAt}
          isAdmin={me.isAdmin}
          onCancel={() => { setEditing(false); router.refresh(); }}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* ── Top action bar ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <nav className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
          <Link href="/tasks" className="grid h-7 w-7 place-items-center rounded-lg border border-hairline bg-white text-ink-muted hover:text-ink-strong">
            <ChevronLeft size={15} />
          </Link>
          <span>WMS</span>
          <ChevronRight size={13} className="text-ink-subtle" />
          <Link href="/tasks" className="hover:text-ink-strong">Tasks</Link>
          <ChevronRight size={13} className="text-ink-subtle" />
          <span className="font-black text-ink-strong">#{task.taskNo ?? "—"}</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft">
              <Pencil size={14} /> Edit Task
            </button>
          )}
          <button
            onClick={() => run(async () => { const r = await duplicateTask(task.id); if (r.ok) router.push(`/tasks/${r.id}`); return r; })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft"
          >
            <Copy size={14} /> Duplicate
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-white text-ink-muted hover:bg-surface-soft">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-hairline bg-white p-1 shadow-lg">
                  <button onClick={() => { setMenuOpen(false); run(() => archiveTask(task.id)); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft">
                    <Archive size={14} /> Archive
                  </button>
                  {me.isAdmin && (
                    <button onClick={() => { setMenuOpen(false); if (confirm("Delete this task permanently?")) run(() => deleteTask(task.id), () => router.push("/tasks")); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-altus-red-deep hover:bg-[color-mix(in_srgb,var(--color-altus-red)_6%,white)]">
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {!locked && (
            <button
              disabled={pending}
              onClick={() => run(() => (timePanel ? markDoneAction(task.id) : setTaskStatus(task.id, "done", expectedUpdatedAt)))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6d28d9] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#5b21b6] disabled:opacity-50"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark as Done
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8 max-lg:grid-cols-1">
        {/* ── MAIN COLUMN ── */}
        <div className="min-w-0">
          {/* Title block */}
          <div className="mb-5">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              {/* Status pill */}
              <div className="relative">
                <button onClick={() => setStatusOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3.5 py-1.5 text-[13px] font-bold text-ink-strong hover:bg-hairline">
                  <span className="h-2 w-2 rounded-full bg-ink-subtle" /> {statusLabels[task.status] ?? task.status}
                  <ChevronDown size={13} />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                    <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border border-hairline bg-white p-1 shadow-lg">
                      {statusList.map((s) => (
                        <button key={s} onClick={() => changeStatus(s)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold hover:bg-surface-soft ${s === task.status ? "text-altus-red-deep" : "text-ink-strong"}`}>
                          {statusLabels[s] ?? s}
                          {s === task.status && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Priority pill */}
              <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={{ background: PRIORITY_TONE[task.priority]?.bg, color: PRIORITY_TONE[task.priority]?.fg }}>
                <Flag size={13} /> {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 flex-1">
                <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: "clamp(24px,2.6vw,32px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {task.title}
                </h1>
                {task.subject && (
                  <span className="mt-3 inline-block rounded-lg bg-[color-mix(in_srgb,#6d28d9_9%,white)] px-3 py-1 text-[12.5px] font-bold text-[#6d28d9]">
                    {task.subject}
                  </span>
                )}
              </div>
              {/* Progress card */}
              <div className="w-[220px] shrink-0 rounded-2xl border border-hairline bg-surface-card px-4 py-3 max-sm:w-full">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-ink-muted">Progress</span>
                  <span className="text-[15px] font-black text-ink-strong tabular-nums">{progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
                  <div className="h-full rounded-full bg-[#6d28d9] transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div className="mb-6 grid grid-cols-4 gap-3 rounded-2xl border border-hairline bg-surface-card p-4 max-md:grid-cols-2">
            <Meta icon={<Building2 size={16} />} label="Client" value={task.client ?? "—"} />
            <MetaPerson label="Created By" name={task.creatorName} url={task.creatorAvatarUrl} sub={format(task.createdAt, "d MMM")} />
            <MetaPerson label="Assigned To" name={task.doerName} url={task.doerAvatarUrl} dot />
            <Meta icon={<Calendar size={16} />} label="Due Date" value={format(task.dueAt, "MMM d, yyyy")} />
          </div>

          {/* Tabs */}
          <div className="mb-5 flex flex-wrap gap-1 border-b border-hairline">
            <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={<ListChecks size={14} />} label="Overview" />
            <TabBtn active={tab === "comments"} onClick={() => setTab("comments")} icon={<MessageSquare size={14} />} label="Comments" />
            <TabBtn active={tab === "attachments"} onClick={() => setTab("attachments")} icon={<Paperclip size={14} />} label="Attachments" count={attachments.length} />
            <TabBtn active={tab === "history"} onClick={() => setTab("history")} icon={<HistoryIcon size={14} />} label="History" />
            <TabBtn active={tab === "timelog"} onClick={() => setTab("timelog")} icon={<Timer size={14} />} label="Time Log" />
            <TabBtn active={tab === "related"} onClick={() => setTab("related")} icon={<Link2 size={14} />} label="Related" />
          </div>

          {/* Tab content */}
          {tab === "overview" && (
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5 max-lg:grid-cols-1">
              <div className="flex flex-col gap-5">
                <Card title="Task Description">
                  {task.description ? (
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-strong">{task.description}</p>
                  ) : (
                    <p className="text-[13.5px] text-ink-muted">No description.</p>
                  )}
                </Card>
                <Card title="Checklist" flush>
                  <TaskChecklist taskId={task.id} items={checklist} canEdit={canManageContent} />
                </Card>
                <Card title="Attachments" flush>
                  <TaskAttachments taskId={task.id} items={attachments} canEdit={canManageContent} />
                </Card>
              </div>
              <TaskDetailsCard task={task} totalActiveSeconds={timePanel?.state.rollup.totalActiveSeconds ?? 0} canEdit={canManageContent} onEstimate={(m) => run(() => setTaskEstimatedMinutes(task.id, m))} />
            </div>
          )}
          {tab === "comments" && (
            <div className="flex flex-col gap-4">
              <CommentInput taskId={task.id} me={{ name: me.name, avatarUrl: me.avatarUrl }} />
              <AuditFeed events={events} statusLabels={statusLabels} me={me} />
            </div>
          )}
          {tab === "attachments" && (
            <Card title="Attachments" flush>
              <TaskAttachments taskId={task.id} items={attachments} canEdit={canManageContent} />
            </Card>
          )}
          {tab === "history" && <AuditFeed events={events} statusLabels={statusLabels} me={me} />}
          {tab === "timelog" && (
            timePanel ? <TaskTimePanel taskId={task.id} {...timePanel} /> : <Card title="Time Log"><p className="text-[13.5px] text-ink-muted">Time tracking is disabled.</p></Card>
          )}
          {tab === "related" && (
            <Card title="Related">
              {task.projectNodeId ? (
                <Link href={"/projects" as never} className="text-[13.5px] font-bold text-altus-red-deep hover:underline">Linked project ↗</Link>
              ) : (
                <p className="text-[13.5px] text-ink-muted">No related items.</p>
              )}
            </Card>
          )}
        </div>

        {/* ── RIGHT RAIL ── */}
        <aside className="flex flex-col gap-4">
          {timePanel ? (
            <>
              <TaskTimelineRail entries={timePanel.state.timeline} />
              <TimeSpentCard taskId={task.id} state={timePanel.state} canOperate={timePanel.canOperate} locked={locked} onViewHistory={() => setTab("timelog")} />
              <AIInsightsCard insight={insight} />
            </>
          ) : (
            <AIInsightsCard insight={insight} />
          )}
        </aside>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button onClick={onClick} className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13.5px] font-bold transition-colors ${active ? "text-altus-red-deep" : "text-ink-muted hover:text-ink-strong"}`}>
      {icon}
      {label}
      {count != null && count > 0 && <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-bold text-ink-muted">{count}</span>}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-altus-red" />}
    </button>
  );
}

function Card({ title, children, flush }: { title: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <h2 className="mb-3 text-[14px] font-black text-ink-strong">{title}</h2>
      <div className={flush ? "" : ""}>{children}</div>
    </section>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{label}</div>
        <div className="truncate text-[13.5px] font-bold text-ink-strong">{value}</div>
      </div>
    </div>
  );
}

function MetaPerson({ label, name, url, sub, dot }: { label: string; name: string | null; url?: string | null; sub?: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} url={url} size={36} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{label}</div>
        <div className="flex items-center gap-1.5 truncate text-[13.5px] font-bold text-ink-strong">
          {name ?? "—"}
          {dot && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
          {sub && <span className="font-medium text-ink-subtle">· {sub}</span>}
        </div>
      </div>
    </div>
  );
}

function TaskDetailsCard({ task, totalActiveSeconds, canEdit, onEstimate }: { task: TaskDetailModel; totalActiveSeconds: number; canEdit: boolean; onEstimate: (m: number | null) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(task.estimatedMinutes ? String(task.estimatedMinutes) : "");
  return (
    <section className="h-fit rounded-2xl border border-hairline bg-surface-card p-5">
      <h2 className="mb-4 text-[14px] font-black text-ink-strong">Task Details</h2>
      <div className="flex flex-col gap-3.5">
        <Row icon={<Flag size={15} />} label="Priority" value={<span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: PRIORITY_TONE[task.priority]?.bg, color: PRIORITY_TONE[task.priority]?.fg }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>} />
        <Row icon={<Layers size={15} />} label="Category" value={<span className="text-[13.5px] font-bold text-ink-strong">{task.subject ?? "—"}</span>} />
        <Row icon={<Building2 size={15} />} label="Module" value={<span className="text-[13.5px] font-bold text-ink-strong">WMS</span>} />
        <Row
          icon={<Clock3 size={15} />}
          label="Estimated Time"
          value={
            editing ? (
              <span className="flex items-center gap-1">
                <input autoFocus value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="min" className="w-16 rounded-md border border-hairline px-2 py-1 text-[12.5px] outline-none focus:border-altus-red" />
                <button onClick={() => { onEstimate(val ? Number(val) : null); setEditing(false); }} className="rounded-md bg-ink-strong px-2 py-1 text-[11px] font-bold text-white">Save</button>
              </span>
            ) : (
              <button disabled={!canEdit} onClick={() => setEditing(true)} className={`text-[13.5px] font-bold text-ink-strong ${canEdit ? "hover:text-altus-red-deep" : ""}`}>
                {formatEstimate(task.estimatedMinutes)}
              </button>
            )
          }
        />
        <Row icon={<Timer size={15} />} label="Actual Time" value={<span className="text-[13.5px] font-bold text-ink-strong">{formatMinutesLabel(totalActiveSeconds)}</span>} />
        <Row
          icon={<TagIcon size={15} />}
          label="Tags"
          value={
            <span className="flex flex-wrap justify-end gap-1">
              {(task.tags ?? []).length > 0 ? (task.tags ?? []).map((t) => <span key={t} className="rounded-md bg-[color-mix(in_srgb,#6d28d9_9%,white)] px-2 py-0.5 text-[11.5px] font-bold text-[#6d28d9]">{t}</span>) : <span className="text-[13px] text-ink-subtle">—</span>}
            </span>
          }
        />
      </div>
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
        <span className="text-ink-subtle">{icon}</span>
        {label}
      </span>
      <div className="text-right">{value}</div>
    </div>
  );
}
