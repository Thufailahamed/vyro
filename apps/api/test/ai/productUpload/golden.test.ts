import { describe, expect, it } from 'vitest';
import { detectSourceKind, extractFromTabular } from '../../../src/modules/ai/productUpload/extract';

/**
 * Golden extraction cases for AI product upload (pure, no AI in most cases):
 * canonical template, header-alias CSV, TSV, and the row-cap behavior.
 */

describe('extractFromTabular goldens', () => {
  it('canonical template headers need no AI mapping', async () => {
    const csv = 'product_id,product_name,unit,supplier_sku,price_lkr,min_order_qty,active\np1,Rice 5kg,bag,SKU-1,420,5,yes';
    const noAi = {};
    const out = await extractFromTabular(noAi as any, csv);
    expect(out.headerMapping).toBeNull();
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      productName: 'Rice 5kg',
      supplierSku: 'SKU-1',
      priceLkr: 420,
      minOrderQty: 5,
      confidence: expect.any(Number),
    });
    // canonical row with name+price → review-ready confidence
    expect(out.rows[0]!.confidence).toBeGreaterThanOrEqual(70);
  });

  it('alias headers are normalized without AI when they hit the alias table', async () => {
    // parseCsvRecords lowercases/underscores: Item→item, Rate→rate.
    const csv = 'item,rate\nRice 5kg,420';
    const out = await extractFromTabular({} as any, csv);
    expect(out.headerMapping).toBeNull(); // deterministic alias pick, no AI call
    expect(out.rows[0]!.productName).toBe('Rice 5kg');
    expect(out.rows[0]!.priceLkr).toBe(420);
  });

  it('tsv input parses with tab headers', async () => {
    const tsv = 'product_name\tprice_lkr\nRice 5kg\t420\nDhal 1kg\t310';
    const out = await extractFromTabular({} as any, tsv);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[1]!.priceLkr).toBe(310);
  });

  it('caps rows at 200', async () => {
    const header = 'product_name,price_lkr\n';
    const csv = header + Array.from({ length: 260 }, (_, i) => `SKU item ${i},${i + 1}`).join('\n');
    const out = await extractFromTabular({} as any, csv);
    expect(out.rows).toHaveLength(200);
  });

  it('rows missing a name are dropped, price-less rows keep low confidence', async () => {
    const csv = 'product_name,price_lkr\n,420\nDhal 1kg,';
    const out = await extractFromTabular({} as any, csv);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.productName).toBe('Dhal 1kg');
    expect(out.rows[0]!.priceLkr).toBeUndefined();
    expect(out.rows[0]!.confidence).toBeLessThan(60); // flagged for review
  });

  it('detectSourceKind never accepts spreadsheets the importer cannot read', () => {
    expect(detectSourceKind('a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeNull();
    expect(detectSourceKind('a.xls', 'application/vnd.ms-excel')).toBeNull();
    expect(detectSourceKind('a.csv', 'text/csv')).toBe('csv');
    expect(detectSourceKind('price.jpg', 'image/jpeg')).toBe('photo_pdf');
    expect(detectSourceKind('item.png', 'image/png')).toBe('product_photo');
    expect(detectSourceKind('list.pdf', 'application/pdf')).toBe('photo_pdf');
  });
});
