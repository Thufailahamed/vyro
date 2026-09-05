ALTER TABLE supplier_products ADD COLUMN tier1_min_qty INTEGER NOT NULL DEFAULT 10;
ALTER TABLE supplier_products ADD COLUMN tier1_discount_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_products ADD COLUMN tier2_min_qty INTEGER NOT NULL DEFAULT 50;
ALTER TABLE supplier_products ADD COLUMN tier2_discount_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_products ADD COLUMN tier3_min_qty INTEGER NOT NULL DEFAULT 100;
ALTER TABLE supplier_products ADD COLUMN tier3_discount_pct INTEGER NOT NULL DEFAULT 0;
