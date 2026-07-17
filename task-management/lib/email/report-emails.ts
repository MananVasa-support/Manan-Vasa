import { getResend, FROM, companyBcc, clampSubject, errorMessage } from "./resend";

/**
 * Scheduled REPORTING emails (Sir's ruleset): the Sunday weekly attendance
 * report, the monthly attendance statement (1st), and the 12th-of-month slips
 * email (salary + incentive + attendance, as a PDF attachment).
 *
 * Kept OUT of the shared `resend.ts` (which renders React-Email components) — these
 * are simple HTML bodies + a PDF attachment, isolated so the reporting build never
 * risks the transactional mail path. Every sender no-ops when Resend is unconfigured.
 */

type SendResult = { id: string | null; error: string | null };

const BRAND = "#E10600";
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Per-day attendance line for the report tables. */
export interface DayLine {
  date: string; // "Mon 14 Jul"
  inAt: string | null;
  outAt: string | null;
  code: string; // P / H / A …
  late: boolean;
  leftEarly: boolean;
}

export interface AttnTotals {
  presentDays: number;
  lateDays: number;
  earlyDays: number;
  halfDays: number;
  absentDays: number;
  workedHours: number;
  salaryReduced: number;
}

function shell(title: string, sub: string, inner: string, siteUrl?: string): string {
  const cta = siteUrl
    ? `<p style="margin:22px 0 0"><a href="${siteUrl}/attendance" style="background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px">Open Attendance</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Altus Corp</div>
      <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">${title}</h1>
      <div style="color:#666;font-size:14px">${sub}</div>
    </div>
    ${inner}
    ${cta}
    <p style="margin-top:24px;color:#999;font-size:11px">This is an automated report from the Altus Corp Dashboard.</p>
  </div>`;
}

function totalsGrid(t: AttnTotals): string {
  const cell = (label: string, val: string, tone?: string) =>
    `<td style="padding:10px 12px;border:1px solid #eee;border-radius:8px">
       <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px">${label}</div>
       <div style="font-size:20px;font-weight:800;color:${tone ?? "#1a1a1a"}">${val}</div>
     </td>`;
  return `<table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:14px"><tr>
    ${cell("Present", String(t.presentDays))}
    ${cell("Late", String(t.lateDays), t.lateDays ? "#b45309" : undefined)}
    ${cell("Early leave", String(t.earlyDays), t.earlyDays ? "#b45309" : undefined)}
    ${cell("Half days", String(t.halfDays), t.halfDays ? "#b45309" : undefined)}
  </tr><tr>
    ${cell("Absent", String(t.absentDays), t.absentDays ? BRAND : undefined)}
    ${cell("Hours worked", `${t.workedHours.toFixed(1)}h`)}
    ${cell("₹ impact", inr(t.salaryReduced), t.salaryReduced ? BRAND : "#059669")}
    ${cell("", "")}
  </tr></table>`;
}

