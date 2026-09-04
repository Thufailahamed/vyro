// Seed wrangler D1 with categories + sample products for local dev.
// Usage: pnpm --filter @vyro/api exec wrangler d1 execute vyro --local --file=../../scripts/seed.sql
// Or run via: cd apps/api && pnpm exec wrangler d1 execute vyro --local --command "$(cat ../../scripts/seed.sql)"

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SQL = `-- VYRO seed (idempotent inserts)
INSERT OR IGNORE INTO business_types (id, slug, name, active) VALUES
  ('bt-restaurant', 'restaurant', 'Restaurant', 1),
  ('bt-hotel',       'hotel',       'Hotel',       1),
  ('bt-cafe',        'cafe',        'Café',        1),
  ('bt-supplier-grocery', 'grocery-wholesaler', 'Grocery Wholesaler', 1),
  ('bt-supplier-beverage', 'beverage-distributor', 'Beverage Distributor', 1);

INSERT OR IGNORE INTO categories (id, slug, name, parent_id, sort_order, active) VALUES
  ('cat-staples',   'staples',   'Staples',   NULL, 1, 1),
  ('cat-beverages', 'beverages', 'Beverages', NULL, 2, 1),
  ('cat-dairy',     'dairy',     'Dairy',     NULL, 3, 1);

INSERT OR IGNORE INTO products (id, name, description, category_id, brand, unit, pack_size, active, created_at, updated_at) VALUES
  ('p-rice-5kg', 'White Rice 5kg',  'Premium long-grain rice', 'cat-staples', 'Pussalla',     'bag',  '5kg',  1, 0, 0),
  ('p-sugar-1kg','White Sugar 1kg', 'Refined sugar',           'cat-staples', 'local',        'pack', '1kg',  1, 0, 0),
  ('p-tea-200g', 'Ceylon Tea 200g', 'High-grown tea',          'cat-beverages','Dilmah',      'pack', '200g', 1, 0, 0),
  ('p-milk-1l',  'Milk 1L',         'Fresh pasteurized milk',  'cat-dairy',    'Fonterra',    'carton','1L',   1, 0, 0);
`;

const out = resolve(__dirname, 'seed.sql');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, SQL);
console.log('wrote', out);
