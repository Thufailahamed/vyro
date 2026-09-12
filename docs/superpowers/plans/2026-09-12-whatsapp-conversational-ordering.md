# WhatsApp / Conversational Ordering Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a conversational wholesale ordering engine that parses multi-item procurement orders, price checks, reorders, and tracking requests from Singlish/English messages over WhatsApp Cloud API and an interactive in-browser procurement simulator.

**Architecture:** Pure natural language parsing, unit extraction, and WhatsApp markdown formatting in `packages/ai`. A business-phone resolver and ordering orchestration service in `apps/api` executes lowest-rate catalog lookups, drafts Purchase Orders, and dispatches responses via Meta Graph API and `/api/conversational` endpoints. An interactive WhatsApp-styled console in `apps/web` at `/orders/conversational` allows buyers to order conversationally with 1-click PO confirmation.

**Tech Stack:** TypeScript, Node 20+, pnpm, Vitest, Zod, Hono, D1 / Drizzle ORM, React 18, Tailwind CSS, Lucide icons.

## Global Constraints
- Node 20+ and pnpm 9+.
- Currency in integer cents (LKR).
- Multi-Item Parsing: Must handle multi-item lists joined by commas, "and", "plus", or newlines.
- Unit Normalization: Must recognize Sri Lankan trade units (*bags, tins, bottles, cartons, kgs, litres*).
- Accidental Order Protection: Orders are drafted first; explicit confirmation click or reply "CONFIRM" is required to place purchase orders.
- Meta Webhook Compliance: Supports standard `hub.challenge` token handshake for WhatsApp Cloud API.

---

### Task 1: Conversational Schemas & Types in `packages/ai`

