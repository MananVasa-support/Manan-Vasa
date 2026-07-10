import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireDossierAccess, canAccessEmployeeDossier } from "@/lib/dossier/access";
import { getOnboarding } from "@/lib/queries/onboarding";
import { OnboardingForm } from "@/components/dossier/onboarding-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const access = await requireDossierAccess();
  const sp = await searchParams;
  const emp = typeof sp.emp === "string" ? sp.emp : null;
  const targetId = emp ?? access.me.id;
  if (!canAccessEmployeeDossier(access, targetId)) redirect("/dossier");

  const data = await getOnboarding(targetId);
  if (!data) redirect(access.isAdmin ? "/dossier" : "/hub");

  const backHref = access.isAdmin && emp ? `/dossier?emp=${targetId}` : "/dossier";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              <ClipboardList size={13} strokeWidth={2.6} /> Employees · Dossier · Onboarding
            </span>
          </div>
          <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,42px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            Onboarding Form
          </h1>
          <p className="mt-1.5 max-w-[74ch] text-[15.5px] font-medium text-ink-muted">
            Your details, previous employment, background verification, addresses, ID and bank
            details. Files can be attached in each section — save a draft anytime and submit when done.
          </p>
        </header>
        <OnboardingForm initial={data} backHref={backHref} />
      </main>
      <DashboardFooter />
    </>
  );
}
