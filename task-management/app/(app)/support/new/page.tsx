import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireHrSupport } from "@/lib/hr/flag";
import { TicketComposer } from "@/components/hr/ticket-composer/ticket-composer";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export default async function NewTicketPage() {
  await requireWorkspace("hr");
  requireHrSupport();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[720px] px-8 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/support" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition hover:text-ink-strong"
        >
          <ArrowLeft size={15} /> Back to Support
        </Link>
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            HR · New request
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,2.6vw,34px)", letterSpacing: "-0.025em" }}
          >
            Raise a ticket
          </h1>
          <p className="mt-1 text-[14px] font-medium text-ink-muted">
            Pick a category, tell us what you need, and we&apos;ll route it to the right person.
          </p>
        </header>
        <TicketComposer mode="support" />
      </main>
      <DashboardFooter />
    </>
  );
}
