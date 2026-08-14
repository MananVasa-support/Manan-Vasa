import type { ReactNode } from "react";
import { requireCandidate } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

/**
 * The candidate route group — OUTSIDE `(app)`, so it never inherits the employee
 * nav/gates. Gated to candidate guest-accounts only (a normal employee is
 * bounced to /hub; a logged-out visitor is bounced to /login by proxy + the
 * requireCandidate session check).
 */
export default async function CandidateLayout({ children }: { children: ReactNode }) {
  await requireCandidate();
  return <div className="min-h-dvh bg-[#faf9fb]">{children}</div>;
}
