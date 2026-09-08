import { describe, it, expect, vi } from 'vitest';
import { runOcr } from '../../src/modules/documents/ocrWorker';

describe('runOcr', () => {
  it('returns zero-confidence stub when AI binding missing', async () => {
    const r = await runOcr({ env: {} as any, bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });
    expect(r.confidence).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.supplierName).toBeNull();
    expect(r.rawProvider).toBe('stub');
  });

  it('clamps confidence into 0..100', async () => {
    const fakeAi = { run: vi.fn().mockResolvedValue({ response: 'garbage non-json' }) };
    const r = await runOcr({ env: { AI: fakeAi } as any, bytes: new Uint8Array(), mimeType: 'image/jpeg' });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });

  it('parses well-formed JSON response and returns items', async () => {
    const payload = {
      supplierName: 'Ceylon Mills',
      invoiceNumber: 'INV-001',
      invoiceDate: '2026-08-15',
      totalCents: 125000,
      items: [
        { description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000 },
        { description: 'White Sugar 1kg', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000 },
      ],
    };
    const fakeAi = { run: vi.fn().mockResolvedValue({ response: `Here is the JSON:\n${JSON.stringify(payload)}\nDone.` }) };
    const r = await runOcr({ env: { AI: fakeAi } as any, bytes: new Uint8Array(), mimeType: 'image/png' });
    expect(r.supplierName).toBe('Ceylon Mills');
    expect(r.invoiceNumber).toBe('INV-001');
    expect(r.totalCents).toBe(125000);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]?.description).toBe('Basmati Rice 5kg');
    expect(r.confidence).toBeGreaterThanOrEqual(60);
  });

  it('falls back to stub when AI throws', async () => {
    const fakeAi = { run: vi.fn().mockRejectedValue(new Error('network')) };
    const r = await runOcr({ env: { AI: fakeAi } as any, bytes: new Uint8Array(), mimeType: 'application/pdf' });
    expect(r.confidence).toBe(0);
    expect(r.items).toEqual([]);
  });
});
