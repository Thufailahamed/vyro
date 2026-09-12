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
