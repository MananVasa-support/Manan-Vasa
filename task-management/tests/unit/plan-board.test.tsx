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
    monthly: [src({ id: "g1", kind: "monthly", title: "Grow retainer revenue", subtitle: "Health" })],
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
    unfinished: [
      src({
        id: "u1",
        kind: "unfinished",
        title: "Reconcile petty cash",
        originKind: "task",
        dueLabel: "From 29 Jul",
      }),
    ],
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
 * unscoped getByText is genuinely ambiguous — that duplication is the feature.
 */
function panel(name: RegExp): HTMLElement {
  return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}
const availableWork = () => within(panel(/available work/i));
const todaysPlan = () => within(panel(/today's plan/i));

/** Switch the Available Work panel to a source category. */
function openTab(name: RegExp) {
  fireEvent.click(availableWork().getByRole("tab", { name }));
}

/** The three compact filter selects, in render order: Due · Priority · Status. */
function filterSelects() {
  const [due, priority, status] = availableWork().getAllByRole("combobox");
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
    expect(todaysPlan().getByText("1 / 3")).toBeDefined();
  });

  it("tags each planned item with its source", () => {
    renderBoard();
    expect(todaysPlan().getByText("GOAL TASK")).toBeDefined();
    expect(todaysPlan().getByText("WMS TASK")).toBeDefined();
    expect(todaysPlan().getByText("AD-HOC")).toBeDefined();
  });
});

describe("PlanBoard — Available Work tabs", () => {
  it("offers one tab per source, each with its available count", () => {
    renderBoard();
    const work = availableWork();
    expect(work.getByRole("tab", { name: "Goals, 1 available" })).toBeDefined();
    expect(work.getByRole("tab", { name: "Goal Tasks, 1 available" })).toBeDefined();
    expect(work.getByRole("tab", { name: "WMS Tasks, 2 available" })).toBeDefined();
    expect(work.getByRole("tab", { name: "Carryover, 1 available" })).toBeDefined();
    // The count is visible, not only announced.
    expect(work.getByText("2")).toBeDefined();
  });

  it("shows only the active category, not all four at once", () => {
    renderBoard();
    const work = availableWork();
    // Opens on Goals (the first non-empty tab).
    expect(work.getByText("Grow retainer revenue")).toBeDefined();
    expect(work.queryByText("Ship the pricing page")).toBeNull();
    expect(work.queryByText("Chase the Acme invoice")).toBeNull();
    expect(work.queryByText("Reconcile petty cash")).toBeNull();
  });

  it("switches category on tab click", () => {
    renderBoard();
    openTab(/Goal Tasks/);
    expect(availableWork().getByText("Ship the pricing page")).toBeDefined();
    expect(availableWork().queryByText("Grow retainer revenue")).toBeNull();

    openTab(/WMS Tasks/);
    expect(availableWork().getByText("Chase the Acme invoice")).toBeDefined();
    expect(availableWork().queryByText("Ship the pricing page")).toBeNull();
  });

  it("opens on the first category that has work, not a blank list", () => {
    renderBoard({ sources: { ...emptySources(), task: sources().task } });
    expect(availableWork().getByText("Chase the Acme invoice")).toBeDefined();
  });
});

describe("PlanBoard — row readability", () => {
  it("shows a goal as title + source line", () => {
    renderBoard();
    const row = availableWork().getByText("Grow retainer revenue").closest("div.group") as HTMLElement;
    expect(within(row).getByText("GOAL")).toBeDefined();
    expect(within(row).getByText("Monthly")).toBeDefined();
    expect(within(row).getByText("Health")).toBeDefined();
  });

  it("shows task id, project, due state, priority and status on a WMS row", () => {
    renderBoard();
    openTab(/WMS Tasks/);
    const row = availableWork().getByText("Chase the Acme invoice").closest("div.group") as HTMLElement;
    expect(within(row).getByText("WMS TASK")).toBeDefined();
    expect(within(row).getByText("#1023")).toBeDefined();
    expect(within(row).getByText("Acme Corp")).toBeDefined();
    expect(within(row).getByText("Overdue")).toBeDefined();
    expect(within(row).getByText("5 Aug")).toBeDefined();
    expect(within(row).getByText("Critical")).toBeDefined();
    expect(within(row).getByText("On Hold")).toBeDefined();
  });

  it("names a carryover's original source and the day it came from", () => {
    renderBoard();
    openTab(/Carryover/);
    const row = availableWork().getByText("Reconcile petty cash").closest("div.group") as HTMLElement;
    expect(within(row).getByText("WMS TASK")).toBeDefined();
    expect(within(row).getByText("Carryover from 29 Jul")).toBeDefined();
  });

  it("offers Add to Today on every row of the active category", () => {
    renderBoard();
    openTab(/WMS Tasks/);
    expect(availableWork().getAllByRole("button", { name: /add .* to today's plan/i }).length).toBe(2);
  });
});

describe("PlanBoard — WMS filters", () => {
  it("narrows the WMS list by due date", () => {
    renderBoard();
    openTab(/WMS Tasks/);
    fireEvent.change(filterSelects().due, { target: { value: "overdue" } });
    expect(availableWork().queryByText("Draft the Q3 deck")).toBeNull();
    expect(availableWork().getByText("Chase the Acme invoice")).toBeDefined();
  });

  it("filters by priority without touching the other categories", () => {
    renderBoard();
    openTab(/WMS Tasks/);
    fireEvent.change(filterSelects().priority, { target: { value: "imp_urgent" } });
    expect(availableWork().queryByText("Draft the Q3 deck")).toBeNull();
    expect(availableWork().getByText("Chase the Acme invoice")).toBeDefined();

    // Other tabs are untouched by the WMS filter.
    openTab(/Goals/);
    expect(availableWork().getByText("Grow retainer revenue")).toBeDefined();
  });

  it("can empty the list and says so, then clears back", () => {
    renderBoard();
    openTab(/WMS Tasks/);
    fireEvent.change(filterSelects().status, { target: { value: "completed" } });
    expect(availableWork().getByText(/no tasks match these filters/i)).toBeDefined();

    fireEvent.click(availableWork().getByRole("button", { name: /^clear$/i }));
    expect(availableWork().getByText("Chase the Acme invoice")).toBeDefined();
  });

  it("only shows filters on the WMS tab", () => {
    renderBoard();
    expect(availableWork().queryAllByRole("combobox")).toHaveLength(0);
    openTab(/WMS Tasks/);
    expect(availableWork().getAllByRole("combobox")).toHaveLength(3);
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
