-- 0185 — Billing · Payment Schedule for a WMS proposal.
--
-- One row per invoice-able line: Type, the milestone/advance stage it settles,
-- Description, Notes, Amount + GST, Tentative Date, Actual Date, Receipt Amount,
-- Receipt Date, TDS. Balance Payment and Final Balance Payment are DERIVED, not
-- stored (see below).
--
-- WHY RECEIPT FIELDS LIVE ON THE LINE rather than in a child receipts table:
-- the requirement sheet lists Receipt Amount / Receipt Date / TDS as columns of
-- the schedule row, i.e. one settlement per line. Keeping them here means the
-- schedule reads exactly like the sheet it replaces. If part-payments against a
-- single line are ever needed, that becomes a child table then — splitting it
-- now would add a join for a case that does not yet exist.
--
-- WHY BALANCE IS NOT A COLUMN: balance = (amount + GST) − (receipt + TDS). A
-- stored copy goes stale the instant any of the three inputs is edited, and the
-- staleness is silent. It is computed on read in lib/billing/schedule-math.ts.
--
-- WHY TDS COUNTS TOWARD SETTLEMENT: TDS is tax the client remits to the
-- government on your behalf. It discharges their debt even though it never
-- reaches the bank, so subtracting only the banked amount would leave every
-- TDS-deducting client permanently and wrongly outstanding.

CREATE TABLE IF NOT EXISTS billing_payment_schedule (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    uuid NOT NULL REFERENCES billing_proposals(id) ON DELETE CASCADE,
  -- Nullable: a line may exist before its milestone does, and deleting a
  -- milestone must not silently delete money that is owed.
  milestone_id   uuid REFERENCES billing_milestones(id) ON DELETE SET NULL,
  payment_type   text NOT NULL DEFAULT 'milestone',  -- advance | milestone | final_balance | other
  description    text,
  notes          text,
  amount         numeric(14,2) NOT NULL DEFAULT 0,   -- pre-GST
  gst_rate       integer NOT NULL DEFAULT 18,
  is_advance     boolean NOT NULL DEFAULT false,
  -- Marks the closing line, so "Final Balance Payment" is an explicit row the
  -- user controls rather than the app guessing which line is last.
  is_final       boolean NOT NULL DEFAULT false,
  tentative_date date,
  actual_date    date,
  receipt_amount numeric(14,2),                      -- null = nothing received yet
  receipt_date   date,
  tds_amount     numeric(14,2),
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Converge a pre-existing table from the earlier revision.
ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS is_final       boolean NOT NULL DEFAULT false;
ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS receipt_amount numeric(14,2);
ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS receipt_date   date;
ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS tds_amount     numeric(14,2);

CREATE INDEX IF NOT EXISTS billing_payment_schedule_proposal_idx  ON billing_payment_schedule (proposal_id, sort_order);
CREATE INDEX IF NOT EXISTS billing_payment_schedule_milestone_idx ON billing_payment_schedule (milestone_id);
CREATE INDEX IF NOT EXISTS billing_payment_schedule_tentative_idx ON billing_payment_schedule (tentative_date);
