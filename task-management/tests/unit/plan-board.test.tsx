// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";

// The board imports the server actions module, which pulls in server-only +
// @/lib/db (env validation at import). Stub the whole action surface so the
// component can mount in jsdom — the actions themselves are covered elsewhere.
vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/goals/plan/actions", () => ({
  addWeeklyGoalToPlan: vi.fn(),
  addCascadeGoalToPlan: vi.fn(),
  addTaskToPlan: vi.fn(),
  addUnfinishedToPlan: vi.fn(),
  addAdhocToPlan: vi.fn(),
  abandonTask: vi.fn(),
  reorderPlan: vi.fn(async () => ({ ok: true })),
  removePlanItem: vi.fn(async () => ({ ok: true })),
  setItemProgress: vi.fn(async () => ({ ok: true })),
  startMyDay: vi.fn(async () => ({ ok: true })),
}));

import { PlanBoard } from "@/components/goals/plan/plan-board";
import type { PlanItem, PlanSources, SourceItem } from "@/components/goals/plan/types";

const TODAY = "2026-08-11";

afterEach(cleanup);

function src(over: Partial<SourceItem> & { id: string; kind: SourceItem["kind"] }): SourceItem {
  return { title: `Item ${over.id}`, subtitle: null, meta: null, added: false, ...over };
}

function emptySources(): PlanSources {
  return { weekly: [], monthly: [], quarterly: [], yearly: [], task: [], unfinished: [] };
}

function sources(): PlanSources {
  return {
    ...emptySources(),
    monthly: [src({ id: "g1", kind: "monthly", title: "Grow retainer revenue" })],
    weekly: [src({ id: "w1", kind: "weekly", title: "Ship the pricing page" })],
    task: [
      src({
        id: "t1",
        kind: "task",
        title: "Chase the Acme invoice",
        taskNo: 1023,
        project: "Acme Corp",
        dueYmd: "2026-08-05",
        priority: "imp_urgent",
        status: "on_hold",
      }),
      src({
        id: "t2",
        kind: "task",
        title: "Draft the Q3 deck",
        taskNo: 1044,
        project: "Internal",
        dueYmd: "2026-09-30",
        priority: "not_imp_not_urgent",
        status: "not_started",
      }),
    ],
    unfinished: [src({ id: "u1", kind: "unfinished", title: "Reconcile petty cash", originKind: "task" })],
  };
}

function plan(): PlanItem[] {
  return [
    { id: "p1", title: "Ship the pricing page", subtitle: null, origin: "goal_related", kind: "weekly", done: true },
    { id: "p2", title: "Chase the Acme invoice", subtitle: "Acme Corp", origin: "standalone", kind: "task", done: false },
    { id: "p3", title: "Write the retro", subtitle: null, origin: "standalone", kind: "adhoc", done: false },
  ];
}

function renderBoard(over: Partial<React.ComponentProps<typeof PlanBoard>> = {}) {
  return render(
    <PlanBoard
      initialPlan={plan()}
      sources={sources()}
      minItems={3}
      isManager={false}
      initialPhase="plan"
      ymd={TODAY}
      {...over}
    />,
  );
}

/**
 * Scope queries to one half of the board. A task that has been planned shows on
 * BOTH sides by design (left as a commitment, right as "On Today"), so an
 * unscoped getByText is genuinely ambiguous — that duplication is the feature,
 * not a bug in the fixture.
 */
function panel(name: RegExp): HTMLElement {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}
const availableWork = () => panel(/available work/i);

/** The three compact filter selects, in render order: Due · Priority · Status. */
function filterSelects() {
  const [due, priority, status] = within(availableWork()).getAllByRole("combobox");
  return { due: due!, priority: priority!, status: status! };
}

