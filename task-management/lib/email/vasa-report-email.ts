import "server-only";
import { getResend, FROM, clampSubject, companyBcc } from "./resend";

const BRAND = "#E10600";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Mail ONE Interpersonal Balance snapshot as an .xlsx attachment.
 *
 * The buffer is passed in already built by the caller from
 * `lib/accounts/vasa-report`, so the file that lands in the inbox is the same
 * bytes the Download button produces for that snapshot. Nothing is re-derived
 * here — a second grid builder is exactly how "the emailed report" and "the
 * downloaded report" start disagreeing.
 *
 * Returns a plain ok/err rather than throwing: Manual Save must still have
 * SAVED even when the mail leg fails, and the caller reports the two outcomes
 * separately.
 */
export async function sendVasaReportEmail(args: {
  to: string;
  snapshotLabel: string;
  quarter: string;
  filename: string;
  xlsx: Buffer;
  senderName?: string | null;
  partyCount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "Email is not configured (no Resend key)." };

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(
        `Vasa Family Interpersonal Balance — ${args.snapshotLabel} (${args.quarter})`,
      ),
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Accounts · Vasa Family</div>
          <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">Interpersonal Balance</h1>
        </div>
        <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
          Attached is the Interpersonal Balance report as on
          <strong>${esc(args.snapshotLabel)}</strong> (${esc(args.quarter)}),
          covering ${args.partyCount} part${args.partyCount === 1 ? "y" : "ies"}.
        </p>
        <p style="font-size:13px;line-height:1.6;margin:0 0 14px;color:#555">
          A cell is what the row party is owed by the column party; a negative
          figure means the row party owes. The Net column is the party's overall
          position for this snapshot.
        </p>
        ${args.senderName ? `<p style="font-size:12.5px;color:#777;margin:0">Sent by ${esc(args.senderName)}.</p>` : ""}
        <p style="margin-top:24px;color:#999;font-size:11px">Sent from the Altus Corp Dashboard.</p>
      </div>`,
      attachments: [{ filename: args.filename, content: args.xlsx }],
      ...companyBcc(),
    });
    if (error) return { ok: false, error: typeof error === "string" ? error : "Send failed." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
