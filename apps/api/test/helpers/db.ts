/**
 * Per-test D1 cleanup. Used in conjunction with @cloudflare/vitest-pool-workers
 * (added in Phase 4 — Task 24+ integration tests). For Phase 1-3 the API tests
 * cover only routes that do not touch D1.
 */
export async function freshDb(env: Env): Promise<void> {
  await env.DB.exec(
    'DELETE FROM stock_movements; ' +
      'DELETE FROM purchase_order_items; ' +
      'DELETE FROM order_events; ' +
      'DELETE FROM deliveries; ' +
      'DELETE FROM payments; ' +
      'DELETE FROM purchase_orders; ' +
      'DELETE FROM cart_items; ' +
      'DELETE FROM carts; ' +
      'DELETE FROM product_images; ' +
      'DELETE FROM supplier_products; ' +
      'DELETE FROM products; ' +
      'DELETE FROM categories; ' +
      'DELETE FROM supplier_members; ' +
      'DELETE FROM suppliers; ' +
      'DELETE FROM business_members; ' +
      'DELETE FROM businesses; ' +
      'DELETE FROM notifications; ' +
      'DELETE FROM audit_logs; ' +
      'DELETE FROM sessions; ' +
      'DELETE FROM user_settings; ' +
      'DELETE FROM supplier_settings; ' +
      'DELETE FROM platform_settings; ' +
      'DELETE FROM users; ' +
      'DELETE FROM business_types;',
  );
}