describe("PlanBoard — the two halves", () => {
  it("renders Today's Plan and Available Work as separate sections", () => {
    renderBoard();
    expect(screen.getByRole("heading", { name: /today's plan/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /available work/i })).toBeDefined();
  });

  it("shows completion progress as done / total", () => {
    renderBoard();
    // One of the three planned items is done.
    expect(screen.getByText("1 / 3")).toBeDefined();
  });

  it("groups Available Work into Goals, Goal Tasks, WMS Tasks and Carryover", () => {
    renderBoard();
    for (const label of ["Goals", "Goal Tasks", "WMS Tasks", "Carryover"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") })).toBeDefined();
    }
  });
});

describe("PlanBoard — explicit source tags", () => {
  it("labels every source family in words, not colour", () => {
    renderBoard();
    // GOAL appears for the cascade goal, GOAL TASK for the weekly, WMS TASK for
    // the tasks, CARRYOVER for the unfinished row — on both sides of the board.
    expect(screen.getAllByText("GOAL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GOAL TASK").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WMS TASK").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CARRYOVER").length).toBeGreaterThan(0);
  });

  it("tags a planned ad-hoc commitment as AD-HOC", () => {
    renderBoard();
    expect(screen.getAllByText("AD-HOC").length).toBe(1);
  });

  it("shows a carryover's ORIGINAL source alongside the carryover tag", () => {
    renderBoard();
    const carryoverRow = screen.getByText("Reconcile petty cash").closest("div.group");
    expect(carryoverRow).not.toBeNull();
    expect(within(carryoverRow as HTMLElement).getByText("CARRYOVER")).toBeDefined();
    expect(within(carryoverRow as HTMLElement).getByText("WMS TASK")).toBeDefined();
  });
});

describe("PlanBoard — WMS task detail", () => {
  it("shows task id, project, due state, priority and status on the row", () => {
    renderBoard();
    const row = within(availableWork())
      .getByText("Chase the Acme invoice")
      .closest("div.group") as HTMLElement;
    expect(within(row).getByText("#1023")).toBeDefined();
    expect(within(row).getByText("Acme Corp")).toBeDefined();
    expect(within(row).getByText(/Overdue · 5 Aug/)).toBeDefined();
    expect(within(row).getByText("Critical")).toBeDefined();
    expect(within(row).getByText("On Hold")).toBeDefined();
  });

  it("offers Add to Today on every available row", () => {
    renderBoard();
    expect(screen.getAllByRole("button", { name: /add .* to today's plan/i }).length).toBe(5);
  });
});

describe("PlanBoard — WMS filters", () => {
  it("narrows the WMS list by due date and reports the narrowing", () => {
    renderBoard();
    fireEvent.change(filterSelects().due, { target: { value: "overdue" } });
    const work = within(availableWork());
    // Only the overdue task survives; the section header states "1 of 2".
    expect(work.queryByText("Draft the Q3 deck")).toBeNull();
    expect(work.getByText("Chase the Acme invoice")).toBeDefined();
    expect(work.getByText("1 of 2")).toBeDefined();
  });

  it("filters by priority without touching the other source groups", () => {
    renderBoard();
    fireEvent.change(filterSelects().priority, { target: { value: "imp_urgent" } });
    const work = within(availableWork());
    expect(work.queryByText("Draft the Q3 deck")).toBeNull();
    expect(work.getByText("Chase the Acme invoice")).toBeDefined();
    // Goals / Goal Tasks / Carryover are untouched by the WMS filter.
    expect(work.getByText("Grow retainer revenue")).toBeDefined();
    expect(work.getByText("Ship the pricing page")).toBeDefined();
    expect(work.getByText("Reconcile petty cash")).toBeDefined();
  });

  it("can empty the list and says so, then clears back", () => {
    renderBoard();
    // Status → Completed. No open task is completed, so the list empties.
    fireEvent.change(filterSelects().status, { target: { value: "completed" } });
    expect(within(availableWork()).getByText(/no tasks match these filters/i)).toBeDefined();

    fireEvent.click(within(availableWork()).getByRole("button", { name: /clear filters/i }));
    expect(within(availableWork()).getByText("Chase the Acme invoice")).toBeDefined();
  });
});

describe("PlanBoard — the Start My Day gate", () => {
  it("stays disabled until the daily minimum is planned", () => {
    renderBoard({ initialPlan: [], sources: emptySources(), minItems: 3 });
    const start = screen.getByRole("button", { name: /start my day/i }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByText(/3 to go/i)).toBeDefined();
  });

  it("enables once the minimum is met", () => {
    renderBoard({ minItems: 3 });
    const start = screen.getByRole("button", { name: /start my day/i }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
  });

  it("invites the user to plan when nothing is committed yet", () => {
    renderBoard({ initialPlan: [], sources: emptySources() });
    expect(screen.getByText(/nothing planned yet/i)).toBeDefined();
  });
});