function dayTable(days: DayLine[]): string {
  if (days.length === 0) return `<p style="color:#888;font-size:13px">No punches recorded in this period.</p>`;
  const rows = days
    .map((d) => {
      const flags = [d.late ? `<span style="color:#b45309;font-weight:700">Late</span>` : "", d.leftEarly ? `<span style="color:#b45309;font-weight:700">Early</span>` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.date}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.inAt ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.outAt ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:700">${d.code}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">${flags}</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:6px">
    <thead><tr>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #eee;font-size:11px;color:#888;text-transform:uppercase">Day</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #eee;font-size:11px;color:#888;text-transform:uppercase">In</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #eee;font-size:11px;color:#888;text-transform:uppercase">Out</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #eee;font-size:11px;color:#888;text-transform:uppercase">Mark</th>
      <th align="left" style="padding:6px 8px;border-bottom:2px solid #eee;font-size:11px;color:#888;text-transform:uppercase">Flags</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** (a) Sunday weekly attendance report. */
export async function sendWeeklyAttendanceReportEmail(args: {
  recipient: { email: string; name: string };
  weekLabel: string;
  totals: AttnTotals;
  days: DayLine[];
  siteUrl?: string;
}): Promise<SendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const inner = `<p style="font-size:14px;margin:0 0 14px">Hi ${args.recipient.name.split(" ")[0]}, here's your attendance for <b>${args.weekLabel}</b> — including late marks, early leaves, and their money impact.</p>
      ${totalsGrid(args.totals)}${dayTable(args.days)}`;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(`Your week's attendance — ${args.weekLabel} — Altus Corp`),
      html: shell("Weekly attendance report", args.weekLabel, inner, args.siteUrl),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** (b) Monthly attendance statement (1st) — carries the query-window + freeze note. */
export async function sendMonthlyAttendanceStatementEmail(args: {
  recipient: { email: string; name: string };
  monthLabel: string;
  totals: AttnTotals;
  days: DayLine[];
  freezeDateLabel: string; // e.g. "2 Aug"
  siteUrl?: string;
}): Promise<SendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const notice = `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#7c2d12">
      Raise any attendance query with <b>Rutvisha</b> (and Rutvisha with Ruchita) by <b>${args.freezeDateLabel}</b>. After that this month's attendance is <b>frozen</b> and cannot be changed.
    </div>`;
    const inner = `<p style="font-size:14px;margin:0 0 14px">Hi ${args.recipient.name.split(" ")[0]}, here is your attendance statement for <b>${args.monthLabel}</b>.</p>
      ${notice}${totalsGrid(args.totals)}${dayTable(args.days)}`;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(`Attendance statement — ${args.monthLabel} — Altus Corp`),
      html: shell("Monthly attendance statement", args.monthLabel, inner, args.siteUrl),
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** Sunday manager-rollup goals report — PDF attached (Sir #27). */
export async function sendGoalsRollupEmail(args: {
  recipient: { email: string; name: string };
  managerName: string;
  weekLabel: string;
  notWritten: number;
  total: number;
  teamAvg: number;
  pdf: Buffer;
  filename: string;
}): Promise<SendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const flag = args.notWritten > 0
      ? `<span style="color:${BRAND};font-weight:800">${args.notWritten} of ${args.total} wrote no goals</span>`
      : `<span style="color:#059669;font-weight:800">all ${args.total} wrote goals</span>`;
    const inner = `<p style="font-size:14px;margin:0 0 12px">Weekly goals review for <b>${args.managerName}</b>'s team — week of <b>${args.weekLabel}</b>.</p>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin:6px 0"><tr>
        <td style="padding:12px 14px;border:1px solid #eee;border-radius:8px"><div style="font-size:11px;color:#888;text-transform:uppercase">Team avg (last week)</div><div style="font-size:24px;font-weight:800">${args.teamAvg}%</div></td>
        <td style="padding:12px 14px;border:1px solid #eee;border-radius:8px"><div style="font-size:11px;color:#888;text-transform:uppercase">Not written</div><div style="font-size:16px;font-weight:700;margin-top:6px">${flag}</div></td>
      </tr></table>
      <p style="font-size:12.5px;color:#666;margin-top:10px">Full breakdown (per person, last week % vs next week goals) is attached.</p>`;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(`Weekly goals — ${args.managerName}'s team — ${args.weekLabel} — Altus Corp`),
      html: shell("Weekly goals review", `${args.managerName}'s team`, inner),
      attachments: [{ filename: args.filename, content: args.pdf }],
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}

/** (c) 12th-of-month slips email — salary + incentive + attendance PDF attached. */
export async function sendMonthlySlipsEmail(args: {
  recipient: { email: string; name: string };
  monthLabel: string;
  totalEarnings: number;
  pdf: Buffer;
  filename: string;
  siteUrl?: string;
}): Promise<SendResult> {
  try {
    const resend = getResend();
    if (!resend) return { id: null, error: null };
    const inner = `<p style="font-size:14px;margin:0 0 12px">Hi ${args.recipient.name.split(" ")[0]}, your earnings statement for <b>${args.monthLabel}</b> is attached — it covers your salary, incentives, and attendance for the month.</p>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;margin:6px 0 4px"><tr>
        <td style="padding:12px 14px;border:1px solid #eee;border-radius:8px">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px">Total earnings</div>
          <div style="font-size:24px;font-weight:800;color:#059669">${inr(args.totalEarnings)}</div>
        </td>
      </tr></table>
      <p style="font-size:12.5px;color:#666;margin-top:10px">The attached PDF is your official salary + incentive + attendance slip. Keep it for your records.</p>`;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.recipient.email,
      subject: clampSubject(`Your ${args.monthLabel} salary, incentive & attendance slip — Altus Corp`),
      html: shell("Monthly earnings statement", args.monthLabel, inner, args.siteUrl),
      attachments: [{ filename: args.filename, content: args.pdf }],
      ...companyBcc(),
    });
    if (error) return { id: null, error: error.message };
    return { id: data?.id ?? null, error: null };
  } catch (err) {
    return { id: null, error: errorMessage(err) };
  }
}
