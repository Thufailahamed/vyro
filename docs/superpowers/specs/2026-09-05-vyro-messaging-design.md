# VYRO Messaging (Sub-project F1)

**Date:** 2026-09-05
**Status:** Approved design
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10

## 1. Background

Current state:
- NotificationForm mentions "Direct Supplier Inquiries & Chat" but no actual messaging.
- PO detail pages have no communication channel beyond status updates.
- Workers environment doesn't have WebSocket support via Hono's standard adapter.

## 2. Goals

- Per-PO message thread between business + supplier.
- REST endpoints: send, list, mark-read.
- Web UI: thread panel on `/orders/:id`, 5s polling when visible.
- Notification fires for recipient on new message.
- All messages scoped: only PO participants (business side + supplier side) can read/write.

## 3. Non-goals

- WebSockets / SSE (Workers compatibility debt, polled for now).
- File attachments.
- Typing indicators.
- Read receipts beyond per-user lastReadAt.

## 4. Architecture

### 4.1 Schema

```sql
CREATE TABLE po_messages (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX po_messages_po_idx ON po_messages(purchase_order_id, created_at);
```

### 4.2 Endpoints

```
POST /api/purchase-orders/:id/messages  body: { body: string }  → 201 { id, createdAt }
GET  /api/purchase-orders/:id/messages  ?since={ts}             → 200 { messages: [...] }
POST /api/purchase-orders/:id/messages/read                    → 200 { ok, readAt }
```

### 4.3 Authorization

User must be a member of the PO's business OR supplier (via members table) OR platform admin.

### 4.4 Web UI

`/orders/:id` shows existing detail + new `<MessageThread poId={id} />` component:
- Polls GET every 5s via React Query (`refetchInterval`)
- Sends via POST, optimistic update
- Marks all messages read on visible

### 4.5 Notifications

On send: enqueue notification to recipient via existing NOTIFICATIONS_QUEUE.

## 5. Components

| File | Purpose |
|---|---|
| `packages/db/migrations/0003_po_messages.sql` | Schema |
| `packages/db/src/schema/poMessages.ts` | Drizzle schema |
| `apps/api/src/modules/purchaseOrders/messages.ts` | Routes |
| `apps/api/src/modules/purchaseOrders/routes.ts` | Mount messages |
| `apps/api/test/modules/purchaseOrders/messages.test.ts` | Tests |
| `apps/web/src/components/MessageThread.tsx` | UI |
| `apps/web/src/pages/OrderDetailPage.tsx` | Mount thread |

## 6. Data flow

```
sender POSTs message
  → validate auth (PO participant)
  → insert row
  → enqueue notification to recipient
  → return 201

recipient client GETs (every 5s)
  → list new messages since lastSeen
  → render in thread
  → POST /read to mark seen
```

## 7. Error handling

- 401 if not authenticated.
- 403 if not PO participant.
- 400 if body empty.
- Empty 200 list when no messages.

## 8. Testing

- Send: 201 with id, audit/notification triggered.
- List: returns ordered messages, since filter works.
- Auth: non-participant gets 403.
- Web: component renders messages from API mock.

## 9. Phases

1. Schema + drizzle
2. API endpoints + tests
3. Web MessageThread component
4. Mount in OrderDetailPage
5. Final verification

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Poll storm from many clients | 5s interval, pause when tab hidden via `visibilitychange`. |
| Notification spam | Only notify on new message, not on user's own. |
| Large body storage | Cap at 2000 chars server-side. |

## 11. Acceptance criteria

1. PO participants can send + list messages.
2. Non-participants get 403.
3. Web thread polls and renders new messages.
4. Recipient gets a notification row.

## 12. Out of scope

- WebSockets.
- File attachments.
- Typing indicators.
