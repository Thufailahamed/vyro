-- Sponsored invoices: a supplier may submit proof of payment ('submitted')
-- but must not be able to self-approve. Only an admin moves an invoice to
-- 'paid' (or 'waives' it), and that admin action is what releases the
-- campaign — previously the supplier's own "mark paid" button did both, so a
-- supplier could obtain paid placement for free.
--
-- The status column has a CHECK constraint, so the table is rebuilt to widen
-- it. Nothing references sponsored_invoices, so the rebuild is safe.
CREATE TABLE sponsored_invoices_new (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sponsored_campaigns(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','submitted','paid','waived')),
  payment_reference TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

INSERT INTO sponsored_invoices_new (
  id, campaign_id, supplier_id, amount_cents, status, created_at, paid_at
)
  SELECT id, campaign_id, supplier_id, amount_cents, status, created_at, paid_at
  FROM sponsored_invoices;

DROP TABLE sponsored_invoices;

ALTER TABLE sponsored_invoices_new RENAME TO sponsored_invoices;

CREATE INDEX IF NOT EXISTS sponsored_invoices_supplier_idx ON sponsored_invoices (supplier_id, status);
