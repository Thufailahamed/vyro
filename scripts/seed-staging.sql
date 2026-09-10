-- VYRO staging seed — first-real-business ready.
-- Order matters: business_types -> categories -> products -> suppliers -> offers.
-- Usage (local D1):
--   pnpm --filter @vyro/api exec wrangler d1 execute vyro --local --file=../../scripts/seed-staging.sql
-- Remote staging:
--   pnpm --filter @vyro/api exec wrangler d1 execute vyro --remote --file=../../scripts/seed-staging.sql

-- 1. Business types (buyers + supplier kinds)
INSERT OR IGNORE INTO business_types (id, slug, name, active) VALUES
  ('bt-restaurant', 'restaurant', 'Restaurant', 1),
  ('bt-hotel', 'hotel', 'Hotel', 1),
  ('bt-cafe', 'cafe', 'Café', 1),
  ('bt-retail', 'retail', 'Retail & Supermarket', 1),
  ('bt-bakery', 'bakery', 'Bakery & Confectionery', 1),
  ('bt-catering', 'catering', 'Catering & Events', 1),
  ('bt-supplier-grocery', 'grocery-wholesaler', 'Grocery Wholesaler', 1),
  ('bt-supplier-beverage', 'beverage-distributor', 'Beverage Distributor', 1),
  ('bt-supplier-dairy', 'dairy-producer', 'Dairy & Cold Chain Producer', 1),
  ('bt-supplier-packaging', 'packaging-supplier', 'Packaging & Disposables Wholesaler', 1),
  ('bt-supplier-spices', 'spices-commodities', 'Spices & Agricultural Processing', 1),
  ('bt-supplier-meat', 'meat-seafood', 'Meat & Seafood Wholesale', 1);

-- 2. Platform defaults (LKR, 2.5% fee, signups open)
INSERT OR IGNORE INTO platform_settings (id, brand_name, support_email, support_phone, default_currency, platform_fee_bps, rfq_value_threshold_cents, rfq_quantity_threshold, enable_business_signup, enable_supplier_signup, updated_at) VALUES
  (1, 'VYRO', 'support@vyro.lk', '+94 11 000 0000', 'LKR', 250, 100000, 500, 1, 1, 1725450000000);
-- Categories
INSERT OR IGNORE INTO categories (id, slug, name, parent_id, sort_order, active) VALUES
  ('cat-staples',   'staples',   'Staples & Grains',   NULL, 1, 1),
  ('cat-beverages', 'beverages', 'Tea & Beverages',   NULL, 2, 1),
  ('cat-dairy',     'dairy',     'Dairy Products',     NULL, 3, 1),
  ('cat-commodities','commodities','Sugar & Commodities', NULL, 4, 1),
  ('cat-building',  'building',  'Cement & Building',  NULL, 5, 1),
  ('cat-packaging', 'packaging', 'Packaging Materials',NULL, 6, 1),
  ('cat-spices',    'spices',    'Spices & Agri',      NULL, 7, 1);

-- Products
INSERT OR REPLACE INTO products (id, name, description, category_id, brand, unit, pack_size, active, created_at, updated_at) VALUES
  ('p-rice-5kg',
   'White Rice 5kg',
   'Premium long-grain white rice, cleaned and destoned for wholesale commercial distribution.',
   'cat-staples', 'Pussalla', 'bag', '5kg', 1, 1725450000000, 1725450000000),

  ('p-samba-rice-25kg',
   'Samba Rice 25kg',
   'High-grade Sri Lankan Samba rice, mill-direct western province bulk supply for hotels and restaurants.',
   'cat-staples', 'Araliya', 'bag', '25kg', 1, 1725450000000, 1725450000000),

  ('p-sugar-1kg',
   'White Sugar 1kg',
   'Refined pure crystalline white sugar, food grade and moisture-sealed for long shelf life.',
   'cat-staples', 'Pelwatte', 'pack', '1kg', 1, 1725450000000, 1725450000000),

  ('p-sugar-50kg',
   'Refined White Sugar 50kg',
   'Industrial commercial bulk bag refined cane sugar for bakeries, food processors, and catering.',
   'cat-staples', 'Pelwatte', 'bag', '50kg', 1, 1725450000000, 1725450000000),

  ('p-tea-200g',
   'Ceylon Tea 200g',
   'Single-origin pure Ceylon black tea, BOPF high-grown grade from Nuwara Eliya estates.',
   'cat-beverages', 'Dilmah', 'pack', '200g', 1, 1725450000000, 1725450000000),

  ('p-tea-bulk-5kg',
   'Pure Ceylon BOPF Tea 5kg',
   'Catering and HORECA bulk bag pure Ceylon black tea with rich amber brew and robust aroma.',
   'cat-beverages', 'Watawala', 'bag', '5kg', 1, 1725450000000, 1725450000000),

  ('p-milk-1l',
   'Fresh Milk 1L',
   'Pasteurized whole cow milk, homogenised for high stability and barista quality.',
   'cat-dairy', 'Fonterra', 'carton', '1L', 1, 1725450000000, 1725450000000),

  ('p-flour-1kg',
   'All-Purpose Wheat Flour 1kg',
   'Enriched wheat flour milled from hard spring wheat, ideal for breads, rottis, and pastries.',
   'cat-staples', 'Prima', 'pack', '1kg', 1, 1725450000000, 1725450000000),

  ('p-cement-50kg',
   'Portland Cement 50kg',
   'High-early-strength blended hydraulic cement for structural concrete, plastering, and brickwork.',
   'cat-building', 'Tokyo Super', 'bag', '50kg', 1, 1725450000000, 1725450000000),

  ('p-packaging-50pk',
   'Corrugated Packaging Cartons (50 Pack)',
   'Heavy-duty 3-ply kraft corrugated shipping boxes (40x30x25cm), flat-packed for logistics.',
   'cat-packaging', 'Printcare', 'pack', '50 units', 1, 1725450000000, 1725450000000),

  ('p-spices-pepper-500g',
   'Pure Ceylon Black Pepper 500g',
   'Sun-dried whole black pepper with high piperine content, sourced from Matale smallholders.',
   'cat-spices', 'Wijaya', 'pack', '500g', 1, 1725450000000, 1725450000000),

  ('p-oil-coconut-1l',
   'Pure White Coconut Oil 1L',
   'Expeller cold-pressed white coconut oil, unrefined and certified for commercial kitchens.',
   'cat-staples', 'Marina', 'bottle', '1L', 1, 1725450000000, 1725450000000);

