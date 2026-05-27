"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Popover from "@radix-ui/react-popover";
import {
  Plus,
  Check,
  X,
  Pencil,
  Archive,
  MoreHorizontal,
  Diamond,
  Circle,
  ChevronRight,
  Minus,
  FolderKanban,
  Sparkles,
  Layers,
  Target,
  ListChecks,
} from "lucide-react";
import {
  createProjectNode,
  renameProjectNode,
  setProjectNodeArchived,
} from "@/app/(app)/projects/actions";
import { fireToast } from "@/lib/toast";
import type { ProjectTreeNode } from "@/lib/queries/projects";

type NodeKind = "project" | "milestone" | "result" | "action" | "sub_action";

const CHILD_KIND: Record<NodeKind, NodeKind | null> = {
  project: "milestone",
  milestone: "result",
  result: "action",
  action: "sub_action",
  sub_action: null,
};

const KIND_LABEL: Record<NodeKind, string> = {
  project: "Project",
  milestone: "Milestone",
  result: "Result",
  action: "Action",
  sub_action: "Sub-Action",
};

// Recursive sum of all linked tasks across the subtree. The DB only carries
// per-node counts; aggregate counts are computed in JS once on render.
function totalActions(node: ProjectTreeNode): number {
  return (
    node.actionCount +
    node.children.reduce((sum, c) => sum + totalActions(c), 0)
  );
}

function countByKind(
  node: ProjectTreeNode,
  kind: NodeKind,
): number {
  let n = node.kind === kind ? 1 : 0;
  for (const c of node.children) n += countByKind(c, kind);
  return n;
}

function pluralize(n: number, one: string, many: string = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

interface Props {
  projects: ProjectTreeNode[];
  activeId: string | null;
}

/**
 * Projects workspace — a dramatic dark hero up top (mirrors the login
 * page's red-glow drama) followed by a light workspace: sticky rail of
 * projects + a focused detail card with stat strip and editorial tree.
 *
 * Selection is URL-driven (`?p=<id>`) so the active project survives a
 * refresh and is deep-linkable. The page itself stays a server component;
 * everything here is client because of inline add/rename/archive state.
 */
export function ProjectsWorkspace({ projects, activeId }: Props) {
  const active = projects.find((p) => p.id === activeId) ?? null;

  // Org-wide rollups for the hero stat-strip. Cheap — these structures are
  // already in memory; cost is a few hundred function calls at most.
  const totalProjects = projects.length;
  const totalMilestones = projects.reduce(
    (sum, p) => sum + countByKind(p, "milestone"),
    0,
  );
  const totalResults = projects.reduce(
    (sum, p) => sum + countByKind(p, "result"),
    0,
  );
  const totalLinkedTasks = projects.reduce(
    (sum, p) => sum + totalActions(p),
    0,
  );

  return (
    <>
      <HeroHeader
        totals={{
          projects: totalProjects,
          milestones: totalMilestones,
          results: totalResults,
          tasks: totalLinkedTasks,
        }}
      />

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="grid grid-cols-[260px_minmax(0,1fr)] gap-12 max-lg:grid-cols-1 max-lg:gap-6 mt-10"
          style={{ opacity: 0, animation: "fadeUp 600ms ease-out 200ms forwards" }}
        >
          <ProjectRail projects={projects} activeId={active?.id ?? null} />
          {active && <ProjectDetail project={active} />}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────── Hero header ─ */

function HeroHeader({
  totals,
}: {
  totals: { projects: number; milestones: number; results: number; tasks: number };
}) {
  return (
    <section
      className="relative overflow-hidden rounded-section px-10 py-10 max-md:px-6 max-md:py-8"
      style={{
        opacity: 0,
        animation: "fadeUp 700ms ease-out 50ms forwards",
        background:
          "radial-gradient(ellipse 90% 70% at 85% 100%, rgba(225, 6, 0, 0.55), transparent 55%), radial-gradient(ellipse 60% 60% at 15% 0%, rgba(168, 4, 0, 0.20), transparent 60%), linear-gradient(135deg, #0E0B0A 0%, #1A0F0C 50%, #0B0708 100%)",
        boxShadow:
          "0 24px 60px -20px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Decorative dot grid (echo of the login page) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.10] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Film grain overlay */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative flex items-end justify-between gap-8 max-md:flex-col max-md:items-start">
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex items-center gap-2.5 mb-4"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.24em",
              color: "rgba(255,255,255,0.78)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderBottom: "10px solid #E10600",
                filter: "drop-shadow(0 0 10px rgba(225, 6, 0, 0.8))",
              }}
            />
            Projects
          </div>
          <h1
            className="text-white"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 58,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              textShadow: "0 2px 12px rgba(0,0,0,0.45)",
            }}
          >
            Break work down.
          </h1>
          <p
            className="mt-4 max-w-2xl"
            style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: 16.5,
              lineHeight: 1.55,
              fontWeight: 400,
            }}
          >
            Project → Milestone → Result → Action → Sub-Action. Hierarchy
            for ambitious work — link any task to the node it serves.
          </p>

          {/* Org-wide stat strip — only meaningful when there's data */}
          {totals.projects > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
              <HeroStat
                icon={<FolderKanban size={13} strokeWidth={2.2} />}
                label="Projects"
                value={totals.projects}
              />
              <HeroStat
                icon={<Layers size={13} strokeWidth={2.2} />}
                label="Milestones"
                value={totals.milestones}
              />
              <HeroStat
                icon={<Target size={13} strokeWidth={2.2} />}
                label="Results"
                value={totals.results}
              />
              <HeroStat
                icon={<ListChecks size={13} strokeWidth={2.2} />}
                label="Linked tasks"
                value={totals.tasks}
              />
            </div>
          )}
        </div>

        <NewProjectButton hero />
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-flex items-center justify-center size-8 rounded-full"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.16)",
          color: "rgba(255,255,255,0.95)",
        }}
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span
          className="tabular-nums"
          style={{
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            fontFamily: "var(--font-serif)",
          }}
        >
          {value}
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginTop: 5,
          }}
        >
          {label}
        </span>
      </span>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── Rail ─ */

