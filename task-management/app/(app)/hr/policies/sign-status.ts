"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { POLICY_CARDS, isPolicyKey } from "@/lib/hr/policies/registry";

/**
 * The CURRENT user's own policy-signing status — which published policies they
 * have already SIGNED (and when). Lets the "All Policies" popup badge each card
 * ✓ Signed vs "Sign", and lets a single policy page show "You signed this on …"
 * instead of prompting to sign again. Self-scoped: no HR gate, everyone can see
 * their own status (mirrors the source-of-truth query in
 * app/(app)/hr/record/policy-status.ts, but for `me`).
 */
export interface MyPolicySignStatus {
  /** policy key → ISO signedAt, for every policy the caller has already signed. */
  signed: Record<string, string>;
}

export async function getMyPolicySignStatus(): Promise<MyPolicySignStatus> {
  const me = await requireUser();
  const keys = POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key)).map((c) => c.key);
  if (keys.length === 0) return { signed: {} };

  const rows = await db
    .select({ typeKey: documentInstances.typeKey, signedAt: documentSignatures.signedAt })
    .from(documentInstances)
    .innerJoin(
      documentSignatures,
      and(
        eq(documentSignatures.docId, documentInstances.id),
        eq(documentSignatures.docKind, "letter"),
        eq(documentSignatures.status, "signed"),
      ),
    )
    .where(
      and(
        eq(documentInstances.employeeId, me.id),
        inArray(documentInstances.typeKey, keys),
      ),
    );

  const signed: Record<string, string> = {};
  for (const r of rows) {
    if (!r.typeKey) continue;
    const iso = (r.signedAt ?? new Date()).toISOString();
    // Keep the earliest signed timestamp if a key somehow has more than one.
    const existing = signed[r.typeKey];
    if (!existing || iso < existing) signed[r.typeKey] = iso;
  }
  return { signed };
}
