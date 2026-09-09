DROP INDEX IF EXISTS audit_logs_intent_idx;
DROP INDEX IF EXISTS audit_logs_action_created_idx;

-- SQLite cannot drop a column cleanly in older versions; null it out instead.
UPDATE audit_logs SET intent = NULL;
-- Note: ALTER TABLE DROP COLUMN is supported on Workers D1 (SQLite >= 3.35).
-- Leave column in place if your local SQLite is older; the column is harmless.
