-- 0054_product_upload_sessions.sql
-- AI product upload: staged supplier uploads (price-list CSV/photos/PDFs,
-- product photos) with per-row extraction candidates and review decisions.
CREATE TABLE product_upload_sessions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  -- pending | extracting | extracted | failed | committed
  status TEXT NOT NULL,
  -- csv | tsv | photo_pdf | product_photo
  source_kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  committed_at INTEGER
);
CREATE INDEX product_upload_sessions_supplier_idx
  ON product_upload_sessions(supplier_id, created_at);
CREATE INDEX product_upload_sessions_status_idx
  ON product_upload_sessions(status);

CREATE TABLE product_upload_rows (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES product_upload_sessions(id),
  row_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  product_name TEXT NOT NULL,
  supplier_sku TEXT,
  unit TEXT,
  price_lkr REAL,
  min_order_qty INTEGER,
  lead_time_days INTEGER,
  stock_qty INTEGER,
  tier1_min_qty INTEGER,
  tier1_discount_pct INTEGER,
  tier2_min_qty INTEGER,
  tier2_discount_pct INTEGER,
  tier3_min_qty INTEGER,
  tier3_discount_pct INTEGER,
  confidence INTEGER NOT NULL,
  -- offer | product | proposal | none
  match_type TEXT NOT NULL,
  match_product_id TEXT REFERENCES products(id),
  match_score INTEGER NOT NULL,
  -- accepted | edited | rejected
  decision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX product_upload_rows_session_idx
  ON product_upload_rows(session_id, row_index);
