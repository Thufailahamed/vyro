-- Buyer-confirmed invoice OCR description → catalog product memory.
CREATE TABLE invoice_product_aliases (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  normalized_alias TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  source_upload_id TEXT NOT NULL REFERENCES invoice_uploads(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX invoice_product_aliases_scope_alias_idx
  ON invoice_product_aliases(business_id, supplier_id, normalized_alias);
