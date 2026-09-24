/**
 * Maps web hrefs emitted by server-side notifications, AI replies, and admin
 * deep-links to the mobile route layout. Returns `null` for any path that
 * has no mobile equivalent — callers should surface a 'page not found'
 * toast instead of routing into a 404 screen.
 */
const ROUTES: Array<[string, string]> = [
  ['/products/', '/buyer/product/'],
  ['/suppliers/', '/buyer/store/'],
  ['/orders/', '/buyer/order/'],
  ['/orders', '/buyer/orders'],
  ['/cart', '/buyer/cart'],
  ['/search', '/buyer/catalog'],
  ['/rfqs', '/buyer/rfqs'],
  ['/invoices', '/buyer/invoices'],
  ['/dashboard', '/buyer/ai'],
  ['/analytics', '/buyer/ai'],
  ['/ai', '/buyer/ai'],
];

export function mobileHref(webPath: string | null | undefined): string | null {
  if (!webPath) return null;
  for (const [from, to] of ROUTES) {
    if (webPath === from) return to;
    if (webPath.startsWith(from)) return webPath.replace(from, to);
  }
  // Allow internal mobile paths through unchanged so callers can route to
  // mobile-native destinations (e.g. '/settings') without going through the
  // web mapper.
  if (webPath.startsWith('/buyer/') || webPath.startsWith('/supplier/') || webPath.startsWith('/admin/')) {
    return webPath;
  }
  return null;
}
