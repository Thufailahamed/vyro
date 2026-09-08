/**
 * Helpers shared by the floating Ask panel and the cart hints banner.
 * Pure functions — easy to unit-test.
 */

export type AskPage = 'product' | 'supplier' | 'cart' | 'analytics' | 'orders' | 'other';

export interface AskContextEntity {
  productName?: string;
  productId?: string;
  supplierName?: string;
  cartLines?: Array<{ product: string; quantity: number }>;
}

export interface AskContext {
  page: AskPage;
  productName?: string;
  productId?: string;
  supplierName?: string;
  cartLines?: Array<{ product: string; quantity: number }>;
}

const KNOWN_PREFIXES = ['/products', '/supplier', '/cart', '/orders', '/ai', '/search', '/dashboard', '/ask'];

export function buildAskContext(pathname: string, entity: AskContextEntity): AskContext | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith('/products/') || pathname === '/products') {
    if (entity.productName || entity.productId) {
      return {
        page: 'product',
        ...(entity.productName ? { productName: entity.productName } : {}),
        ...(entity.productId ? { productId: entity.productId } : {}),
      };
    }
    return undefined;
  }
  if (pathname === '/cart' || pathname === '/checkout') {
    return entity.cartLines ? { page: 'cart', cartLines: entity.cartLines } : { page: 'cart' };
  }
  if (pathname.startsWith('/orders')) {
    return { page: 'orders' };
  }
  if (pathname === '/ai' || pathname.startsWith('/analytics')) {
    return { page: 'analytics' };
  }
  if (pathname.startsWith('/supplier')) {
    return entity.supplierName ? { page: 'supplier', supplierName: entity.supplierName } : undefined;
  }
  void KNOWN_PREFIXES;
  return undefined;
}

export function dismissKey(raw: string): string {
  return `vyro:dismiss:${raw}`;
}

export function isDismissed(raw: string): boolean {
  try {
    return localStorage.getItem(dismissKey(raw)) === '1';
  } catch {
    return false;
  }
}

export function clearDismiss(raw: string): void {
  try {
    localStorage.removeItem(dismissKey(raw));
  } catch {
    // noop
  }
}

