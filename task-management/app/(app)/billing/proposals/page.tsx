import { ReceiptIndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import {
  listWmsProposals,
  listClientOptions,
  suggestProposalNumber,
} from "@/lib/queries/billing-wms-proposals";
import { WmsProposals } from "@/components/billing/wms-proposals";

/**
 * BILLING › PROPOSALS — WMS proposals. Reached from the module rail entry
 * directly under "Client Address Book".
 */
export const dynamic = "force-dynamic";

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";

export default async function BillingProposalsPage() {
  await requireUser();
  const year = new Date().getFullYear();

  const [rows, clients, suggestedNumber] = await Promise.all([
    listWmsProposals(),
    listClientOptions(),
    suggestProposalNumber(year),
  ]);

  return (
    <PageShell width="wide">
      <header
        className="wg-rise relative mb-6 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
        style={{
          background: [
            `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${PURPLE} 9%, transparent), transparent 55%)`,
            `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${PURPLE} 5%, transparent), transparent 52%)`,
            "rgba(255, 255, 255, 0.72)",
          ].join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
        }}
      >
        <span
          className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
        >
          <ReceiptIndianRupee size={13} strokeWidth={2.6} /> Billing
        </span>
        <h1
          className="mt-3 text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(28px,3.2vw,42px)",
            letterSpacing: "-0.03em",
            lineHeight: 1.02,
          }}
        >
          Proposal · WMS
        </h1>
        <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
          Create and manage WMS proposals — proposal number, date, client from the address book, WMS type and status.
        </p>
      </header>

      <WmsProposals rows={rows} clients={clients} suggestedNumber={suggestedNumber} />
    </PageShell>
  );
}