function ProjectRail({
  projects,
  activeId,
}: {
  projects: ProjectTreeNode[];
  activeId: string | null;
}) {
  return (
    <aside className="self-start lg:sticky lg:top-6">
      <div
        className="text-ink-subtle mb-4 px-2 flex items-center gap-2"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <Sparkles size={11} strokeWidth={2.4} className="text-ink-muted" />
        All projects
        <span className="text-ink-subtle tabular-nums ml-auto font-mono">
          {projects.length}
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {projects.map((p, i) => (
          <RailItem
            key={p.id}
            project={p}
            active={p.id === activeId}
            staggerIndex={i}
          />
        ))}
      </nav>
      <div className="mt-4 px-2">
        <NewProjectInlineLink />
      </div>
    </aside>
  );
}

function RailItem({
  project,
  active,
  staggerIndex,
}: {
  project: ProjectTreeNode;
  active: boolean;
  staggerIndex: number;
}) {
  const actions = totalActions(project);
  const milestones = project.children.length;

  // Active vs idle styles. Hover is CSS-driven (see hover: classes below)
  // so the JS-handler approach isn't needed.
  const containerStyle: React.CSSProperties = active
    ? {
        background:
          "linear-gradient(180deg, rgba(225,6,0,0.06), rgba(225,6,0,0.02))",
        border: "1px solid rgba(225, 6, 0, 0.18)",
        boxShadow:
          "0 1px 3px rgba(225, 6, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
      }
    : { border: "1px solid transparent" };

  return (
    <Link
      href={`/projects?p=${project.id}` as Route}
      scroll={false}
      replace
      className={`group relative rounded-chip transition-all ${
        active
          ? ""
          : "hover:bg-surface-card hover:!border-hairline hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.08)]"
      }`}
      style={{
        opacity: 0,
        animation: `fadeUp 500ms ease-out ${250 + staggerIndex * 40}ms forwards`,
        ...containerStyle,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Red rail-stripe on the left edge of the active item */}
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-opacity"
          style={{
            background:
              "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
            opacity: active ? 1 : 0,
            boxShadow: active ? "0 0 8px rgba(225, 6, 0, 0.45)" : "none",
          }}
        />

        <span className="flex-1 min-w-0">
          <span
            className="block truncate"
            style={{
              color: active
                ? "var(--color-ink-strong)"
                : "var(--color-ink)",
              fontSize: 15.5,
              fontWeight: active ? 700 : 600,
              letterSpacing: "-0.005em",
              lineHeight: 1.25,
            }}
          >
            {project.name}
          </span>
          <span
            className="block tabular-nums mt-1"
            style={{
              fontSize: 12,
              color: "var(--color-ink-muted)",
              letterSpacing: "0.01em",
            }}
          >
            {pluralize(milestones, "milestone")} · {pluralize(actions, "task")}
          </span>
        </span>

        <ChevronRight
          size={14}
          strokeWidth={2.4}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{
            color: active
              ? "var(--color-altus-red)"
              : "var(--color-ink-subtle)",
          }}
        />
      </div>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────── Detail ─ */

function ProjectDetail({ project }: { project: ProjectTreeNode }) {
  const milestones = project.children.length;
  const results = countByKind(project, "result");
  const allActions = countByKind(project, "action") + countByKind(project, "sub_action");
  const linked = totalActions(project);

  return (
    <article
      className="relative rounded-section bg-surface-card border border-hairline overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.08)",
        opacity: 0,
        animation: "fadeUp 700ms ease-out 300ms forwards",
      }}
    >
      {/* Red accent strip across the top — ties the card visually to the
          hero band above. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background:
            "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-altus-red-deep) 35%, transparent 100%)",
          opacity: 0.85,
        }}
      />

      <div className="px-12 py-11 max-md:px-6 max-md:py-7">
        {/* Card header */}
        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div
              className="text-ink-subtle"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Project
            </div>
            <EditableTitle node={project} />
          </div>
          <NodeMenu node={project} />
        </header>

        {/* Stat strip — KPI-style mini tiles. Cohesive with the hero. */}
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 mb-9">
          <StatTile
            icon={<Layers size={14} strokeWidth={2.2} />}
            label="Milestones"
            value={milestones}
            tone="amber"
          />
          <StatTile
            icon={<Target size={14} strokeWidth={2.2} />}
            label="Results"
            value={results}
            tone="blue"
          />
          <StatTile
            icon={<ChevronRight size={14} strokeWidth={2.4} />}
            label="Actions"
            value={allActions}
            tone="purple"
          />
          <StatTile
            icon={<ListChecks size={14} strokeWidth={2.2} />}
            label="Linked tasks"
            value={linked}
            tone="red"
          />
        </div>

        {/* Section eyebrow */}
        <div
          className="text-ink-subtle mb-5 flex items-center gap-2 pb-3 border-b border-hairline"
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Breakdown
          <span className="text-ink-subtle tabular-nums font-mono ml-auto" style={{ fontSize: 12 }}>
            {project.children.length === 0
              ? "Empty"
              : `${milestones} · ${results} · ${allActions}`}
          </span>
        </div>

        {/* Tree body */}
        <div>
          {project.children.length === 0 ? (
            <div
              className="text-center py-10 rounded-chip"
              style={{
                background:
                  "linear-gradient(180deg, var(--color-surface-soft) 0%, transparent 100%)",
                border: "1px dashed var(--color-hairline-strong)",
              }}
            >
              <p
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 18,
                  letterSpacing: "-0.01em",
                }}
              >
                No milestones yet.
              </p>
              <p className="text-[13px] text-ink-subtle mt-1.5">
                Add the first milestone to start breaking this project down.
              </p>
              <div className="mt-4 flex justify-center">
                <AddChildButton
                  kind="milestone"
                  parentId={project.id}
                  label="Add milestone"
                />
              </div>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {project.children.map((m) => (
                  <TreeNode key={m.id} node={m} depth={0} />
                ))}
              </ul>
              <div className="mt-3 pl-0.5">
                <AddChildButton
                  kind="milestone"
                  parentId={project.id}
                  label="Add milestone"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "blue" | "purple" | "red";
}) {
  return (
    <div
      className="relative rounded-chip px-5 py-4 overflow-hidden border border-hairline"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--color-${tone}) 10%, var(--color-surface-card)) 0%, var(--color-surface-card) 100%)`,
      }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span
          className="inline-flex items-center justify-center size-7 rounded-md"
          style={{
            background: `color-mix(in srgb, var(--color-${tone}) 16%, transparent)`,
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-ink-strong tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── Tree row ─ */

function KindGlyph({ kind, depth }: { kind: NodeKind; depth: number }) {
  // Milestone glyph gets the brand red (it's the headline node under the
  // project); deeper rungs use a quieting ink ramp.
  if (kind === "milestone") {
    return (
      <Diamond
        size={11}
        strokeWidth={2.2}
        fill="var(--color-altus-red)"
        style={{
          color: "var(--color-altus-red)",
          filter: "drop-shadow(0 0 6px rgba(225, 6, 0, 0.30))",
        }}
        aria-hidden
      />
    );
  }
  const inks = [
    "var(--color-ink)", //         depth 1: result
    "var(--color-ink-soft)", //    depth 2: action
    "var(--color-ink-muted)", //   depth 3: sub_action
  ];
  const color = inks[Math.min(depth - 1, inks.length - 1)] ?? inks[0];
  const sizeMap: Partial<Record<NodeKind, number>> = {
    result: 9,
    action: 11,
    sub_action: 9,
  };
  const size = sizeMap[kind] ?? 10;

  switch (kind) {
    case "result":
      return (
        <Circle
          size={size}
          strokeWidth={2.2}
          style={{ color }}
          aria-hidden
        />
      );
    case "action":
      return (
        <ChevronRight
          size={size}
          strokeWidth={2.4}
          style={{ color }}
          aria-hidden
        />
      );
    case "sub_action":
      return (
        <Minus
          size={size}
          strokeWidth={2.4}
          style={{ color }}
          aria-hidden
        />
      );
    default:
      return null;
  }
}

function TreeNode({
  node,
  depth,
}: {
  node: ProjectTreeNode;
  depth: number;
}) {
  const childKind = CHILD_KIND[node.kind];
  const hasChildren = node.children.length > 0;
  const linked = node.actionCount;

  const typeStyles: Array<{ size: number; weight: number; color: string }> = [
    { size: 17, weight: 700, color: "var(--color-ink-strong)" }, // milestone
    { size: 15, weight: 600, color: "var(--color-ink)" }, //         result
    { size: 14, weight: 500, color: "var(--color-ink-soft)" }, //    action
    { size: 13, weight: 500, color: "var(--color-ink-muted)" }, //   sub-action
  ];
  const ts = typeStyles[Math.min(depth, typeStyles.length - 1)]!;

  // Guide line color: a faint red at the milestone level, hairline elsewhere.
  // The accent at the top of the tree reinforces the brand without becoming
  // noise at deeper levels.
  const guideColor =
    depth === 0
      ? "color-mix(in srgb, var(--color-altus-red) 25%, transparent)"
      : "var(--color-hairline-strong)";

  return (
    <li>
      <NodeRow
        node={node}
        depth={depth}
        glyph={<KindGlyph kind={node.kind} depth={depth} />}
        typeStyle={ts}
        linked={linked}
      />

      {(hasChildren || childKind) && (
        <ul
          className="flex flex-col gap-1.5 mt-1.5"
          style={{
            marginLeft: 11,
            paddingLeft: 17,
            borderLeft: `1px solid ${guideColor}`,
          }}
        >
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
          {childKind && (
            <li className="pt-0.5">
              <AddChildButton
                kind={childKind}
                parentId={node.id}
                label={`Add ${KIND_LABEL[childKind].toLowerCase()}`}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function NodeRow({
  node,
  depth,
  glyph,
  typeStyle,
  linked,
}: {
  node: ProjectTreeNode;
  depth: number;
  glyph: React.ReactNode;
  typeStyle: { size: number; weight: number; color: string };
  linked: number;
}) {
  return (
    <div
      className="group flex items-center gap-3 py-2 px-2.5 -mx-2.5 rounded-md transition-colors hover:bg-surface-soft"
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: 14, height: 16 }}
      >
        {glyph}
      </span>

      <EditableName node={node} typeStyle={typeStyle} depth={depth} />

      {linked > 0 && (
        <Link
          href={`/projects/${node.id}` as Route}
          className="shrink-0 tabular-nums px-2.5 py-1 rounded-pill transition-colors hover:brightness-110"
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--color-altus-red-deep)",
            background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 26%, transparent)",
          }}
          title="View linked tasks"
        >
          {linked} {linked === 1 ? "task" : "tasks"}
        </Link>
      )}

      <NodeMenu node={node} compact />
    </div>
  );
}

/* ─────────────────────────────────────────────────────── Editable name ─ */

function EditableTitle({ node }: { node: ProjectTreeNode }) {
  return (
    <EditableName
      node={node}
      typeStyle={{
        size: 44,
        weight: 500,
        color: "var(--color-ink-strong)",
      }}
      depth={-1}
      asHeading
    />
  );
}

function EditableName({
  node,
  typeStyle,
  depth: _depth,
  asHeading = false,
}: {
  node: ProjectTreeNode;
  typeStyle: { size: number; weight: number; color: string };
  depth: number;
  asHeading?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(node.name);
  const [pending, start] = React.useTransition();

  React.useEffect(() => setName(node.name), [node.name]);

  function save() {
    const v = name.trim();
    if (!v || v === node.name) {
      setEditing(false);
      setName(node.name);
      return;
    }
    start(async () => {
      const res = await renameProjectNode(node.id, v);
      if (!res.ok) {
        fireToast({ message: res.error });
        setName(node.name);
      }
      setEditing(false);
      router.refresh();
    });
  }

  const sharedStyle: React.CSSProperties = {
    fontFamily: asHeading ? "var(--font-serif)" : "var(--font-sans)",
    fontStyle: asHeading ? "italic" : "normal",
    fontSize: typeStyle.size,
    fontWeight: typeStyle.weight,
    color: typeStyle.color,
    letterSpacing: asHeading ? "-0.025em" : "-0.005em",
    lineHeight: asHeading ? 1.05 : 1.35,
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setEditing(false);
            setName(node.name);
          }
        }}
        onBlur={save}
        disabled={pending}
        maxLength={160}
        className="flex-1 min-w-0 bg-transparent outline-none border-b border-hairline-strong focus:border-altus-red"
        style={sharedStyle}
      />
    );
  }

  return (
    <button
      type="button"
      data-node-name={node.id}
      onDoubleClick={() => setEditing(true)}
      className="flex-1 min-w-0 text-left truncate cursor-text"
      style={sharedStyle}
      title="Double-click to rename"
    >
      {node.name}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── Node menu ─ */

function NodeMenu({
  node,
  compact = false,
}: {
  node: ProjectTreeNode;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  function rename() {
    setOpen(false);
    const target = document.querySelector<HTMLButtonElement>(
      `[data-node-name="${node.id}"]`,
    );
    target?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
    );
  }

  function archive() {
    setOpen(false);
    start(async () => {
      const res = await setProjectNodeArchived(node.id, true);
      if (!res.ok) {
        fireToast({ message: res.error });
      } else {
        fireToast({ message: `${node.name} archived.` });
      }
      router.refresh();
    });
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${node.name}`}
          disabled={pending}
          className={`shrink-0 inline-flex items-center justify-center rounded-md transition-all ${
            compact
              ? "size-6 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white"
              : "size-8 opacity-60 hover:opacity-100 hover:bg-surface-soft"
          }`}
          style={{ color: "var(--color-ink-subtle)" }}
        >
          <MoreHorizontal size={compact ? 14 : 16} strokeWidth={2.2} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[160px] rounded-chip border bg-surface-card py-1"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          <MenuItem onClick={rename} icon={<Pencil size={13} strokeWidth={2.2} />}>
            Rename
          </MenuItem>
          <MenuItem
            onClick={archive}
            icon={<Archive size={13} strokeWidth={2.2} />}
            danger
          >
            Archive
          </MenuItem>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
  danger = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors hover:bg-surface-soft"
      style={{ color: danger ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
    >
      <span
        className="shrink-0"
        style={{ color: danger ? "var(--color-altus-red)" : "var(--color-ink-muted)" }}
      >
        {icon}
      </span>
      <span>{children}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────── Add nodes ─ */

function AddChildButton({
  kind,
  parentId,
  label,
}: {
  kind: NodeKind;
  parentId: string | null;
  label: string;
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
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-altus-red transition-colors py-1"
      >
        <Plus size={12} strokeWidth={2.4} />
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder={`${KIND_LABEL[kind]} name`}
        maxLength={160}
        disabled={pending}
        className="rounded-md border border-hairline-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-altus-red"
        style={{ minWidth: 240 }}
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !name.trim()}
        aria-label="Save"
        className="p-1.5 rounded-md border border-hairline bg-white hover:bg-surface-soft disabled:opacity-40"
      >
        <Check size={14} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        aria-label="Cancel"
        className="p-1.5 rounded-md border border-hairline bg-white hover:bg-surface-soft text-ink-muted"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function NewProjectButton({ hero = false }: { hero?: boolean }) {
  return (
    <NewProjectControl
      hero={hero}
      trigger={(openFn) => {
        if (hero) {
          return (
            <button
              type="button"
              onClick={openFn}
              className="group relative inline-flex items-center gap-2 px-5 py-3 rounded-pill text-white font-bold text-[13.5px] transition-all hover:-translate-y-px shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow:
                  "0 8px 24px -8px rgba(225, 6, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                letterSpacing: "0.01em",
              }}
            >
              <Plus size={15} strokeWidth={2.6} />
              New project
              <span
                aria-hidden
                className="absolute inset-0 rounded-pill pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  boxShadow: "0 0 24px 0 rgba(225, 6, 0, 0.45)",
                }}
              />
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openFn}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3.5 py-2 text-[13px] font-semibold text-ink-strong hover:border-altus-red transition-colors"
          >
            <Plus size={14} strokeWidth={2.4} />
            New project
          </button>
        );
      }}
    />
  );
}

