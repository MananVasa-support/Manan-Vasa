-- 0183 — Billing · WMS Proposals.
--
-- Captures: Proposal Number, Proposal Date, Client (from the Client Address
-- Book), Product (WMS), WMS Type, Proposal Status.
--
-- SHAPE NOTE: a `billing_proposals` table may already exist from an earlier,
-- larger proposal experiment. It is converged here rather than dropped —
-- dropping would be irreversible and buys nothing, since the extra columns are
-- nullable or defaulted and simply go unused by this feature. The two ALTERs
-- below are what make an existing table match this migration's intent:
--   · `wms_type` is new.
--   · `title` was NOT NULL in that older shape, but this feature has no title
--     field, so a proposal created here would violate it. Relaxed to nullable.
-- Both are additive/relaxing, so they are safe to re-run and cannot fail on a
-- populated table.
--
-- `code` (the Proposal Number) is UNIQUE: it is the human-facing identifier
-- quoted to a client, and two proposals sharing one is a filing error the
-- database should refuse rather than the UI merely discourage.

CREATE TABLE IF NOT EXISTS billing_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,            -- Proposal Number
  title         text,                            -- unused here; nullable
  client_id     uuid NOT NULL REFERENCES billing_clients(id) ON DELETE RESTRICT,
  -- Product. Fixed to 'wms' for this section, but kept as a column so sibling
  -- products (RGT/PS/PSO) can join without a migration.
  product_type  text NOT NULL DEFAULT 'wms',
  wms_type      text,                            -- WMS Type
  status        text NOT NULL DEFAULT 'draft',   -- Proposal Status
  proposal_date date NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Converge a pre-existing table to the shape above.
ALTER TABLE billing_proposals ADD COLUMN IF NOT EXISTS wms_type text;
ALTER TABLE billing_proposals ALTER COLUMN title DROP NOT NULL;
ALTER TABLE billing_proposals ALTER COLUMN product_type SET DEFAULT 'wms';

CREATE INDEX IF NOT EXISTS billing_proposals_client_idx  ON billing_proposals (client_id);
CREATE INDEX IF NOT EXISTS billing_proposals_status_idx  ON billing_proposals (status, proposal_date DESC);
CREATE INDEX IF NOT EXISTS billing_proposals_product_idx ON billing_proposals (product_type);