-- Product Images
INSERT OR REPLACE INTO product_images (id, product_id, r2_key, sort_order, alt_text) VALUES
  ('img-rice-1', 'p-rice-5kg', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80', 1, 'White rice grains in bowl'),
  ('img-rice-2', 'p-rice-5kg', 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=800&q=80', 2, 'Burlap sack with raw rice'),

  ('img-samba-1', 'p-samba-rice-25kg', 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=800&q=80', 1, 'Samba rice wholesale sacks'),
  ('img-samba-2', 'p-samba-rice-25kg', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80', 2, 'Clean Samba rice grains'),

  ('img-sugar-1', 'p-sugar-1kg', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=800&q=80', 1, 'Refined white sugar crystals'),
  ('img-sugar-2', 'p-sugar-1kg', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=800&q=80', 2, 'Granulated white sugar scoop'),

  ('img-sugar50-1', 'p-sugar-50kg', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=800&q=80', 1, 'Bulk 50kg sugar commercial bag'),
  ('img-sugar50-2', 'p-sugar-50kg', 'https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&w=800&q=80', 2, 'Refined sugar granules wholesale'),

  ('img-tea-1', 'p-tea-200g', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80', 1, 'Ceylon black tea dry leaves'),
  ('img-tea-2', 'p-tea-200g', 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=800&q=80', 2, 'Harvested estate tea'),

  ('img-teabulk-1', 'p-tea-bulk-5kg', 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=800&q=80', 1, 'Bulk BOPF Ceylon tea leaves'),
  ('img-teabulk-2', 'p-tea-bulk-5kg', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80', 2, 'Black tea blend for foodservice'),

  ('img-milk-1', 'p-milk-1l', 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80', 1, 'Fresh pasteurized whole milk bottle and glass'),
  ('img-milk-2', 'p-milk-1l', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=800&q=80', 2, 'Dairy milk carton wholesale'),

  ('img-flour-1', 'p-flour-1kg', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80', 1, 'All-purpose wheat flour scoop and bowl'),

  ('img-cement-1', 'p-cement-50kg', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 1, 'Portland cement construction material'),

  ('img-pkg-1', 'p-packaging-50pk', 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80', 1, 'Stack of corrugated shipping cartons'),

  ('img-pepper-1', 'p-spices-pepper-500g', 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?auto=format&fit=crop&w=800&q=80', 1, 'Ceylon black peppercorns in bowl'),

  ('img-oil-1', 'p-oil-coconut-1l', 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80', 1, 'Pure virgin white coconut oil glass bottle');

-- Suppliers
INSERT OR IGNORE INTO suppliers (id, name, business_type_id, contact_person, phone, email, address, city, district, description, verification_status, status, created_at, updated_at) VALUES
  ('sup-colombo-wholesalers',
   'Colombo Central Wholesalers',
   'bt-supplier-grocery',
   'Dinesh Perera',
   '+94 11 234 5678',
   'orders@colombowholesale.lk',
   '42 Old Moor Street',
   'Colombo',
   'Colombo',
   'Direct importer and distributor of food staples, spices, and cooking oils.',
   'verified',
   'active',
   1725450000000,
   1725450000000),

  ('sup-lanka-mills',
   'Lanka Agro Mills & Processing',
   'bt-supplier-grocery',
   'Sunil Bandara',
   '+94 37 222 9876',
   'sales@lankaagromills.lk',
   '15 Industrial Zone, Dambulla Road',
   'Kurunegala',
   'Kurunegala',
   'Primary rice miller and grain processing hub with island-wide delivery.',
   'verified',
   'active',
   1725450000000,
   1725450000000),

  ('sup-island-distributors',
   'Island Logistics & Distribution',
   'bt-supplier-beverage',
   'Roshan Silva',
   '+94 81 223 4455',
   'supply@islandlogistics.lk',
   '88 Katugastota Road',
   'Kandy',
   'Kandy',
   'Authorized distributor for Ceylon tea estates, dairy cooperatives, and packaging manufacturers.',
   'verified',
   'active',
   1725450000000,
   1725450000000);

-- Supplier Products (Offers in cents: LKR 1 = 100 cents)
INSERT OR REPLACE INTO supplier_products (id, supplier_id, product_id, supplier_sku, price_cents, min_order_qty, lead_time_days, delivery_available, availability_status, active, created_at, updated_at) VALUES
  -- White Rice 5kg
  ('sp-rice-colombo', 'sup-colombo-wholesalers', 'p-rice-5kg', 'CW-RICE-5K', 115000, 5, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-rice-lanka',   'sup-lanka-mills',          'p-rice-5kg', 'LM-WR-5',   108000, 10, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Samba Rice 25kg
  ('sp-samba-lanka',   'sup-lanka-mills',          'p-samba-rice-25kg', 'LM-SAM-25', 420000, 5, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-samba-colombo', 'sup-colombo-wholesalers', 'p-samba-rice-25kg', 'CW-SAM-25', 445000, 2, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- White Sugar 1kg
  ('sp-sugar-colombo', 'sup-colombo-wholesalers', 'p-sugar-1kg', 'CW-SUG-1',  28000, 20, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-sugar-lanka',   'sup-lanka-mills',          'p-sugar-1kg', 'LM-SUG-1',  26500, 50, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- White Sugar 50kg
  ('sp-sugar50-colombo','sup-colombo-wholesalers','p-sugar-50kg','CW-SUG-50', 1320000, 2, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-sugar50-lanka',  'sup-lanka-mills',         'p-sugar-50kg','LM-SUG-50', 1280000, 5, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Ceylon Tea 200g
  ('sp-tea-island',   'sup-island-distributors',  'p-tea-200g', 'ID-TEA-200',  45000, 10, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-tea-colombo',  'sup-colombo-wholesalers',  'p-tea-200g', 'CW-TEA-200',  47500, 5, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Ceylon Tea Bulk 5kg
  ('sp-teabulk-island','sup-island-distributors', 'p-tea-bulk-5kg','ID-TEA-5K', 950000, 2, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Milk 1L
  ('sp-milk-island',  'sup-island-distributors',  'p-milk-1l', 'ID-MILK-1L',   52000, 12, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-milk-colombo', 'sup-colombo-wholesalers',  'p-milk-1l', 'CW-MILK-1L',   54000, 6, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Wheat Flour 1kg
  ('sp-flour-colombo', 'sup-colombo-wholesalers', 'p-flour-1kg', 'CW-FLR-1',   22000, 20, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-flour-lanka',   'sup-lanka-mills',          'p-flour-1kg', 'LM-FLR-1',   21000, 50, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Portland Cement 50kg
  ('sp-cement-island', 'sup-island-distributors', 'p-cement-50kg','ID-CEM-50', 215000, 20, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Packaging Cartons 50pk
  ('sp-pkg-island',    'sup-island-distributors', 'p-packaging-50pk','ID-BOX-50', 480000, 2, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Ceylon Black Pepper 500g
  ('sp-pepper-colombo','sup-colombo-wholesalers', 'p-spices-pepper-500g','CW-PEP-500', 185000, 5, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-pepper-island', 'sup-island-distributors', 'p-spices-pepper-500g','ID-PEP-500', 178000, 10, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000),

  -- Pure Coconut Oil 1L
  ('sp-oil-colombo',   'sup-colombo-wholesalers', 'p-oil-coconut-1l', 'CW-OIL-1L', 89000, 6, 1, 1, 'in_stock', 1, 1725450000000, 1725450000000),
  ('sp-oil-lanka',     'sup-lanka-mills',          'p-oil-coconut-1l', 'LM-OIL-1L', 86000, 12, 2, 1, 'in_stock', 1, 1725450000000, 1725450000000);

