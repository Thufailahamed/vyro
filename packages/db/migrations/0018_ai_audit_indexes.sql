ALTER TABLE audit_logs ADD COLUMN intent TEXT;

UPDATE audit_logs
SET intent = json_extract(metadata, '$.intent')
WHERE metadata IS NOT NULL
  AND json_extract(metadata, '$.intent') IS NOT NULL;

CREATE INDEX audit_logs_action_created_idx ON audit_logs(action, created_at);
CREATE INDEX audit_logs_intent_idx ON audit_logs(intent);
