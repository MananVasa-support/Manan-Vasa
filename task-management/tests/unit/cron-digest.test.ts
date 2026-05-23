import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OverdueTask } from "@/lib/queries/overdue";

// ── Mock dependencies BEFORE importing the route ─────────────────────
// Vitest hoists vi.mock(), so the mocks are in place when the route
// imports its dependencies.

// `lib/notifications/channel-prefs.ts` and `lib/slack/dispatch.ts` both
// `import "server-only"` at the top.  The real module throws when
// loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

const {
  listOverdueByEmployee,
  sendDigestEmail,
  dbInsert,
  dbSelect,
  selectFromMock,
  selectWhereMock,
  insertValuesMock,
} = vi.hoisted(() => ({
  listOverdueByEmployee: vi.fn(),
  sendDigestEmail: vi.fn(),
  dbInsert: vi.fn(),
  dbSelect: vi.fn(),
  selectFromMock: vi.fn(),
  selectWhereMock: vi.fn(),
  insertValuesMock: vi.fn(),
}));

vi.mock("@/lib/queries/overdue", () => ({
  listOverdueByEmployee,
}));

vi.mock("@/lib/email/resend", () => ({
  sendDigestEmail,
}));

// M4 Commit 3a — cron now also dispatches a Slack digest.  Stub the
// recipient prefs lookup + the send so the legacy email-focused tests
// keep their assertions.
vi.mock("@/lib/notifications/channel-prefs", () => ({
  getRecipientChannelPrefs: vi.fn(async () => null),
}));
vi.mock("@/lib/slack/dispatch", () => ({
  sendSlackDigest: vi.fn(async () => "skip" as const),
}));
vi.mock("@/lib/whatsapp/dispatch", () => ({
  sendWhatsAppDigest: vi.fn(async () => "skip" as const),
}));

// M5 — handler now consults `org_settings.digest_hour_ist` and skips
// when the current IST hour doesn't match.  Default the mock to "match"
// so the legacy tests below keep exercising the send path; the off-hour
// behavior gets its own explicit test.
const getOrgSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/org-settings", () => ({
  getOrgSettings: getOrgSettingsMock,
}));

