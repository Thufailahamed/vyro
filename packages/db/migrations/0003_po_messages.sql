CREATE TABLE po_messages (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX po_messages_po_idx ON po_messages(purchase_order_id, created_at);
CREATE INDEX po_messages_sender_idx ON po_messages(sender_user_id, created_at);
