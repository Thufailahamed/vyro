ALTER TABLE purchase_order_items ADD COLUMN unit_price_cents_snapshot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN discount_pct_snapshot INTEGER NOT NULL DEFAULT 0;
