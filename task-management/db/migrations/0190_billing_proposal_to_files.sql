-- 0190 — Billing · Proposal "Email To" recipients and attached proposal files.
--
-- Two columns added to the EXISTING billing_proposals table. No new table, no
-- new module: the Proposal section gains two fields it did not have.
--
-- `to_emails` mirrors the existing `cc_emails` shape (text[] NOT NULL DEFAULT
-- '{}') so the read path never distinguishes "none" from "unknown". Both are now
-- free-typed addresses rather than picks from a fixed list, which is why they
-- stay plain text rather than becoming FKs to a recipient roster.
--
-- `attachments` is jsonb rather than a child table: each entry is an opaque
-- storage descriptor ({path,name,mime,size}) written and read as one unit, never
-- queried across proposals. That is the shape `broadcasts.attachments` already
-- uses in this codebase, so the upload path is the established one. A child
-- table would buy per-file querying nothing needs, at the cost of a join on
-- every proposal read.
--
-- NOTE ON `entity`: the Company field reuses the existing `entity` column rather
-- than adding one. It has always held "the party this proposal belongs to"; only
-- the offered values and the label change. Renaming would strand the values
-- already stored, so the column keeps its name.

ALTER TABLE billing_proposals ADD COLUMN IF NOT EXISTS to_emails   text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_proposals ADD COLUMN IF NOT EXISTS attachments jsonb  NOT NULL DEFAULT '[]';
