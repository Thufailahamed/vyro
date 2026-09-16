CREATE TABLE IF NOT EXISTS sponsored_slots (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK (surface IN ('search','category','homepage','storefront')),
  position INTEGER NOT NULL,
  category_id TEXT,
  label TEXT NOT NULL,
  daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (surface, position, category_id)
);

CREATE INDEX IF NOT EXISTS sponsored_slots_surface_idx ON sponsored_slots (surface, active);

CREATE TABLE IF NOT EXISTS sponsored_plans (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('bronze','silver','gold')),
  name TEXT NOT NULL,
  monthly_rate_cents INTEGER NOT NULL CHECK (monthly_rate_cents >= 0),
  included_slot_credits INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tier)
);

CREATE TABLE IF NOT EXISTS sponsored_subscriptions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  plan_id TEXT NOT NULL REFERENCES sponsored_plans(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled')),
  slot_credits_remaining INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsored_subs_supplier_idx ON sponsored_subscriptions (supplier_id, status);

CREATE TABLE IF NOT EXISTS sponsored_campaigns (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  slot_id TEXT NOT NULL REFERENCES sponsored_slots(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_approval','pending_payment','approved','live','expired','rejected','revoked','cancelled')),
  payment_invoice_id TEXT,
  admin_notes TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsored_campaigns_slot_resolve_idx ON sponsored_campaigns (slot_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS sponsored_campaigns_supplier_idx ON sponsored_campaigns (supplier_id, status);

CREATE TABLE IF NOT EXISTS sponsored_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sponsored_campaigns(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','click')),
  surface TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  user_id_hash TEXT
);

CREATE INDEX IF NOT EXISTS sponsored_events_campaign_idx ON sponsored_events (campaign_id, event_type, occurred_at);

CREATE TABLE IF NOT EXISTS sponsored_invoices (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sponsored_campaigns(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','waived')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE INDEX IF NOT EXISTS sponsored_invoices_supplier_idx ON sponsored_invoices (supplier_id, status);