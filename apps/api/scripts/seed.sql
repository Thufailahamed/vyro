-- VYRO seed (idempotent inserts)
INSERT OR IGNORE INTO business_types (id, name, slug, audience, created_at, updated_at) VALUES
  ('bt-restaurant', 'Restaurant', 'restaurant', 'business', 0, 0),
  ('bt-hotel',       'Hotel',       'hotel',       'business', 0, 0),
  ('bt-cafe',        'Café',        'cafe',        'business', 0, 0),
  ('bt-supplier-grocery', 'Grocery Wholesaler', 'grocery-wholesaler', 'supplier', 0, 0),
  ('bt-supplier-beverage', 'Beverage Distributor', 'beverage-distributor', 'supplier', 0, 0);

INSERT OR IGNORE INTO categories (id, slug, name, parent_id, sort_order, active) VALUES
  ('cat-staples',   'staples',   'Staples',   NULL, 1, 1),
  ('cat-beverages', 'beverages', 'Beverages', NULL, 2, 1),
  ('cat-dairy',     'dairy',     'Dairy',     NULL, 3, 1);

INSERT OR IGNORE INTO products (id, name, description, category_id, brand, unit, pack_size, active, created_at, updated_at) VALUES
  ('p-rice-5kg', 'White Rice 5kg',  'Premium long-grain rice', 'cat-staples', 'Pussalla',     'bag',  '5kg',  1, 0, 0),
  ('p-sugar-1kg','White Sugar 1kg', 'Refined sugar',           'cat-staples', 'local',        'pack', '1kg',  1, 0, 0),
  ('p-tea-200g', 'Ceylon Tea 200g', 'High-grown tea',          'cat-beverages','Dilmah',      'pack', '200g', 1, 0, 0),
  ('p-milk-1l',  'Milk 1L',         'Fresh pasteurized milk',  'cat-dairy',    'Fonterra',    'carton','1L',   1, 0, 0);
