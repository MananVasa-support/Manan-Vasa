import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { formatDMonY } from "@/lib/format";
import { getProposalWithMilestones } from "@/lib/queries/billing-milestones";
import {
  WMS_PROPOSAL_TYPE_LABELS,
  BILLING_PROPOSAL_STATUS_LABELS,
  billingProductLabel,
} from "@/db/enums";
import { ProposalMilestones } from "@/components/billing/proposal-milestones";
import { getProposalSchedule } from "@/lib/queries/billing-schedule";
import { PaymentSchedule } from "@/components/billing/payment-schedule";

/**
 * BILLING › PROPOSAL › one proposal — its details and its Milestones section.
 * Reached by clicking a proposal number in the Proposal list.
 */
export const dynamic = "force-dynamic";

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";

const STATUS_TONE: Record<string, string> = {
  draft: "#64748B",
  sent: "#2563EB",
  under_review: "#B45309",
  accepted: "#15803D",
  rejected: "#DC2626",
  on_hold: "#7C3AED",
};

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const detail = await getProposalWithMilestones(id);
  if (!detail) notFound();

  // Schedule is fetched after the proposal is known to exist, so a 404 never
  // pays for a second query.
  const schedule = await getProposalSchedule(id);

  const { proposal, client } = detail;
  const tone = STATUS_TONE[proposal.status] ?? "#475569";

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
            >
              Billing · Proposal
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(26px,3vw,38px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              {proposal.code}
            </h1>
            <p className="mt-1.5 text-[15px] font-medium text-ink-muted">
              {client.name}
              {client.company ? ` — ${client.company}` : ""} · {billingProductLabel(proposal.productType)}
              {proposal.wmsType ? ` · ${WMS_PROPOSAL_TYPE_LABELS[proposal.wmsType]}` : ""}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className="inline-flex items-center rounded-pill px-3 py-1 text-[12px] font-bold"
              style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
            >
              {BILLING_PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
            </span>
            <Link
              href={"/billing/proposals" as Route}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-soft hover:underline"
            >
              <ArrowLeft size={14} /> All proposals
            </Link>
          </div>
        </div>
      </header>

      {/* Proposal + client facts. Client details are joined live from the
          Client Address Book, never copied onto the proposal. */}
      <section
        className="mb-6 rounded-[22px] bg-surface-card p-6 max-md:p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Proposal Number" value={proposal.code} />
          <Fact label="Proposal Date" value={formatDMonY(proposal.proposalDate)} />
          <Fact label="Product Type" value={billingProductLabel(proposal.productType)} />
          <Fact label="WMS Type" value={proposal.wmsType ? WMS_PROPOSAL_TYPE_LABELS[proposal.wmsType] : null} />
          <Fact label="Client" value={client.name} />
          <Fact label="Company" value={client.company} />
          <Fact label="Contact Person" value={client.contactPerson} />
          <Fact label="Phone" value={client.phone} />
          <Fact label="Entity" value={proposal.entity} />
          {proposal.notes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Fact label="Notes" value={proposal.notes} />
            </div>
          )}
        </dl>

        {/* CC sits directly under the Entity information, as chips rather than a
            comma list so each recipient reads as a discrete address. */}
        <div className="mt-4">
          <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">CC</dt>
          <dd className="mt-1.5">
            {proposal.ccEmails.length === 0 ? (
              <span className="text-[14px] text-ink-subtle">—</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {proposal.ccEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${PURPLE} 10%, transparent)`, color: PURPLE }}
                  >
                    <Mail size={12} />
                    {email}
                  </span>
                ))}
              </div>
            )}
          </dd>
        </div>
      </section>

      <ProposalMilestones detail={detail} />

      {/* Billing → Proposal → Milestones → Payment Schedule, in that order on
          the page, because a schedule line settles a milestone. */}
      <PaymentSchedule
        proposalId={proposal.id}
        rows={schedule.rows}
        totals={schedule.totals}
        milestones={detail.milestones.map((m) => ({ id: m.id, stage: m.stage, title: m.title, amount: m.amount }))}
      />
    </PageShell>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words whitespace-pre-wrap text-[14px] font-semibold text-ink-strong">
        {value && value.trim() !== "" ? value : <span className="font-normal text-ink-subtle">—</span>}
      </dd>
    </div>
  );
}
