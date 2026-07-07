import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getOvertimeDashboard } from "@/lib/queries/overtime";
import { getReimbursementDashboard } from "@/lib/queries/reimbursement-dashboard";
import { formatInr } from "@/lib/format";
import { loadDccScope } from "@/lib/dcc/access";
import { listDccPeople, listItemsForOwners, listEntriesForOwners } from "@/lib/queries/dcc";
import { scheduledDueOn, isoDate } from "@/lib/dcc/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Stat = { label: string; value: string };
type Person = { name: string; primary: string; secondary: string };
type Dash = { title: string; periodLabel: string; stats: Stat[]; people: Person[] };

function currentMonth(): { iso: string; label: string } {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const iso = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-01`;
  const label = ist.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { iso, label };
}

const dccKey = (itemId: string, date: string) => `${itemId}|${date}`;
function dObj(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(y!, (m ?? 1) - 1, d ?? 1); }

/**
 * Team DCC compliance leaderboard — mirrors the web DccDashboard derivation
 * (today done/due, 7-day completion %, streak) so the two never diverge.
 * Ranked by the 7-day completion %. Scope from loadDccScope (super → all, else
 * → own downline).
 */
async function dccDashboard(meId: string, me: Parameters<typeof loadDccScope>[0]): Promise<Dash> {
  const scope = await loadDccScope(me);
  const ids = [...scope.visibleIds];
  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 27); // 4-week window
  const [people, items, entries] = await Promise.all([
    listDccPeople(ids),
    listItemsForOwners(ids),
    listEntriesForOwners(ids, isoDate(from)),
  ]);

  const entryMap = new Map<string, (typeof entries)[number]>();
  for (const e of entries) entryMap.set(dccKey(e.itemId, e.entryDate), e);
  const itemsByOwner = new Map<string, (typeof items)[number][]>();
  for (const it of items) { const l = itemsByOwner.get(it.ownerEmployeeId); if (l) l.push(it); else itemsByOwner.set(it.ownerEmployeeId, [it]); }

  const last7: string[] = [];
  { const d = dObj(today); d.setDate(d.getDate() - 6); for (let i = 0; i < 7; i++) { last7.push(isoDate(d)); d.setDate(d.getDate() + 1); } }

  let dueTotal = 0, filledTotal = 0, onTrack = 0, peopleDueTotal = 0;
  const rows = people.map((p) => {
    const own = itemsByOwner.get(p.id) ?? [];
    const dueToday = own.filter((it) => scheduledDueOn(it, dObj(today)));
    let doneToday = 0, filledToday = 0;
    for (const it of dueToday) {
      const e = entryMap.get(dccKey(it.id, today));
      if (e && (e.status || e.valueNumber || e.note)) filledToday++;
      if ((e?.status ?? "").toLowerCase() === "done") doneToday++;
    }
    let due7 = 0, done7 = 0;
    for (const iso of last7) for (const it of own) {
      if (!scheduledDueOn(it, dObj(iso))) continue;
      due7++;
      if ((entryMap.get(dccKey(it.id, iso))?.status ?? "").toLowerCase() === "done") done7++;
    }
    let streak = 0;
    { const sd = dObj(today); for (let i = 0; i < 30; i++) { const iso = isoDate(sd); const due = own.filter((it) => scheduledDueOn(it, sd)); if (due.length > 0) { const allFilled = due.every((it) => { const e = entryMap.get(dccKey(it.id, iso)); return e && (e.status || e.valueNumber || e.note); }); if (!allFilled) break; streak++; } sd.setDate(sd.getDate() - 1); } }
    const weekPct = due7 ? Math.round((done7 / due7) * 100) : -1;
    dueTotal += dueToday.length; filledTotal += filledToday;
    if (dueToday.length > 0) { peopleDueTotal++; if (filledToday >= dueToday.length) onTrack++; }
    return { p, doneToday, dueToday: dueToday.length, weekPct, streak };
  });

  const ranked = rows.filter((r) => r.weekPct >= 0).sort((a, b) => b.weekPct - a.weekPct);
  return {
    title: scope.isSuper ? "Compliance" : "Team Compliance",
    periodLabel: `${people.length} ${people.length === 1 ? "person" : "people"} · 7-day`,
    stats: [
      { label: "Filled today", value: `${dueTotal ? Math.round((filledTotal / dueTotal) * 100) : 0}%` },
      { label: "On track", value: `${onTrack}/${peopleDueTotal}` },
    ],
    people: ranked.map((r) => ({
      name: r.p.name,
      primary: `${r.weekPct}%`,
      secondary: `today ${r.doneToday}/${r.dueToday}${r.streak > 0 ? ` · streak ${r.streak}` : ""}`,
    })),
  };
}

/**
 * GET /api/mobile/team-dashboard/[type] — a normalized admin team dashboard
 * (overtime · reimbursements). Reuses the web dashboard queries so the two never
 * diverge; scope (admins → all, else → own/team) is enforced inside those
 * queries. Returns { title, periodLabel, stats[], people[] } for one screen.
 */
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { type } = await ctx.params;

  let dash: Dash;
  if (type === "overtime") {
    const { iso, label } = currentMonth();
    const d = await getOvertimeDashboard({ employeeId: me.id, isAdmin: me.isAdmin, monthStartISO: iso, monthLabel: label });
    dash = {
      title: "Overtime",
      periodLabel: label,
      stats: [
        { label: "Pending", value: String(d.pendingCount) },
        { label: "People", value: String(d.people.length) },
      ],
      people: d.people.map((p) => ({
        name: p.employeeName,
        primary: `${p.monthHours}h this month`,
        secondary: `${p.allTimeHours}h all-time`,
      })),
    };
  } else if (type === "reimbursements") {
    const d = await getReimbursementDashboard({ employeeId: me.id, isAdmin: me.isAdmin });
    dash = {
      title: "Reimbursements",
      periodLabel: "",
      stats: [
        { label: "Approved", value: formatInr(d.approved.amount) },
        { label: "Pending", value: formatInr(d.pending.amount) },
        { label: "Paid", value: formatInr(d.paid.amount) },
      ],
      people: d.byPerson.map((p) => ({ name: p.name, primary: formatInr(p.amount), secondary: "" })),
    };
  } else if (type === "dcc") {
    dash = await dccDashboard(me.id, me);
  } else {
    return NextResponse.json({ error: "unknown-dashboard" }, { status: 404, headers: MOBILE_CORS });
  }

  return NextResponse.json(dash, { headers: MOBILE_CORS });
}
