-- 0189 — Billing · People Allocation.
--
-- Who is staffed on a client's delivery, and the scope lines that work is
-- billed against. One allocation per client engagement; many scope rows under it.
--
-- WHY MEMBER ARRAYS RATHER THAN A JOIN TABLE: members are an ordered, unnamed
-- list ("Member 1, 2, 3, …") with no attributes of their own — no role, no
-- dates, no rate. A join table would add a row identity and a lifecycle that
-- nothing needs, and would lose the ordering the form depends on. The lead is a
-- separate column because it IS a distinct role, not member zero.
--
-- Scope rows carry TWO amounts by design: the planned amount against the due
-- date, and the actual amount against the actual date. They are deliberately not
-- collapsed — the gap between them is the thing worth seeing.

CREATE TABLE IF NOT EXISTS billing_people_allocation (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
  app_lead_id          uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- Ordered member lists. No FK possible on an array; rows are read through a
  -- lookup against the employee roster, and a departed employee simply renders
  -- as unknown rather than breaking the allocation.
  app_member_ids       uuid[] NOT NULL DEFAULT '{}',
  handholding_lead_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  handholding_member_ids uuid[] NOT NULL DEFAULT '{}',
  notes                text,
  created_by_id        uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_people_allocation_client_idx ON billing_people_allocation (client_id);

CREATE TABLE IF NOT EXISTS billing_allocation_scope (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id  uuid NOT NULL REFERENCES billing_people_allocation(id) ON DELETE CASCADE,
  scope          text NOT NULL,                  -- wms_app | ps_app
  due_date       date,
  amount         numeric(14,2),                  -- planned, against the due date
  actual_date    date,
  actual_amount  numeric(14,2),                  -- actual, against the actual date
  bill_raise     text,                           -- raise status for this scope line
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_allocation_scope_alloc_idx ON billing_allocation_scope (allocation_id, sort_order);
