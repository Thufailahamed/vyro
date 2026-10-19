-- Product catalog: record the supplier member who created a catalog product.
-- The catalog is shared (many suppliers can list the same product), so writes
-- to a product row are authorised against the creator or an existing
-- supplier_products offer for that product.
ALTER TABLE products ADD COLUMN created_by_user_id TEXT;
CREATE INDEX products_created_by_idx ON products(created_by_user_id);
