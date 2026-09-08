CREATE TABLE ai_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  business_id TEXT REFERENCES businesses(id),
  kind TEXT NOT NULL CHECK (kind IN ('preferred_supplier','frequently_ordered','procurement_default')),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user','inferred')),
  confidence REAL NOT NULL DEFAULT 1.0,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (business_id, kind, key)
);

CREATE INDEX ai_preferences_business_idx ON ai_preferences (business_id, kind);

CREATE TABLE ai_insight_events (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  dispatched_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','dismissed','acted')),
  UNIQUE (business_id, kind, payload_hash)
);

CREATE INDEX ai_insight_events_business_dispatched_idx ON ai_insight_events (business_id, dispatched_at);

ALTER TABLE notifications ADD COLUMN source TEXT NOT NULL DEFAULT 'system'
  CHECK (source IN ('system','ai'));

CREATE INDEX notifications_source_idx ON notifications (user_id, source, read_at);
