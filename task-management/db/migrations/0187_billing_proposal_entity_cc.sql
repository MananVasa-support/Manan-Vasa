-- 0187 — Billing · Proposal Entity + CC recipients.
--
-- `entity` is the single mailbox/group a proposal is sent FROM or owned BY;
-- `cc_emails` is the set copied on its correspondence.
--
-- WHY TEXT AND text[] RATHER THAN FKs: these are picked from a fixed demo list,
-- not from a managed roster. A join table would imply a lifecycle (add/rename/
-- retire a recipient) that does not exist yet. When a real roster lands, this
-- becomes a FK migration with the values already in place to map from.
--
-- NOT NULL DEFAULT '{}' on cc_emails so "no CC" is an empty array rather than
-- NULL — the read path never has to distinguish "none" from "unknown", and
-- array_length checks behave.
--
-- The older `entity_id` uuid column (from a prior experiment) is left untouched
-- and unused: it points at billing_entities, a roster this feature does not use.

ALTER TABLE billing_proposals ADD COLUMN IF NOT EXISTS entity     text;
ALTER TABLE billing_proposals ADD COLUMN IF NOT EXISTS cc_emails  text[] NOT NULL DEFAULT '{}';
