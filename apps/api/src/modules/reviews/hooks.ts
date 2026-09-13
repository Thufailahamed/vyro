import * as svc from './service';

/**
 * Cross-module entry points for the disputes module to call.
 * Keeps the disputes module unaware of the reviews service surface.
 */

export async function onOrderDisputeOpened(d1: D1Database, orderId: string) {
  return svc.markOrderDisputed(d1, orderId);
}

export async function onOrderDisputeResolved(d1: D1Database, orderId: string) {
  return svc.markOrderResolved(d1, orderId);
}