function NewProjectInlineLink() {
  return (
    <NewProjectControl
      trigger={(openFn) => (
        <button
          type="button"
          onClick={openFn}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-altus-red transition-colors py-1"
        >
          <Plus size={12} strokeWidth={2.4} />
          New project
        </button>
      )}
    />
  );
}

function NewProjectControl({
  trigger,
  hero: _hero = false,
}: {
  trigger: (open: () => void) => React.ReactNode;
  hero?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();

  function add() {
    const v = name.trim();
    if (!v) return;
    start(async () => {
      const res = await createProjectNode({
        name: v,
        kind: "project",
        parentId: null,
      });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      const newId = res.id;
      setName("");
      setOpen(false);
      router.push(`/projects?p=${newId}` as Route);
      router.refresh();
    });
  }

  if (!open) {
    return <>{trigger(() => setOpen(true))}</>;
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-pill p-1.5"
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder="Project name"
        maxLength={160}
        disabled={pending}
        className="bg-transparent px-2.5 py-1 text-[13.5px] outline-none flex-1"
        style={{ minWidth: 220 }}
      />
      <button
        type="button"
        onClick={add}
        disabled={pending || !name.trim()}
        aria-label="Save"
        className="size-7 inline-flex items-center justify-center rounded-full bg-altus-red text-white hover:opacity-90 disabled:opacity-40"
        style={{
          background:
            "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
        }}
      >
        <Check size={14} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        aria-label="Cancel"
        className="size-7 inline-flex items-center justify-center rounded-full hover:bg-surface-soft text-ink-muted"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ───────────────────────────────────────────────────── Empty state ─ */

function EmptyState() {
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline px-12 py-20 text-center max-w-[680px] mx-auto mt-10 relative overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(15, 23, 42, 0.04), 0 16px 40px -16px rgba(15, 23, 42, 0.08)",
        opacity: 0,
        animation: "fadeUp 700ms ease-out 200ms forwards",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background:
            "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-altus-red-deep) 35%, transparent 100%)",
        }}
      />
      <div
        className="inline-flex items-center justify-center size-14 rounded-2xl mb-5"
        style={{
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(225, 6, 0, 0.10), transparent 70%)",
          border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, transparent)",
        }}
      >
        <FolderKanban
          size={24}
          strokeWidth={1.8}
          style={{ color: "var(--color-altus-red)" }}
        />
      </div>
      <p
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Build a project tree.
      </p>
      <p className="text-[14px] text-ink-subtle mt-3 max-w-sm mx-auto leading-relaxed">
        A project is the rough shape of an outcome. Break it down into
        milestones, results, and concrete actions — then link tasks to any
        node from the task's form.
      </p>
      <div className="mt-7 flex justify-center">
        <NewProjectButton hero />
      </div>
    </div>
  );
}
