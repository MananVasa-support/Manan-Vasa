import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";

/**
 * Layout for the `(gate)` route group — pages that must stay reachable while a
 * user is blocked by the mandatory weekly-goals fill gate (design §11). It is
 * auth-required (redirects to /login when signed out) but deliberately does NOT
 * run `hasUnfilledWeekGoals`, so the fill screen itself never redirects to
 * itself. Sits OUTSIDE the gated `(app)` group for exactly that reason.
 */
export default async function GateLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
