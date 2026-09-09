DROP INDEX IF EXISTS notifications_source_idx;

CREATE TABLE notifications_dg_tmp AS
  SELECT id, user_id, type, title, body, read_at, link, created_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_dg_tmp RENAME TO notifications;
CREATE INDEX notifications_user_read_idx ON notifications (user_id, read_at);

DROP INDEX IF EXISTS ai_insight_events_business_dispatched_idx;
DROP TABLE IF EXISTS ai_insight_events;
DROP INDEX IF EXISTS ai_preferences_business_idx;
DROP TABLE IF EXISTS ai_preferences;