**Files:**
- Create: `packages/ai/src/conversational/types.ts`
- Create: `packages/ai/src/conversational/index.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/conversational/types.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces:
  - `ConversationalIntentSchema`, `ConversationalIntent`
  - `ConversationalChatRequestSchema`, `ConversationalChatRequest`
  - `ConversationalOrderResponseSchema`, `ConversationalOrderResponse`
  - `ConversationalConfirmRequestSchema`, `ConversationalConfirmRequest`
  - `ParsedItem`, `ParsedOrderResult` interfaces

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/conversational/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  ConversationalIntentSchema,
  ConversationalChatRequestSchema,
  ConversationalOrderResponseSchema,
  ConversationalConfirmRequestSchema,
} from './types';

describe('Conversational Types & Schemas', () => {
  it('validates intent enum', () => {
    expect(ConversationalIntentSchema.safeParse('order_draft').success).toBe(true);
    expect(ConversationalIntentSchema.safeParse('price_inquiry').success).toBe(true);
    expect(ConversationalIntentSchema.safeParse('reorder').success).toBe(true);
    expect(ConversationalIntentSchema.safeParse('order_tracking').success).toBe(true);
    expect(ConversationalIntentSchema.safeParse('invalid_intent').success).toBe(false);
  });

  it('validates chat request schema', () => {
    const req = { message: 'machan send 5 bags samba rice' };
    const parsed = ConversationalChatRequestSchema.safeParse(req);
    expect(parsed.success).toBe(true);
  });

  it('validates order response with draft items', () => {
    const res = {
      replyText: '🛒 *Order Draft Ready*\n1. Samba Rice x 5 = Rs. 62,500',
      intent: 'order_draft' as const,
      draft: {
        id: 'draft-1',
        totalCents: 6250000,
        items: [
          {
            productId: 'p1',
            supplierProductId: 'sp1',
            productName: 'Samba Rice 50kg',
            quantity: 5,
            unit: 'bag',
            unitPriceCents: 1250000,
            totalCents: 6250000,
            supplierId: 's1',
            supplierName: 'Lanka Mills',
          },
        ],
      },
    };
    const parsed = ConversationalOrderResponseSchema.safeParse(res);
    expect(parsed.success).toBe(true);
  });

  it('validates confirmation request schema', () => {
    const req = { draftId: 'draft-1', businessId: 'b1' };
    const parsed = ConversationalConfirmRequestSchema.safeParse(req);
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/conversational/types.test.ts`
Expected: FAIL (cannot find `./types`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/conversational/types.ts`:
```ts
import { z } from 'zod';

export const ConversationalIntentSchema = z.enum([
  'order_draft',
  'price_inquiry',
  'reorder',
  'order_tracking',
  'help',
]);
export type ConversationalIntent = z.infer<typeof ConversationalIntentSchema>;

export const ConversationalChatRequestSchema = z
  .object({
    message: z.string().min(1).max(1000),
    businessId: z.string().optional(),
  })
  .strict();
export type ConversationalChatRequest = z.infer<typeof ConversationalChatRequestSchema>;

export const DraftItemSchema = z.object({
  productId: z.string(),
  supplierProductId: z.string(),
  productName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  supplierId: z.string(),
  supplierName: z.string(),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const OrderDraftSchema = z.object({
  id: z.string(),
  totalCents: z.number().int().min(0),
  deliveryDateEstimate: z.string().optional(),
  items: z.array(DraftItemSchema),
});
export type OrderDraft = z.infer<typeof OrderDraftSchema>;

export const TrackingInfoSchema = z.object({
  poNumber: z.string(),
  status: z.string(),
  totalCents: z.number().int().min(0),
  driverName: z.string().optional(),
  deliveryAddress: z.string().optional(),
});
export type TrackingInfo = z.infer<typeof TrackingInfoSchema>;

export const ConversationalOrderResponseSchema = z.object({
  replyText: z.string(),
  intent: ConversationalIntentSchema,
  draft: OrderDraftSchema.optional(),
  trackingInfo: TrackingInfoSchema.optional(),
});
export type ConversationalOrderResponse = z.infer<typeof ConversationalOrderResponseSchema>;

export const ConversationalConfirmRequestSchema = z
  .object({
    draftId: z.string().min(1),
    businessId: z.string().min(1),
  })
  .strict();
export type ConversationalConfirmRequest = z.infer<typeof ConversationalConfirmRequestSchema>;

export interface ParsedItem {
  query: string;
  quantity: number;
  unit: string;
}

export interface ParsedOrderResult {
  intent: ConversationalIntent;
  items: ParsedItem[];
  locationCue?: string;
  timeCue?: string;
  poNumberQuery?: string;
}
```

Create `packages/ai/src/conversational/index.ts`:
```ts
export * from './types';
```

Modify `packages/ai/src/index.ts`:
Add:
```ts
export * from './conversational/index';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/conversational/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/conversational/ packages/ai/src/index.ts
git commit -m "feat(ai): add conversational ordering schemas and contracts"
```

---

### Task 2: Multi-Item Parser & WhatsApp Formatter in `packages/ai`

**Files:**
- Create: `packages/ai/src/conversational/parser.ts`
- Create: `packages/ai/src/conversational/formatter.ts`
- Modify: `packages/ai/src/conversational/index.ts`
- Test: `packages/ai/src/conversational/parser.test.ts`

**Interfaces:**
- Consumes: `ParsedOrderResult`, `OrderDraft`, `TrackingInfo`
- Produces:
  - `parseConversationalMessage(text: string): ParsedOrderResult`
  - `formatWhatsAppDraftReply(params: { draft: OrderDraft, businessName: string, confirmUrl: string }): string`
  - `formatWhatsAppTrackingReply(info: TrackingInfo): string`
  - `formatWhatsAppPriceReply(params: { product: string, priceCents: number, unit: string, supplierName: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/ai/src/conversational/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseConversationalMessage } from './parser';
import { formatWhatsAppDraftReply } from './formatter';
import type { OrderDraft } from './types';

describe('Conversational Parser', () => {
  it('extracts multi-item order with Singlish phrasing', () => {
    const text = 'Machan send 5 bags samba rice, 2 bags white sugar, and 1 tin coconut oil to depot tomorrow';
    const res = parseConversationalMessage(text);
    expect(res.intent).toBe('order_draft');
    expect(res.items).toHaveLength(3);
    expect(res.items[0]!.quantity).toBe(5);
    expect(res.items[0]!.unit).toBe('bag');
    expect(res.items[0]!.query).toContain('samba rice');
    expect(res.items[1]!.quantity).toBe(2);
    expect(res.items[1]!.query).toContain('white sugar');
    expect(res.items[2]!.unit).toBe('tin');
  });

  it('detects reorder intent', () => {
    const text = 'Repeat my usual order for Friday please';
    const res = parseConversationalMessage(text);
    expect(res.intent).toBe('reorder');
  });

  it('detects price inquiry intent', () => {
    const text = 'What is the cheapest rate for white sugar today?';
    const res = parseConversationalMessage(text);
    expect(res.intent).toBe('price_inquiry');
    expect(res.items[0]!.query).toContain('white sugar');
  });

  it('detects order tracking intent with PO number', () => {
    const text = 'Where is PO-2026-0042?';
    const res = parseConversationalMessage(text);
    expect(res.intent).toBe('order_tracking');
    expect(res.poNumberQuery).toBe('PO-2026-0042');
  });

  it('formats draft into structured WhatsApp markdown', () => {
    const draft: OrderDraft = {
      id: 'draft-123',
      totalCents: 9050000,
      deliveryDateEstimate: 'Tomorrow',
      items: [
        {
          productId: 'p1',
          supplierProductId: 'sp1',
          productName: 'Samba Rice 50kg',
          quantity: 5,
          unit: 'bag',
          unitPriceCents: 1250000,
          totalCents: 6250000,
          supplierId: 's1',
          supplierName: 'Lanka Mills',
        },
      ],
    };
    const reply = formatWhatsAppDraftReply({
      draft,
      businessName: 'Royal Hotel',
      confirmUrl: 'https://vyro.lk/orders/confirm?d=123',
    });
    expect(reply).toContain('Royal Hotel');
    expect(reply).toContain('Samba Rice 50kg');
    expect(reply).toContain('Rs. 62,500');
    expect(reply).toContain('https://vyro.lk/orders/confirm?d=123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/ai test src/conversational/parser.test.ts`
Expected: FAIL (cannot find `./parser`)

- [ ] **Step 3: Write implementation**

Create `packages/ai/src/conversational/parser.ts`:
```ts
import type { ParsedItem, ParsedOrderResult } from './types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, twenty: 20, fifty: 50,
  hundred: 100,
};

const UNIT_PATTERNS = 'bags?|cartons?|boxes?|packs?|packets?|tins?|bottles?|kgs?|kilos?|litres?|liters?|l|units?|pcs?';

export function parseConversationalMessage(text: string): ParsedOrderResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Check Tracking
  const poMatch = clean.match(/PO-[A-Z0-9-]+/i);
  if (poMatch || /\b(where is|track|status of|delivery time)\b/i.test(lower)) {
    return {
      intent: 'order_tracking',
      items: [],
      poNumberQuery: poMatch ? poMatch[0].toUpperCase() : undefined,
    };
  }

  // 2. Check Reorder
  if (/\b(repeat|same as|usual order|reorder|regular order)\b/i.test(lower)) {
    return {
      intent: 'reorder',
      items: [],
    };
  }

  // 3. Check Price Inquiry
  if (/\b(how much|what is the (price|rate)|cost of|cheapest rate|best price)\b/i.test(lower)) {
    const query = lower
      .replace(/^(what is the|how much is|rate for|price of|cheapest)\s+/i, '')
      .replace(/\s+(today|now|please|machan|\?)$/i, '')
      .trim();
    return {
      intent: 'price_inquiry',
      items: [{ query, quantity: 1, unit: 'unit' }],
    };
  }

  // 4. Check Order Draft
  // Split on commas, 'and', 'plus', or newlines
  const segments = clean
    .replace(/^machan\s+/i, '')
    .replace(/\b(send|order|need delivery of|please send|ewanna|danna)\b/gi, '')
    .split(/,|\band\b|\bplus\b|\n/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  const items: ParsedItem[] = [];

  for (const seg of segments) {
    const rx = new RegExp(`(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s*(${UNIT_PATTERNS})?\\s*(?:of\\s+)?(.*)`, 'i');
    const m = seg.match(rx);

    if (m) {
      const rawQty = m[1]!.toLowerCase();
      const quantity = /^\d+$/.test(rawQty) ? Number(rawQty) : WORD_NUMBERS[rawQty] ?? 1;
      let unit = m[2]?.toLowerCase() ?? 'unit';
      if (/^kgs?|^kilos?$/.test(unit)) unit = 'kg';
      if (/^bags?$/.test(unit)) unit = 'bag';
      if (/^tins?$/.test(unit)) unit = 'tin';
      if (/^bottles?$/.test(unit)) unit = 'bottle';
      if (/^cartons?$/.test(unit)) unit = 'carton';

      let query = m[3] ? m[3].trim() : '';
      // Strip trailing delivery phrases
      query = query.replace(/\s+(to depot|to branch|to hotel|tomorrow|urgently|for friday|asap).*$/i, '').trim();

      if (query.length > 1) {
        items.push({ query, quantity, unit });
      }
    }
  }

  if (items.length > 0) {
    return {
      intent: 'order_draft',
      items,
    };
  }

  // 5. Help / Greeting fallback
  return {
    intent: 'help',
    items: [],
  };
}
```

Create `packages/ai/src/conversational/formatter.ts`:
```ts
import type { OrderDraft, TrackingInfo } from './types';

export function formatWhatsAppDraftReply(params: {
  draft: OrderDraft;
  businessName: string;
  confirmUrl: string;
}): string {
  const { draft, businessName, confirmUrl } = params;
  const lines: string[] = [];

  lines.push(`🛒 *Order Draft Ready for ${businessName}*`);
  lines.push('');

  draft.items.forEach((it, i) => {
    const rateRs = (it.unitPriceCents / 100).toLocaleString();
    const totalRs = (it.totalCents / 100).toLocaleString();
    lines.push(
      `${i + 1}. *${it.productName}* x ${it.quantity} ${it.unit}\n   Rs. ${rateRs} / ${it.unit} → *Rs. ${totalRs}* (${it.supplierName})`,
    );
  });

  lines.push('');
  if (draft.deliveryDateEstimate) {
    lines.push(`🚚 *Est. Delivery:* ${draft.deliveryDateEstimate}`);
  }
  const grandTotalRs = (draft.totalCents / 100).toLocaleString();
  lines.push(`💰 *Total Order Value:* *Rs. ${grandTotalRs}*`);
  lines.push('');
  lines.push(`👉 *Tap to Confirm Order:*\n${confirmUrl}`);
  lines.push('');
  lines.push(`_Or reply with *CONFIRM* to place order immediately._`);

  return lines.join('\n');
}

export function formatWhatsAppTrackingReply(info: TrackingInfo): string {
  const totalRs = (info.totalCents / 100).toLocaleString();
  const lines: string[] = [];
  lines.push(`📦 *Order Status: ${info.poNumber}*`);
  lines.push(`Status: *${info.status.toUpperCase()}*`);
  lines.push(`Order Total: Rs. ${totalRs}`);
  if (info.driverName) lines.push(`🚚 Assigned Driver: ${info.driverName}`);
  if (info.deliveryAddress) lines.push(`📍 Dock: ${info.deliveryAddress}`);
  return lines.join('\n');
}

export function formatWhatsAppPriceReply(params: {
  product: string;
  priceCents: number;
  unit: string;
  supplierName: string;
}): string {
  const priceRs = (params.priceCents / 100).toLocaleString();
  return `💡 *Best Wholesale Rate*\n*${params.product}*: *Rs. ${priceRs}* per ${params.unit}\nDirect from *${params.supplierName}*.\n\nReply with your required quantity to place an order!`;
}
```

Modify `packages/ai/src/conversational/index.ts`:
```ts
export * from './types';
export * from './parser';
export * from './formatter';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/ai test src/conversational/parser.test.ts`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/conversational/parser.ts packages/ai/src/conversational/formatter.ts packages/ai/src/conversational/index.ts packages/ai/src/conversational/parser.test.ts
git commit -m "feat(ai): add Singlish multi-item order parser and WhatsApp formatter"
```

---

### Task 3: Conversational Ordering Orchestration Service in `apps/api`

**Files:**
- Create: `apps/api/src/modules/whatsapp/conversationalService.ts`
- Test: `apps/api/test/ai/conversationalService.test.ts`

**Interfaces:**
- Consumes: `@vyro/ai` (`parseConversationalMessage`, `formatWhatsAppDraftReply`, `formatWhatsAppTrackingReply`, `formatWhatsAppPriceReply`), D1 DB
- Produces:
  - `resolveBusinessByPhone(env: Env, phone: string)`
  - `processConversationalOrder(env: Env, businessId: string, message: string): Promise<ConversationalOrderResponse>`
  - `confirmConversationalOrder(env: Env, userId: string, businessId: string, draftId: string): Promise<{ ok: boolean, poIds: string[], totalCents: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ai/conversationalService.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '../../src/modules/whatsapp/conversationalService';

describe('conversationalService phone normalization', () => {
  it('normalizes local 077 numbers to Sri Lankan international format 9477', () => {
    expect(normalizePhoneNumber('0771234567')).toBe('94771234567');
  });

  it('normalizes +94 numbers by stripping plus', () => {
    expect(normalizePhoneNumber('+94 77 123 4567')).toBe('94771234567');
  });

  it('handles already normalized 9477 numbers', () => {
    expect(normalizePhoneNumber('94771234567')).toBe('94771234567');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test test/ai/conversationalService.test.ts`
Expected: FAIL (cannot find `conversationalService`)

- [ ] **Step 3: Write implementation**

Create `apps/api/src/modules/whatsapp/conversationalService.ts`:
```ts
import { eq, or, desc } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  businesses,
  users,
  businessMembers,
  products,
  supplierProducts,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  auditLogs,
} from '@vyro/db/schema';
import {
  parseConversationalMessage,
  formatWhatsAppDraftReply,
  formatWhatsAppTrackingReply,
  formatWhatsAppPriceReply,
  type ConversationalOrderResponse,
  type OrderDraft,
  type DraftItem,
} from '@vyro/ai';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

// In-memory draft store for quick 2-step confirmations
const DRAFTS_CACHE = new Map<string, { businessId: string; draft: OrderDraft; createdAt: number }>();

export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `94${digits.slice(1)}`;
  }
  if (digits.startsWith('94')) {
    return digits;
  }
  return digits;
}

export async function resolveBusinessByPhone(
  env: Env,
  rawPhone: string,
): Promise<{ businessId: string; businessName: string; userId: string } | null> {
  const phone = normalizePhoneNumber(rawPhone);
  const db = getDb(env.DB);

  // 1. Search in businesses.phone
  const biz = await db
    .select()
    .from(businesses)
    .where(or(eq(businesses.phone, phone), eq(businesses.phone, `+${phone}`)))
    .get();

  if (biz) {
    const member = await db
      .select()
      .from(businessMembers)
      .where(eq(businessMembers.businessId, biz.id))
      .get();
    return { businessId: biz.id, businessName: biz.name, userId: member?.userId ?? 'sys' };
  }

  // 2. Search in users.phone
  const user = await db
    .select()
    .from(users)
    .where(or(eq(users.phone, phone), eq(users.phone, `+${phone}`)))
    .get();

  if (user) {
    const member = await db
      .select({ businessId: businessMembers.businessId, businessName: businesses.name })
      .from(businessMembers)
      .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
      .where(eq(businessMembers.userId, user.id))
      .get();

    if (member) {
      return { businessId: member.businessId, businessName: member.businessName, userId: user.id };
    }
  }

  return null;
}

export async function processConversationalOrder(
  env: Env,
  businessId: string,
  message: string,
): Promise<ConversationalOrderResponse> {
  const db = getDb(env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  const parsed = parseConversationalMessage(message);

  // Intent 1: Tracking
  if (parsed.intent === 'order_tracking') {
    let order;
    if (parsed.poNumberQuery) {
      order = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.poNumber, parsed.poNumberQuery))
        .get();
    } else {
      order = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.businessId, businessId))
        .orderBy(desc(purchaseOrders.createdAt))
        .get();
    }

    if (!order) {
      return {
        replyText: `Could not find any recent purchase orders for ${biz.name}.`,
        intent: 'order_tracking',
      };
    }

    const trackingInfo = {
      poNumber: order.poNumber,
      status: order.status,
      totalCents: order.totalCents,
      deliveryAddress: `${order.deliveryAddress}, ${order.deliveryCity}`,
    };

    return {
      replyText: formatWhatsAppTrackingReply(trackingInfo),
      intent: 'order_tracking',
      trackingInfo,
    };
  }

  // Intent 2: Price inquiry
  if (parsed.intent === 'price_inquiry' && parsed.items[0]) {
    const itemQuery = parsed.items[0].query;
    const offers = await db
      .select({
        productName: products.name,
        priceCents: supplierProducts.priceCents,
        unit: products.unit,
        supplierName: suppliers.name,
      })
      .from(supplierProducts)
      .innerJoin(products, eq(supplierProducts.productId, products.id))
      .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
      .where(eq(supplierProducts.active, true))
      .all();

    const matched = offers.find((o) =>
      o.productName.toLowerCase().includes(itemQuery.toLowerCase()),
    );

    if (matched) {
      return {
        replyText: formatWhatsAppPriceReply({
          product: matched.productName,
          priceCents: matched.priceCents,
          unit: matched.unit,
          supplierName: matched.supplierName,
        }),
        intent: 'price_inquiry',
      };
    }

    return {
      replyText: `We couldn't find an active wholesale listing matching "${itemQuery}". Please try another search.`,
      intent: 'price_inquiry',
    };
  }

  // Intent 3: Order Draft / Reorder
  const catalogOffers = await db
    .select({
      supplierProductId: supplierProducts.id,
      productId: products.id,
      productName: products.name,
      priceCents: supplierProducts.priceCents,
      unit: products.unit,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(eq(supplierProducts.active, true))
    .all();

  const draftItems: DraftItem[] = [];

  for (const item of parsed.items) {
    const q = item.query.toLowerCase();
    const offer = catalogOffers.find((o) => o.productName.toLowerCase().includes(q));
    if (offer) {
      const lineTotal = offer.priceCents * item.quantity;
      draftItems.push({
        productId: offer.productId,
        supplierProductId: offer.supplierProductId,
        productName: offer.productName,
        quantity: item.quantity,
        unit: item.unit || offer.unit,
        unitPriceCents: offer.priceCents,
        totalCents: lineTotal,
        supplierId: offer.supplierId,
        supplierName: offer.supplierName,
      });
    }
  }

  if (draftItems.length === 0) {
    return {
      replyText: `👋 Hello! To place an order, please send a message like:\n_"Send 5 bags samba rice and 2 bags sugar"_\n\nOr ask for pricing with:\n_"What is the price of coconut oil?"_`,
      intent: 'help',
    };
  }

  const draftId = newId();
  const totalCents = draftItems.reduce((sum, it) => sum + it.totalCents, 0);
  const draft: OrderDraft = {
    id: draftId,
    totalCents,
    deliveryDateEstimate: 'Tomorrow',
    items: draftItems,
  };

  DRAFTS_CACHE.set(draftId, { businessId, draft, createdAt: Date.now() });

  const confirmUrl = `https://vyro.lk/orders/conversational?draft=${draftId}`;
  const replyText = formatWhatsAppDraftReply({
    draft,
    businessName: biz.name,
    confirmUrl,
  });

  return {
    replyText,
    intent: 'order_draft',
    draft,
  };
}

export async function confirmConversationalOrder(
  env: Env,
  userId: string,
  businessId: string,
  draftId: string,
): Promise<{ ok: boolean; poIds: string[]; totalCents: number }> {
  const cached = DRAFTS_CACHE.get(draftId);
  if (!cached || cached.businessId !== businessId) {
    throw httpError(404, 'NOT_FOUND', 'Order draft expired or not found. Please request a new order.');
  }

  const db = getDb(env.DB);
  const biz = await db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');

  const { draft } = cached;
  const bySupplier = new Map<string, typeof draft.items>();
  for (const it of draft.items) {
    const list = bySupplier.get(it.supplierId) ?? [];
    list.push(it);
    bySupplier.set(it.supplierId, list);
  }

  const poIds: string[] = [];

  for (const [supplierId, supItems] of bySupplier.entries()) {
    const poId = newId();
    const poSubtotal = supItems.reduce((s, it) => s + it.totalCents, 0);
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;

    await db.insert(purchaseOrders).values({
      id: poId,
      poNumber,
      businessId,
      supplierId,
      status: 'pending',
      subtotalCents: poSubtotal,
      deliveryFeeCents: 0,
      totalCents: poSubtotal,
      currency: 'LKR',
      deliveryAddress: biz.address,
      deliveryCity: biz.city,
      deliveryDistrict: biz.district,
      notes: 'Generated via WhatsApp / Conversational Ordering Bot',
      createdByUserId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (const it of supItems) {
      await db.insert(purchaseOrderItems).values({
        id: newId(),
        purchaseOrderId: poId,
        supplierProductId: it.supplierProductId,
        productNameSnapshot: it.productName,
        unitPriceCents: it.unitPriceCents,
        quantity: it.quantity,
        lineTotalCents: it.totalCents,
      });
    }

    poIds.push(poId);
  }

  DRAFTS_CACHE.delete(draftId);

  // Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      action: 'ai.conversational.order_confirmed',
      resourceType: 'business',
      resourceId: businessId,
      metadata: JSON.stringify({ poIds, totalCents: draft.totalCents, itemCount: draft.items.length }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return { ok: true, poIds, totalCents: draft.totalCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/conversationalService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/conversationalService.ts apps/api/test/ai/conversationalService.test.ts
git commit -m "feat(api): add conversational ordering service and phone resolver"
```

---

### Task 4: API Endpoints (WhatsApp Webhook + Web Chat) in `apps/api`

**Files:**
- Create: `apps/api/src/modules/whatsapp/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/ai/conversationalRoutes.test.ts`

**Interfaces:**
- Consumes: `processConversationalOrder`, `confirmConversationalOrder`, `resolveBusinessByPhone`
- Produces:
  - `GET /api/webhooks/whatsapp` (Meta verification handshake)
  - `POST /api/webhooks/whatsapp` (Inbound WhatsApp message webhook)
  - `POST /api/conversational/chat` (Web simulator / chat)
  - `POST /api/conversational/confirm` (PO placement)

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ai/conversationalRoutes.test.ts
import { describe, it, expect } from 'vitest';
import {
  ConversationalChatRequestSchema,
  ConversationalConfirmRequestSchema,
} from '@vyro/ai';

describe('conversational routes schema validation', () => {
  it('accepts valid message body', () => {
    const res = ConversationalChatRequestSchema.safeParse({
      message: 'order 5 bags rice',
      businessId: 'biz-1',
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty message body', () => {
    const res = ConversationalChatRequestSchema.safeParse({
      message: '',
    });
    expect(res.success).toBe(false);
  });

  it('validates confirm order payload', () => {
    const res = ConversationalConfirmRequestSchema.safeParse({
      draftId: 'd-1',
      businessId: 'b-1',
    });
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test test/ai/conversationalRoutes.test.ts`
Expected: PASS

- [ ] **Step 3: Write routes implementation**

Create `apps/api/src/modules/whatsapp/routes.ts`:
```ts
import { Hono } from 'hono';
import { session, type Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { requireBusinessRole } from '@vyro/auth';
import {
  ConversationalChatRequestSchema,
  ConversationalConfirmRequestSchema,
} from '@vyro/ai';
import {
  processConversationalOrder,
  confirmConversationalOrder,
  resolveBusinessByPhone,
} from './conversationalService';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

// 1. Meta WhatsApp Webhook Verification
router.get('/webhooks/whatsapp', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const expectedToken = (c.env as any).WHATSAPP_VERIFY_TOKEN ?? 'vyro_whatsapp_secret';
  if (mode === 'subscribe' && token === expectedToken) {
    return c.text(challenge ?? '');
  }
  return c.text('Forbidden', 403);
});

// 2. Meta WhatsApp Inbound Message Handler
router.post('/webhooks/whatsapp', async (c) => {
  const body = (await c.req.json().catch(() => null)) as any;
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return c.json({ status: 'ignored' });

  const senderPhone = message.from;
  const textBody = message.text?.body;

  if (senderPhone && textBody) {
    const resolved = await resolveBusinessByPhone(c.env, senderPhone);
    if (resolved) {
      await processConversationalOrder(c.env, resolved.businessId, textBody);
    }
  }

  return c.json({ status: 'ok' });
});

// 3. Web Procurement Chat API
router.post('/conversational/chat', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const raw = await c.req.json().catch(() => ({}));
  const parsed = ConversationalChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
  }

  const businessId = parsed.data.businessId ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No active business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing', 'accountant']);

  const response = await processConversationalOrder(c.env, businessId, parsed.data.message);
  return c.json(response);
});

// 4. Confirm Draft PO API
router.post('/conversational/confirm', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const raw = await c.req.json().catch(() => null);
  const parsed = ConversationalConfirmRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid confirm body', parsed.error.flatten());
  }

  requireBusinessRole(ctx, parsed.data.businessId, ['owner', 'manager', 'purchasing']);
  const result = await confirmConversationalOrder(c.env, ctx.userId, parsed.data.businessId, parsed.data.draftId);
  return c.json(result, 201);
});

export default router;
```

Modify `apps/api/src/index.ts`:
Mount the WhatsApp and conversational router:
```ts
import whatsappRouter from './modules/whatsapp/routes';
// ...
app.route('/api', whatsappRouter);
```

- [ ] **Step 4: Run typecheck on api package**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/whatsapp/routes.ts apps/api/src/index.ts apps/api/test/ai/conversationalRoutes.test.ts
git commit -m "feat(api): add WhatsApp webhook and conversational ordering routes"
```

---

### Task 5: Web Conversational Ordering Console (`ConversationalOrderPage.tsx`)

**Files:**
- Create: `apps/web/src/pages/ConversationalOrderPage.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: Build / typecheck via `pnpm --filter @vyro/web typecheck`

**Interfaces:**
- Consumes: `api.post`, `useToast`, `ConversationalOrderResponse`
- Produces: React page `ConversationalOrderPage`

- [ ] **Step 1: Write page component**

Create `apps/web/src/pages/ConversationalOrderPage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { ConversationalOrderResponse, OrderDraft } from '@vyro/ai';
import { ArrowLeftIcon, SendIcon, SparklesIcon, PackageIcon } from '@/components/icons';

interface MessageBubble {
  sender: 'user' | 'bot';
  text: string;
  draft?: OrderDraft;
  timestamp: string;
}

export function ConversationalOrderPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [messages, setMessages] = useState<MessageBubble[]>([
    {
      sender: 'bot',
      text: '👋 *Welcome to Vyro WhatsApp Procurement!*\n\nSend your wholesale order list, ask for bulk rates, or repeat your weekly order.\n\n_Example: "Machan send 5 bags samba rice and 2 bags sugar tomorrow"_',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const quickPrompts = [
    'Send 5 bags samba rice and 2 bags sugar',
    'What is the price of white sugar?',
    'Repeat my usual weekly order',
    'Where is my latest order?',
  ];

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? inputMsg).trim();
    if (!text || loading) return;

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { sender: 'user', text, timestamp: userTime }]);
    if (!textToSend) setInputMsg('');
    setLoading(true);

    try {
      const res = await api.post<ConversationalOrderResponse>('/conversational/chat', {
        message: text,
      });

      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: res.replyText,
          draft: res.draft,
          timestamp: botTime,
        },
      ]);
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to send message'));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDraft(draft: OrderDraft) {
    setConfirming(true);
    try {
      const res = await api.post<{ ok: boolean; poIds: string[]; totalCents: number }>(
        '/conversational/confirm',
        {
          draftId: draft.id,
          businessId: 'default',
        },
      );
      toast.show(toast.success('Purchase Order placed successfully!'));
      if (res.poIds[0]) {
        navigate(`/orders/${res.poIds[0]}`);
      }
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Could not place order'));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
        <ArrowLeftIcon size={14} /> Back to Orders
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <span>💬 Conversational Ordering</span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              WhatsApp Engine
            </span>
          </h1>
          <p className="text-xs text-ink-3 mt-1">
            Order wholesale supplies in plain English or Singlish trade phrasing.
          </p>
        </div>
      </div>

      {/* Quick Prompt Pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => void handleSend(p)}
            className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink shadow-soft-sm transition"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <Surface kind="elevated" className="mt-4 flex h-[480px] flex-col rounded-2xl border border-line p-4 shadow-sm">
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                  m.sender === 'user'
                    ? 'bg-ink text-paper rounded-br-none'
                    : 'bg-bone text-ink rounded-bl-none border border-line'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">{m.text}</div>

                {/* Embedded Order Draft Card */}
                {m.draft && (
                  <div className="mt-3 rounded-xl border border-line/60 bg-paper p-3 text-ink">
                    <div className="flex items-center justify-between border-b border-line/40 pb-2">
                      <span className="font-semibold text-xs text-ink">Order Draft Preview</span>
                      <span className="font-mono font-bold text-emerald-700">
                        Rs. {(m.draft.totalCents / 100).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {m.draft.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-[11px]">
                          <span>
                            {it.productName} x {it.quantity} {it.unit}
                          </span>
                          <span className="font-mono text-ink-3">
                            Rs. {(it.totalCents / 100).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex justify-end gap-2 border-t border-line/40 pt-2">
                      <Button
                        onClick={() => void handleConfirmDraft(m.draft!)}
                        loading={confirming}
                        disabled={confirming}
                        size="sm"
                        className="bg-emerald-600 text-paper hover:bg-emerald-700 text-xs font-semibold"
                      >
                        Confirm & Place Purchase Order
                      </Button>
                    </div>
                  </div>
                )}

                <div
                  className={`mt-1 text-[10px] text-right ${
                    m.sender === 'user' ? 'text-paper/60' : 'text-ink-4'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <div className="mt-3 flex items-center gap-2 border-t border-line/50 pt-3">
          <input
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type your wholesale order (e.g. 'Send 5 bags samba rice and 2 sugar')..."
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs focus:ring-ink"
          />
          <Button
            onClick={() => void handleSend()}
            loading={loading}
            disabled={loading || !inputMsg.trim()}
            size="sm"
            className="bg-ink text-paper hover:bg-charcoal font-semibold px-4"
          >
            Send
          </Button>
        </div>
      </Surface>
    </div>
  );
}
```

Modify `apps/web/src/main.tsx`:
Add route for `/orders/conversational`.

- [ ] **Step 2: Run typecheck on web package**

Run: `pnpm --filter @vyro/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ConversationalOrderPage.tsx apps/web/src/main.tsx
git commit -m "feat(web): add ConversationalOrderPage procurement simulator"
```

---

### Task 6: Monorepo Verification & Integration

**Files:**
- Modify: `apps/web/src/pages/OrdersPage.tsx`
- Test: Full monorepo verification (`pnpm typecheck`, `pnpm test`)

**Interfaces:**
- Consumes: Route `/orders/conversational`
- Produces: Integrated conversational ordering button on OrdersPage

- [ ] **Step 1: Add link to conversational ordering on `OrdersPage.tsx`**

In `apps/web/src/pages/OrdersPage.tsx`:
Add a button/link beside "Create RFQ" or header actions:
```tsx
<Link
  to="/orders/conversational"
  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-soft-sm"
>
  💬 WhatsApp Order Bot
</Link>
```

- [ ] **Step 2: Run verification scripts across monorepo**

Run:
```bash
pnpm --filter @vyro/ai test
pnpm --filter @vyro/api test
pnpm typecheck
pnpm test
```
Expected: All tests pass, 0 typecheck errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/OrdersPage.tsx
git commit -m "feat(web): add WhatsApp Order Bot link to OrdersPage"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-12-whatsapp-conversational-ordering.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
