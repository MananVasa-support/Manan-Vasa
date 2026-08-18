-- 0186 — Billing · TDS as a RATE rather than a free amount.
--
-- The Payment Schedule now offers TDS as a fixed set of percentages
-- (0/2/3/5/10), so the rate is the thing the user picks and must be what is
-- stored. Keeping only the rupee figure would make the dropdown unreadable on
-- edit: you would have to reverse-derive "which percent was this?" from an
-- amount, and that derivation breaks the moment the line's amount is changed.
--
-- `tds_amount` is KEPT and rewritten on every save from (amount, tds_rate) by
-- the same action, so the two can never drift and any existing SQL reading the
-- rupee column keeps working.
--
-- BACKFILL: existing rows carry only an amount, so the rate is recovered as
-- round(tds_amount / amount * 100) and then snapped to the nearest offered
-- option. Rows with no amount or no TDS land on 0, which is what they mean.

ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS tds_rate integer NOT NULL DEFAULT 0;

UPDATE billing_payment_schedule
SET tds_rate = CASE
    WHEN COALESCE(amount, 0) <= 0 OR COALESCE(tds_amount, 0) <= 0 THEN 0
    ELSE (
      -- snap the derived percentage to the closest allowed option
      SELECT opt FROM (VALUES (0), (2), (3), (5), (10)) AS o(opt)
      ORDER BY abs(opt - (tds_amount / amount * 100)) ASC, opt ASC
      LIMIT 1
    )
  END
WHERE tds_rate = 0;
