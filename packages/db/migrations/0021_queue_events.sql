CREATE TABLE queue_events (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL CHECK (queue IN ('audit', 'notifications', 'invoices')),
  msg_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('retry', 'dlq', 'manual')),
  actor_user_id TEXT,
  payload_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_queue_events_queue_created ON queue_events (queue, created_at DESC);
CREATE INDEX idx_queue_events_event_created ON queue_events (event, created_at DESC);
CREATE INDEX idx_queue_events_created ON queue_events (created_at);