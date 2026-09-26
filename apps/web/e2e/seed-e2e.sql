-- E2E additions on top of seed-staging.sql.
-- Give the rice offers real stock so add-to-cart passes inventory checks,
-- and deactivate every competing offer for p-rice-5kg except the one the
-- global setup repoints at the e2e supplier — so the product page shows a
-- single, deterministic offer.
UPDATE supplier_products SET stock_qty = 500, reserved_qty = 0, track_inventory = 1 WHERE id IN ('sp-rice-colombo', 'sp-rice-lanka');
UPDATE supplier_products SET active = 0 WHERE product_id = 'p-rice-5kg' AND id != 'sp-rice-colombo';
