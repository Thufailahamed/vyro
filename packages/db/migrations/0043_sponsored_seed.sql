INSERT OR IGNORE INTO sponsored_plans (id, tier, name, monthly_rate_cents, included_slot_credits, active) VALUES
  ('plan-bronze-001', 'bronze', 'Bronze', 2500000, 0, 1),
  ('plan-silver-001', 'silver', 'Silver', 6000000, 3, 1),
  ('plan-gold-001',   'gold',   'Gold',   15000000, 8, 1);

INSERT OR IGNORE INTO sponsored_slots (id, surface, position, category_id, label, daily_rate_cents, active, created_at, updated_at) VALUES
  ('slot-search-0', 'search', 0, NULL, 'Search top #1', 50000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-search-1', 'search', 1, NULL, 'Search top #2', 40000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-search-2', 'search', 2, NULL, 'Search top #3', 30000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-0',   'homepage', 0, NULL, 'Homepage featured #1', 80000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-1',   'homepage', 1, NULL, 'Homepage featured #2', 70000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-2',   'homepage', 2, NULL, 'Homepage featured #3', 60000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-3',   'homepage', 3, NULL, 'Homepage featured #4', 50000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-4',   'homepage', 4, NULL, 'Homepage featured #5', 40000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-5',   'homepage', 5, NULL, 'Homepage featured #6', 30000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-storefront-upsell', 'storefront', 0, NULL, 'Storefront upsell', 20000, 1, strftime('%s','now'), strftime('%s','now'));