# VYRO WhatsApp / Conversational Ordering Bot Design

**Status:** Approved Design  
**Date:** 2026-09-12  
**Scope:** Conversational wholesale ordering engine supporting natural language and Singlish trade phrasing over WhatsApp and an interactive web simulator console. Enables hospitality, restaurant, and retail buyers to draft multi-item orders, check wholesale rates, repeat recurring orders, and check delivery status via text messages.

---

## 1. Background & Value Proposition

In Sri Lanka, restaurant chefs, hotel food & beverage directors, and grocers predominantly manage ordering over WhatsApp rather than sitting in front of a laptop. Messages frequently mix English and Sinhala idioms (*"Machan send 5 bags samba rice and 2 sugar to our depot tomorrow"*).

Currently, Vyro requires buyers to browse catalogs, add items to cart, and proceed through a multi-step checkout.

**The Solution:** The **Conversational Ordering Bot** bridges this gap:
1. Receives messages via WhatsApp Cloud API Webhook or via the Web Procurement Console.
2. Identifies the customer organization from sender phone number.
3. Parses multi-item product lists, quantities, and Sri Lankan pack units.
4. Queries real-time catalog prices to find lowest rates or preferred suppliers.
5. Generates a formatted WhatsApp summary and a 1-click confirmation link (or reply "CONFIRM").
6. Authorizes and places the Purchase Order without requiring manual cart entry.

---

## 2. Architecture & Monorepo Layout

```
packages/
  ai/src/
    conversational/
      parser.ts               # Singlish/English B2B item & intent extractor
      formatter.ts            # WhatsApp markdown message builder
      types.ts                # Schemas & interfaces
      index.ts                # Exports

apps/
  api/src/
    modules/
      whatsapp/
        routes.ts             # GET /api/webhooks/whatsapp & POST /api/webhooks/whatsapp
        conversationalRoutes.ts # POST /api/conversational/chat & /confirm (Web API)
        conversationalService.ts # Phone lookup, catalog pricing, PO creation, Meta API reply
  web/src/
    pages/
      ConversationalOrderPage.tsx # In-browser conversational ordering console & simulator
```

---

## 3. Data Contracts & API Specification

### Endpoint 1: WhatsApp Cloud API Webhook
- `GET /api/webhooks/whatsapp`:
  - Query params: `hub.mode`, `hub.verify_token`, `hub.challenge`.
  - Verifies token against `WHATSAPP_VERIFY_TOKEN` and echoes `hub.challenge`.
- `POST /api/webhooks/whatsapp`:
  - Receives Meta webhook JSON payload.
  - Matches sender `From` phone against `users.phone` / `businesses.phone`.
  - Executes conversational ordering service and dispatches WhatsApp reply.

### Endpoint 2: Web Conversational Chat & Simulator API
`POST /api/conversational/chat`

**Request Schema (`ConversationalChatRequestSchema`):**
```ts
export const ConversationalChatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  businessId: z.string().optional(),
}).strict();
```

**Response Schema (`ConversationalOrderResponseSchema`):**
```ts
export const ConversationalOrderResponseSchema = z.object({
  replyText: z.string(),
  intent: z.enum(['order_draft', 'price_inquiry', 'reorder', 'order_tracking', 'help']),
  draft: z.object({
    id: z.string(),
    totalCents: z.number().int().min(0),
    deliveryDateEstimate: z.string().optional(),
    items: z.array(
      z.object({
        productId: z.string(),
        supplierProductId: z.string(),
        productName: z.string(),
        quantity: z.number().positive(),
        unit: z.string(),
        unitPriceCents: z.number().int().min(0),
        totalCents: z.number().int().min(0),
        supplierId: z.string(),
        supplierName: z.string(),
      })
    ),
  }).optional(),
  trackingInfo: z.object({
    poNumber: z.string(),
    status: z.string(),
    totalCents: z.number().int().min(0),
    driverName: z.string().optional(),
    deliveryAddress: z.string().optional(),
  }).optional(),
});
```

### Endpoint 3: Confirm Draft Order
`POST /api/conversational/confirm`

**Request:**
`{ draftId: string, businessId: string }`

**Response:**
`{ ok: true, poIds: string[], totalCents: number }`

---

## 4. Conversational Extraction Engine

### 4.1. Intent Detection
- `order_draft`: "machan send 5 bags samba", "need 200kg sugar and 2 tins oil", "order flour"
- `reorder`: "repeat last order", "same as last week", "usual order"
- `price_inquiry`: "how much is samba rice", "best price for sugar", "rate for oil"
- `order_tracking`: "where is PO-102", "status of order", "when will it be delivered"
- `help`: "hi", "help", "hello"

### 4.2. Multi-Item Parser (`parser.ts`)
1. Normalizes punctuation and splits on commas, newlines, "and", "plus".
2. Extracts numeric / word quantities ("5", "ten", "dozen") and pack units (*bags, cartons, tins, bottles, kgs, litres*).
3. Matches extracted item queries against active in-stock supplier rate cards.
4. Selects lowest price offer or preferred supplier from buyer preferences.

### 4.3. Message Formatter (`formatter.ts`)
Formats structured responses in WhatsApp native markdown with emojis, bold line item rates, and direct call-to-action links.

---

## 5. Web Procurement Experience (`ConversationalOrderPage.tsx`)

A dedicated interface at `/orders/conversational` featuring:
1. WhatsApp-style chat stream with timestamps.
2. Quick starter prompt pills for testing order phrases, price queries, and usual reorders.
3. Dynamic draft summary cards inside the chat with a 1-click **"Confirm & Place Order"** button.
4. Direct PO tracking status cards.

---

## 6. Security, Identity & Guardrails

1. **E.164 Phone Normalization**: Strips spaces, dashes, leading zeroes and converts to `94xxxxxxxxx` format for database matching.
2. **Account Linking Safeguard**: Unlinked phone numbers receive an onboarding link rather than placing unauthenticated orders.
3. **Two-Step Authorization Gate**: Orders are drafted first; placing the order requires clicking the secure confirmation link or replying "CONFIRM".
4. **Idempotency**: Prevents double-order placement on network retries.

---

## 7. Verification & Testing Plan

1. **Unit Tests (`packages/ai/src/conversational/parser.test.ts`)**:
   - Multi-item Singlish and English order phrase extraction.
   - Word numbers to integers conversion ("five" $\rightarrow$ 5).
   - Pack units normalization.
   - Price inquiry and tracking intent detection.
   - WhatsApp markdown output formatting.
2. **API Route Tests (`apps/api/test/ai/conversationalRoute.test.ts`)**:
   - Webhook handshake verification (`hub.challenge`).
   - Web chat route with valid draft response.
   - Order confirmation and PO creation.
3. **Monorepo Build & Typecheck**:
   - Clean `pnpm typecheck` across all 9 packages.
   - Full test suite passing via `pnpm test`.
