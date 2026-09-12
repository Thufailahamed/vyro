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
