-- 0055_invoice_upload_reconciliation.sql
-- Doc-intel v2 phase A: link invoice uploads to POs, auto-run 3-way
-- reconciliation after OCR, and persist the result for the order page card.
ALTER TABLE invoice_uploads ADD COLUMN purchase_order_id TEXT REFERENCES purchase_orders(id);
ALTER TABLE invoice_uploads ADD COLUMN reconciliation_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE invoice_uploads ADD COLUMN reconciliation_json TEXT;
CREATE INDEX invoice_uploads_po_idx ON invoice_uploads(purchase_order_id, created_at);
