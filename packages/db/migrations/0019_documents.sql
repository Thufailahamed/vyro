CREATE TABLE invoice_uploads (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  supplier_id TEXT REFERENCES suppliers(id),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','ready','reviewed','failed','manual_required')),
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  ocr_provider TEXT,
  ocr_confidence INTEGER,
  raw_extraction_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by_user_id TEXT REFERENCES users(id),
  total_cents INTEGER
);
CREATE INDEX invoice_uploads_business_idx ON invoice_uploads(business_id, created_at);
CREATE INDEX invoice_uploads_status_idx ON invoice_uploads(status);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL REFERENCES invoice_uploads(id),
  business_id TEXT NOT NULL REFERENCES businesses(id),
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price_cents INTEGER,
  total_cents INTEGER,
  category_slug TEXT,
  category_source TEXT NOT NULL CHECK (category_source IN ('rule','default','manual')),
  product_id TEXT REFERENCES products(id)
);
CREATE INDEX invoice_line_items_upload_idx ON invoice_line_items(upload_id, line_number);
CREATE INDEX invoice_line_items_business_cat_idx ON invoice_line_items(business_id, category_slug, upload_id);
CREATE INDEX invoice_line_items_category_idx ON invoice_line_items(category_slug);

CREATE TABLE category_mappings (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses(id),
  match_pattern TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('seed','manual')),
  created_at INTEGER NOT NULL
);
CREATE INDEX category_mappings_business_idx ON category_mappings(business_id, priority);
CREATE UNIQUE INDEX category_mappings_business_pattern_idx ON category_mappings(business_id, match_pattern);

INSERT INTO category_mappings (id, business_id, match_pattern, category_slug, priority, source, created_at) VALUES
  ('cm_seed_food1',    NULL, 'rice',     'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food2',    NULL, 'sugar',    'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food3',    NULL, 'tea',      'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food4',    NULL, 'milk',     'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food5',    NULL, 'oil',      'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_food6',    NULL, 'flour',    'food', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_pack1',    NULL, 'carton',   'packaging', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_pack2',    NULL, 'box',      'packaging', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_clean1',   NULL, 'detergent','cleaning', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_clean2',   NULL, 'soap',     'cleaning', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_office1',  NULL, 'paper',    'office', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_office2',  NULL, 'pen',      'office', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_equip1',   NULL, 'cement',   'equipment', 10, 'seed', strftime('%s','now')*1000),
  ('cm_seed_equip2',   NULL, 'steel',    'equipment', 10, 'seed', strftime('%s','now')*1000);
