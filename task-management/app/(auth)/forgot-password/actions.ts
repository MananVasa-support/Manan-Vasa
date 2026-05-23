"use server";

import { z } from "zod";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { sendResetPasswordEmail } from "@/lib/email/resend";

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
});

function requireSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  return "https://altus-corp-dashboard.vercel.app";
}

/**
 * Send a password-reset link to `email` (privacy: we always return ok
 * to the client so attackers can't enumerate registered emails). But
 * unlike the previous version we now:
 *
 * - validate the input with Zod
 * - distinguish "user doesn't exist" (return ok, log nothing) from
 *   "Firebase/Resend is broken" (return ok, log loudly to console so
 *   the operator can find it in logs)
 *
 * The form unconditionally renders "Check your inbox" either way —
 * but a real backend failure no longer disappears silently.
 */
export async function requestPasswordReset(
  emailInput: string,
): Promise<{ ok: true }> {
  const parsed = RequestSchema.safeParse({ email: emailInput });
  if (!parsed.success) {
    // Bad input — bail privately. The client showed the success state
    // already; no need to leak that the email was malformed.
    return { ok: true };
  }
  const email = parsed.data.email;

  try {
    const link = await getFirebaseAdminAuth().generatePasswordResetLink(email, {
      url: `${requireSiteUrl()}/login`,
    });
    const { error } = await sendResetPasswordEmail({ email, resetLink: link });
    if (error) {
      // Email layer (Resend) is broken — operator action needed.
      console.error(
        `[requestPasswordReset] sendResetPasswordEmail failed for ${email}: ${error}`,
      );
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found" || code === "auth/email-not-found") {
      // Privacy-preserving: don't reveal that the email isn't registered.
      // Nothing to log — this is a normal "wrong email" attempt.
      return { ok: true };
    }
    // Anything else means our infra (Firebase env, Resend, network) is
    // misconfigured. Log loudly so it's discoverable in server logs.
    console.error(
      `[requestPasswordReset] unexpected failure for ${email}:`,
      err,
    );
  }
  return { ok: true };
}
