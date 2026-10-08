import { describe, expect, it } from 'vitest';
import { detectSourceKind } from '../../../src/modules/ai/productUpload/extract';

describe('detectSourceKind', () => {
  it('classifies csv/txt as csv', () => {
    expect(detectSourceKind('list.csv', 'text/csv')).toBe('csv');
    expect(detectSourceKind('list.csv', 'text/plain')).toBe('csv');
  });
  it('classifies tsv', () => {
    expect(detectSourceKind('list.tsv', 'text/tab-separated-values')).toBe('tsv');
  });
  it('classifies documents and photos', () => {
    expect(detectSourceKind('price.jpg', 'image/jpeg')).toBe('photo_pdf');
    expect(detectSourceKind('scan.png', 'image/png')).toBe('photo_pdf');
    expect(detectSourceKind('list.pdf', 'application/pdf')).toBe('photo_pdf');
    expect(detectSourceKind('item.png', 'image/webp')).toBe('product_photo');
  });
  it('rejects xlsx by returning null (UI will ask for CSV export)', () => {
    expect(
      detectSourceKind('list.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBeNull();
  });
});
