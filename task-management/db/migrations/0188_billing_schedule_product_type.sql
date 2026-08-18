-- 0188 — Billing · Product Type on a Payment Schedule line.
--
-- Nullable: lines created before this column existed have no product, and
-- backfilling them with a guess would invent data. The UI shows "—" for those.
--
-- Deliberately NOT a foreign key to the proposal's product: the schedule offers
-- a DIFFERENT set (PS, PSO, WMS, BSS, DS, RET — note DS and RET, and no BSSO),
-- so a single shared list would force one surface to show options the other must
-- not. See BILLING_SCHEDULE_PRODUCT_TYPES in db/enums.ts.
ALTER TABLE billing_payment_schedule ADD COLUMN IF NOT EXISTS product_type text;
