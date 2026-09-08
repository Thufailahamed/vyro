import { describe, expect, it } from 'vitest';
import { buildAskContext } from '../src/ai/floatHelpers';

describe('buildAskContext', () => {
  it('maps product detail pages to product context', () => {
    expect(buildAskContext('/products/abc123', { productName: 'Samba Rice' })).toMatchObject({
      page: 'product',
      productName: 'Samba Rice',
    });
  });

  it('maps cart pages to cart context', () => {
    expect(buildAskContext('/cart', {})).toMatchObject({ page: 'cart' });
  });

  it('maps analytics pages to analytics context', () => {
    expect(buildAskContext('/ai', {})).toMatchObject({ page: 'analytics' });
  });

  it('maps order pages to orders context', () => {
    expect(buildAskContext('/orders/xyz', {})).toMatchObject({ page: 'orders' });
  });

  it('returns undefined for unknown pages', () => {
    expect(buildAskContext('/login', {})).toBeUndefined();
    expect(buildAskContext('/onboarding/business', {})).toBeUndefined();
  });

  it('passes supplier name through for supplier pages', () => {
    expect(buildAskContext('/supplier/products', { supplierName: 'ABC Foods' })).toMatchObject({
      page: 'supplier',
      supplierName: 'ABC Foods',
    });
  });
});
