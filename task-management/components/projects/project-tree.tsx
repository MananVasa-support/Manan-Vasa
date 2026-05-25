"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Plus, Check, X, Pencil, Archive, FolderKanban } from "lucide-react";
import {
  createProjectNode,
  renameProjectNode,
  setProjectNodeArchived,
} from "@/app/(app)/projects/actions";
import { fireToast } from "@/lib/toast";
import type { ProjectTreeNode } from "@/lib/queries/projects";

type NodeKind = "project" | "milestone" | "result" | "action" | "sub_action";
const CHILD_KIND: Record<string, NodeKind | null> = {
  project: "milestone",
  milestone: "result",
  result: "action",
  action: "sub_action",
  sub_action: null,
};
const KIND_LABEL: Record<string, string> = {
  project: "Project",
  milestone: "Milestone",
  result: "Result",
  action: "Action",
  sub_action: "Sub-Action",
};
const KIND_TONE: Record<string, string> = {
  project: "var(--color-purple)",
  milestone: "var(--color-blue)",
  result: "var(--color-slate)",
  action: "var(--color-green)",
  sub_action: "var(--color-amber)",
};

export function ProjectTree({ tree }: { tree: ProjectTreeNode[] }) {
  return (
    <div className="flex flex-col gap-3">
      <AddNode kind="project" parentId={null} cta="New project" big />
      {tree.length === 0 ? (
        <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-12 text-center">
          <FolderKanban size={28} className="mx-auto text-ink-subtle mb-2" />
          <p className="font-serif text-ink-strong" style={{ fontStyle: "italic", fontSize: 20 }}>
            No projects yet
          </p>
          <p className="text-[14px] text-ink-subtle mt-1">
            Create a project above, then add milestones and results under it.
          </p>
        </div>
      ) : (
        tree.map((node) => <Node key={node.id} node={node} depth={0} />)
      )}
    </div>
  );
}

function Node({ node, depth }: { node: ProjectTreeNode; depth: number }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(node.name);
  const [pending, start] = React.useTransition();
  const childKind = CHILD_KIND[node.kind];

  function save() {
    const v = name.trim();
    if (!v || v === node.name) {
      setEditing(false);
      setName(node.name);
      return;
    }
    start(async () => {
      const res = await renameProjectNode(node.id, v);
      if (!res.ok) fireToast({ message: res.error });
      setEditing(false);
      router.refresh();
    });
  }

  function archive() {
    start(async () => {
      const res = await setProjectNodeArchived(node.id, true);
      if (!res.ok) fireToast({ message: res.error });
      else fireToast({ message: `${node.name} archived.` });
      router.refresh();
    });
  }

  const tone = KIND_TONE[node.kind] ?? "var(--color-slate)";

  return (
    <div style={{ marginLeft: depth * 22 }}>
      <div
        className="group flex items-center gap-2 rounded-chip bg-white border border-hairline px-3 py-2.5"
        style={{ borderLeft: `3px solid ${tone}` }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle w-[68px] shrink-0">
          {KIND_LABEL[node.kind]}
        </span>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setEditing(false); setName(node.name); }
            }}
            onBlur={save}
            className="flex-1 text-[15px] font-semibold text-ink-strong outline-none border-b border-hairline-strong bg-transparent"
          />
        ) : (
          <span className="flex-1 text-[15px] font-semibold text-ink-strong">{node.name}</span>
        )}
        {node.actionCount > 0 && (
          <Link
            href={`/projects/${node.id}` as Route}
            className="text-[12px] font-semibold text-ink-subtle hover:text-ink-strong tabular-nums shrink-0"
          >
            {node.actionCount} {node.actionCount === 1 ? "action" : "actions"}
          </Link>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            aria-label="Rename"
            className="p-1.5 rounded-md text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            aria-label="Archive"
            className="p-1.5 rounded-md text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <Archive size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Children + add-child affordance */}
      <div className="mt-2 flex flex-col gap-2">
        {node.children.map((c) => (
          <Node key={c.id} node={c} depth={depth + 1} />
        ))}
        {childKind && (
          <div style={{ marginLeft: 22 }}>
            <AddNode kind={childKind} parentId={node.id} cta={`Add ${childKind}`} />
          </div>
        )}
      </div>
    </div>
  );
}

function AddNode({
  kind,
  parentId,
  cta,
  big,
}: {
  kind: NodeKind;
  parentId: string | null;
  cta: string;
  big?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();

  function add() {
    const v = name.trim();
    if (!v) return;
    start(async () => {
      const res = await createProjectNode({ name: v, kind, parentId });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          big
            ? "inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-semibold text-white"
            : "inline-flex items-center gap-1 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
        }
        style={big ? { background: "linear-gradient(135deg, #E10600, #A80400)" } : undefined}
      >
        <Plus size={big ? 16 : 14} strokeWidth={2.4} />
        {cta}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") { setOpen(false); setName(""); }
        }}
        placeholder={`${KIND_LABEL[kind]} name`}
        maxLength={160}
        className="rounded-md border border-hairline-strong px-3 py-2 text-[14px] outline-none"
        style={{ minWidth: 240 }}
      />
      <button type="button" onClick={add} disabled={pending} aria-label="Save" className="p-2 rounded-md border border-hairline bg-white hover:bg-surface-soft">
        <Check size={16} strokeWidth={2.4} />
      </button>
      <button type="button" onClick={() => { setOpen(false); setName(""); }} aria-label="Cancel" className="p-2 rounded-md border border-hairline bg-white hover:bg-surface-soft text-ink-muted">
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
