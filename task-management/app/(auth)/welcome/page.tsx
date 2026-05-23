import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Route } from "next";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { readSession } from "@/lib/auth/session";
import { WelcomeCelebration } from "@/components/auth/welcome-celebration";
import { InstallPushBanner } from "@/components/pwa/install-banner";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Only accept same-origin paths starting with `/` (and not `//` which would
 * be protocol-relative). Anything else falls back to `/` so a forged ?next=
 * can't redirect a freshly-signed-in user off-site.
 */
function sanitizeNext(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const claims = await readSession();
  if (!claims) redirect("/login" as Route);

  const emp = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, claims.uid),
  });

  if (!emp) redirect("/login" as Route);

  // First-ever visit: stamp joinedAt so the admin "Invited/Joined" status
  // pill and the pending-invites count remain accurate. Subsequent visits
  // skip the write but still render the celebration — /welcome is now the
  // every-login landing rather than a one-time onboarding screen.
  if (emp.joinedAt === null) {
    await db
      .update(employees)
      .set({ joinedAt: new Date() })
      .where(eq(employees.id, emp.id));
  }

  const sp = await searchParams;
  const nextDestination = sanitizeNext(sp["next"]);
  const firstName = emp.name.split(" ")[0] ?? emp.name;

  return (
    <div className="w-full" style={{ maxWidth: 720, margin: "0 auto" }}>
      <WelcomeCelebration
        firstName={firstName}
        isAdmin={emp.isAdmin}
        nextDestination={nextDestination}
      />
      <InstallPushBanner />
    </div>
  );
}