function currentIstHour(): number {
  const istMs = Date.now() + 330 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

// Mock @/lib/db so the route can: db.insert(notifications).values({...})
// and db.select({...}).from(employees).where(...).
vi.mock("@/lib/db", () => {
  dbInsert.mockImplementation(() => ({
    values: insertValuesMock,
  }));
  dbSelect.mockImplementation(() => ({
    from: selectFromMock,
  }));
  selectFromMock.mockImplementation(() => ({
    where: selectWhereMock,
  }));
  return {
    db: {
      insert: dbInsert,
      select: dbSelect,
    },
    employees: { id: "employees.id", email: "employees.email", name: "employees.name" },
    notifications: { __table: "notifications" },
  };
});

// drizzle-orm — the route only uses `inArray`; we stub it as a marker.
vi.mock("drizzle-orm", () => ({
  inArray: (col: unknown, values: unknown) => ({ __inArray: { col, values } }),
}));

// next/server's NextResponse — give it a minimal Response-shaped stub.
vi.mock("next/server", () => ({
  NextResponse: {
    json: <T,>(body: T, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────
function mkRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/digest", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

function mkOverdueTask(
  over: Partial<OverdueTask> & { id: string; doerId: string },
): OverdueTask {
  return {
    subject: `Task ${over.id}`,
    dueAt: new Date("2026-05-10T00:00:00Z"),
    doerName: "Doer One",
    daysOverdue: 4,
    ...over,
  } as OverdueTask;
}

beforeEach(() => {
  listOverdueByEmployee.mockReset();
  sendDigestEmail.mockReset();
  dbInsert.mockClear();
  dbSelect.mockClear();
  selectFromMock.mockClear();
  selectWhereMock.mockReset();
  insertValuesMock.mockReset();
  // Default: notification inserts resolve to nothing.
  insertValuesMock.mockResolvedValue(undefined);
  // Default: recipient lookup returns no rows.
  selectWhereMock.mockResolvedValue([]);
  // Default: settings say "send right now" so the legacy tests proceed.
  getOrgSettingsMock.mockReset();
  getOrgSettingsMock.mockResolvedValue({
    id: 1,
    digestHourIst: currentIstHour(),
  });
  process.env.CRON_SECRET = "test-secret-1234567890abcdef";
});

describe("POST /api/cron/digest", () => {
  it("returns 401 without the correct Bearer token", async () => {
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest()); // no auth header
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(listOverdueByEmployee).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset (don't leak that fact)", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong Bearer token", async () => {
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("short-circuits to processed=0 when no employees have overdue tasks", async () => {
    listOverdueByEmployee.mockResolvedValue(new Map());

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      processed: number;
      sent: number;
      skipped: number;
    };
    expect(body).toEqual({ ok: true, processed: 0, sent: 0, skipped: 0 });
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("sends one email per employee with overdue tasks and returns the right counts", async () => {
    const e1 = "emp-1";
    const e2 = "emp-2";
    const overdueByEmp = new Map<string, OverdueTask[]>([
      [
        e1,
        [
          mkOverdueTask({ id: "t1", doerId: e1, subject: "Send NOC" }),
          mkOverdueTask({ id: "t2", doerId: e1, subject: "Chase KYC" }),
        ],
      ],
      [e2, [mkOverdueTask({ id: "t3", doerId: e2, subject: "Audit reconcile" })]],
    ]);
    listOverdueByEmployee.mockResolvedValue(overdueByEmp);

    selectWhereMock.mockResolvedValue([
      { id: e1, email: "one@vp.com", name: "Doer One" },
      { id: e2, email: "two@vp.com", name: "Doer Two" },
    ]);

    sendDigestEmail.mockResolvedValue({ id: "msg-1", error: null });

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      processed: number;
      sent: number;
      skipped: number;
    };
    expect(body).toEqual({ ok: true, processed: 2, sent: 2, skipped: 0 });
    expect(sendDigestEmail).toHaveBeenCalledTimes(2);

    // One notification row per employee.
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    const insertedRows = insertValuesMock.mock.calls.map(
      (c: unknown[]) => c[0] as Record<string, unknown>,
    );
    expect(insertedRows.every((r) => r.kind === "overdue_digest")).toBe(true);
    const titles = insertedRows.map((r) => r.title as string).sort();
    expect(titles).toEqual(["You have 1 overdue task", "You have 2 overdue tasks"]);

    // Confirm the recipients we sent to + that overdueTasks are passed.
    const callArgs = sendDigestEmail.mock.calls.map(
      (c: unknown[]) =>
        c[0] as {
          recipient: { email: string; name: string };
          overdueTasks: OverdueTask[];
        },
    );
    const recipients = callArgs.map((a) => a.recipient.email).sort();
    expect(recipients).toEqual(["one@vp.com", "two@vp.com"]);
    const e1Call = callArgs.find((a) => a.recipient.email === "one@vp.com")!;
    expect(e1Call.overdueTasks).toHaveLength(2);
    const e2Call = callArgs.find((a) => a.recipient.email === "two@vp.com")!;
    expect(e2Call.overdueTasks).toHaveLength(1);
  });

  it("continues on email failure and reports it in 'sent' but not 'processed'", async () => {
    const e1 = "emp-1";
    listOverdueByEmployee.mockResolvedValue(
      new Map<string, OverdueTask[]>([
        [e1, [mkOverdueTask({ id: "t1", doerId: e1 })]],
      ]),
    );
    selectWhereMock.mockResolvedValue([
      { id: e1, email: "one@vp.com", name: "Doer One" },
    ]);
    sendDigestEmail.mockResolvedValue({ id: null, error: "Resend exploded" });

    // Silence the console.error from the error branch.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      processed: number;
      sent: number;
      skipped: number;
    };
    // processed counts attempted; sent counts successful.
    expect(body.processed).toBe(1);
    expect(body.sent).toBe(0);

    errSpy.mockRestore();
  });

  it("supports GET too (Vercel Cron uses GET by default)", async () => {
    listOverdueByEmployee.mockResolvedValue(new Map());
    const { GET } = await import("@/app/api/cron/digest/route");
    const res = await GET(mkRequest("Bearer test-secret-1234567890abcdef"));
    expect(res.status).toBe(200);
  });

  it("skips with ok:true when current IST hour ≠ org_settings.digest_hour_ist", async () => {
    // Pick an hour the current IST clock is guaranteed not to be on.
    const offHour = (currentIstHour() + 6) % 24;
    getOrgSettingsMock.mockResolvedValue({
      id: 1,
      digestHourIst: offHour,
    });

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      skipped: string;
      istHour: number;
      digestHourIst: number;
    };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe("off_hour");
    expect(body.digestHourIst).toBe(offHour);
    expect(body.istHour).not.toBe(offHour);

    // No DB queries, no sends.
    expect(listOverdueByEmployee).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});
