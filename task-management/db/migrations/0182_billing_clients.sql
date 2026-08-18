-- 0182 — Billing · Client Address Book.
--
-- Backs the address-book rail on the left of every Billing surface: Client Name,
-- Company Name, Email ID, Phone Number, Address, Contact Person, Notes.
--
-- WHY `contact_person` IS SEPARATE FROM `name`: `name` is the ACCOUNT we bill,
-- which for a company is its trading name. The human you actually call is a
-- different fact — "Acme Industries Pvt Ltd" vs "Priya Nair, Head of Ops" —
-- and collapsing the two into one column is what makes address books rot.
--
-- WHY EMAILS ARE A CHILD TABLE rather than a text[] or a second column: a client
-- routinely has accounts@, the founder's personal id, and their CA on CC. Rows
-- let each address carry its own label and primary flag and be addressable by id;
-- an array cannot express "this one is primary" without positional convention.
--
-- Fully idempotent (create-if-not-exists throughout), matching the house style
-- of every migration from 0023 on, so re-running against a populated database
-- no-ops rather than erroring.

CREATE TABLE IF NOT EXISTS billing_clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,                  -- Client Name (the account)
  company        text,                           -- Company Name
  contact_person text,                           -- Contact Person (the human)
  phone          text,                           -- Phone Number
  alt_phone      text,
  gstin          text,
  -- Address is captured as one field in the rail but stored in parts, so an
  -- invoice/PDF can address the parts later without re-parsing a blob.
  address_line1  text,
  address_line2  text,
  city           text,
  state          text,
  pincode        text,
  country        text NOT NULL DEFAULT 'India',
  notes          text,                           -- Notes
  is_active      boolean NOT NULL DEFAULT true,  -- archive, never hard-delete
  created_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_clients_active_name_idx ON billing_clients (is_active, name);
CREATE INDEX IF NOT EXISTS billing_clients_company_idx     ON billing_clients (company);

-- Guard for databases where an earlier revision of this table already exists
-- without the column (the shape this migration converged on).
ALTER TABLE billing_clients ADD COLUMN IF NOT EXISTS contact_person text;

CREATE TABLE IF NOT EXISTS billing_client_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
  email       text NOT NULL,
  label       text,                              -- "Accounts", "Director", …
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_client_emails_client_idx ON billing_client_emails (client_id);
-- The same address must not be listed twice for one client (case-insensitive),
-- so the unique index — not app code — is what actually holds the invariant.
CREATE UNIQUE INDEX IF NOT EXISTS billing_client_emails_unique_idx
  ON billing_client_emails (client_id, lower(email));
