import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { AdminShell } from "@/components/admin/admin-shell";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";

// Never cache the admin shell — it is per-user (name/email/avatar) and must be
// resolved fresh on every request so one user's render can never be served to
// another.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Admins only. Non-admins (doers) are bounced cleanly to the hub instead of
  // hitting a throwing 403 boundary that leaves them stuck with no way out.
  const me = await requireUser();
  if (!me.isAdmin) {
    redirect("/hub");
  }
  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <AdminShell
        adminName={me.name}
        adminEmail={me.email}
        avatarUrl={me.avatarUrl}
      >
        {children}
      </AdminShell>
    </>
  );
}
