import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_LANDING,
  isWorkspaceId,
} from "@/lib/workspaces";
import { AdminHeader } from "./admin-header";
import { AdminMobileBar } from "./admin-mobile-bar";

type Props = {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
};

/**
 * Admin panel shell. The nav lives in a light frosted TOP header
 * (`AdminHeader`, desktop) — matching the main app header — with the phone
 * layout handled by the sticky `AdminMobileBar` + drawer. The soft body
 * gradients from globals.css show through the main column.
 */
export async function AdminShell({
  children,
  adminName,
  adminEmail,
  avatarUrl,
}: Props) {
  // "Back to app" returns to whichever workspace the admin came in from (the
  // `aw` cookie) — Marketing → /index-hub, Employees → /attendance, etc. —
  // instead of always dropping them into WMS. Falls back to the hub.
  const aw = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const backHref = isWorkspaceId(aw) ? WORKSPACE_LANDING[aw] : "/hub";

  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader
        adminName={adminName}
        adminEmail={adminEmail}
        avatarUrl={avatarUrl}
        backHref={backHref}
      />
      <AdminMobileBar adminName={adminName} adminEmail={adminEmail} backHref={backHref} />
      <main className="flex-1 min-w-0 px-8 py-8 max-md:px-4 max-md:py-6">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
