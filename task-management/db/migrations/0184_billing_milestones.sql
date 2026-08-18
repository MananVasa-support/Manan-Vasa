-- 0184 — Billing · WMS Proposal milestones.
--
-- A proposal is delivered in stages (Advance, M1–M4, Final), and each stage
-- carries the payment due on reaching it. One row per stage per proposal.
--
-- MONEY: numeric(14,2) rupees, matching outstanding_contracts. Amounts are
-- summed in integer paise in application code (lib/billing/milestone-math.ts)
-- so adding several GST-bearing stages cannot drift by a float epsilon.
--
-- `amount` is the payment requirement attached to the milestone. It is nullable
-- because a milestone can legitimately be a delivery checkpoint with no invoice
-- of its own — forcing 0 there would make "no payment due" and "payment of zero"
-- indistinguishable in the totals.
--
-- The UNIQUE (proposal_id, stage) index is the real guard against "two M2s",
-- which is a filing error rather than a use case: re-splitting a stage is done
-- by editing its amount, not by adding a duplicate.

CREATE TABLE IF NOT EXISTS billing_milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL REFERENCES billing_proposals(id) ON DELETE CASCADE,
  stage        text NOT NULL,                   -- advance | m1 | m2 | m3 | m4 | final
  title        text,
  description  text,
  due_date     date,
  amount       numeric(14,2),                   -- payment due at this milestone
  sort_order   integer NOT NULL DEFAULT 0,
  is_delivered boolean NOT NULL DEFAULT false,
  delivered_on date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Converge a pre-existing table (an earlier revision had no amount column).
ALTER TABLE billing_milestones ADD COLUMN IF NOT EXISTS amount numeric(14,2);

CREATE INDEX IF NOT EXISTS billing_milestones_proposal_idx
  ON billing_milestones (proposal_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS billing_milestones_stage_unique_idx
  ON billing_milestones (proposal_id, stage);
