import type { ReactNode } from "react";
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
export function AdminShell({
  children,
  adminName,
  adminEmail,
  avatarUrl,
}: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader
        adminName={adminName}
        adminEmail={adminEmail}
        avatarUrl={avatarUrl}
      />
      <AdminMobileBar adminName={adminName} adminEmail={adminEmail} />
      <main className="flex-1 min-w-0 px-8 py-8 max-md:px-4 max-md:py-6">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
