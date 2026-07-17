import { NextResponse } from "next/server";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { weekReportFor } from "@/lib/reports/attendance-report-data";
import { sendWeeklyAttendanceReportEmail } from "@/lib/email/report-emails";
import { weeklyAttendanceReportOn } from "@/lib/reports/flags";

/**
 * Sunday WEEKLY attendance report (Sir's rule 6) — each active employee gets
 * their week's login/logout, late marks, early-leaves, and the ₹ money impact.
 *
 * Registered Sunday (`0 12 * * 0`, ~17:30 IST). DEFAULT OFF via
 * `WEEKLY_ATTENDANCE_REPORT_ON` — a no-op until flipped. Auth: Bearer CRON_SECRET.
 * Per-recipient try/catch. Node runtime (postgres-js).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-14" + "2026-07-20" → "14–20 Jul 2026". */
function weekLabel(startYmd: string, endYmd: string): string {
  const [sy, sm, sd] = startYmd.split("-");
  const [, em, ed] = endYmd.split("-");
  const left = sm === em ? `${Number(sd)}` : `${Number(sd)} ${MONTH[Number(sm) - 1]}`;
  return `${left}–${Number(ed)} ${MONTH[Number(em) - 1]} ${sy}`;
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!weeklyAttendanceReportOn()) {
    return NextResponse.json({ ok: true, skipped: "WEEKLY_ATTENDANCE_REPORT_ON is off" });
  }

  const now = new Date();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const profiles = (await listSalaryProfiles()).filter((p) => p.email);

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const p of profiles) {
    processed++;
    try {
      const report = await weekReportFor(p.employeeId, p.annualCtc > 0 ? p.annualCtc / 12 : 0, now);
      // No working days this week (all off / no punches) → skip the noise.
      if (report.days.length === 0) {
        skipped++;
        continue;
      }
      const res = await sendWeeklyAttendanceReportEmail({
        recipient: { email: p.email, name: p.name },
        weekLabel: weekLabel(report.weekStart, report.weekEnd),
        totals: report.totals,
        days: report.days,
        siteUrl,
      });
      if (res.error) {
        console.error(`[cron/attendance-weekly] send failed for ${p.email}:`, res.error);
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[cron/attendance-weekly] threw for ${p.email}`, err);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}
export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
