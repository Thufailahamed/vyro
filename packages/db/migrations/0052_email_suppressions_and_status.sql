-- Add Resend tracking columns to notifications
ALTER TABLE notifications ADD COLUMN resend_id TEXT;
ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'queued';
CREATE INDEX IF NOT EXISTS idx_notifications_resend_id ON notifications(resend_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- Suppression list for bounces/complaints
CREATE TABLE IF NOT EXISTS email_suppressions (
  recipient TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  event_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
