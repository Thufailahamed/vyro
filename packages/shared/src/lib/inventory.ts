/**
 * Inventory helpers shared by the API and the web app so buyer-side display,
 * supplier-side editing and server-side enforcement never disagree.
 */

export const AvailabilityStatus = {
  IN_STOCK: 'in_stock',
  LOW: 'low',
  OUT_OF_STOCK: 'out_of_stock',
} as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];

export const STOCK_MOVEMENT_REASONS = [
  'manual_set',
  'manual_adjust',
  'order_reserved',
  'order_released',
  'order_committed',
  'offer_created',
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export interface InventoryState {
  stockQty: number;
  reservedQty: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  availabilityStatus: AvailabilityStatus;
}

/** Units a buyer can still order right now. */
export function availableQty(s: Pick<InventoryState, 'stockQty' | 'reservedQty'>): number {
  return Math.max(0, (s.stockQty ?? 0) - (s.reservedQty ?? 0));
}

/**
 * Availability derived from quantities when the offer tracks inventory;
 * otherwise the supplier-managed status is authoritative.
 */
export function deriveAvailability(s: InventoryState): AvailabilityStatus {
  if (!s.trackInventory) return s.availabilityStatus;
  const free = availableQty(s);
  if (free <= 0) return AvailabilityStatus.OUT_OF_STOCK;
  if (s.lowStockThreshold > 0 && free <= s.lowStockThreshold) return AvailabilityStatus.LOW;
  return AvailabilityStatus.IN_STOCK;
}

export function isOutOfStock(s: InventoryState): boolean {
  return deriveAvailability(s) === AvailabilityStatus.OUT_OF_STOCK;
}

export function isLowStock(s: InventoryState): boolean {
  return deriveAvailability(s) === AvailabilityStatus.LOW;
}

export type PurchasableFailure =
  | { ok: false; code: 'OUT_OF_STOCK'; message: string }
  | { ok: false; code: 'BELOW_MOQ'; message: string; minOrderQty: number }
  | { ok: false; code: 'INSUFFICIENT_STOCK'; message: string; available: number };

export type PurchasableResult = { ok: true } | PurchasableFailure;

/**
 * Single source of truth for "may this quantity of this offer be ordered".
 * Used by add-to-cart, checkout and the buyer UI.
 */
export function checkPurchasable(
  offer: InventoryState & { minOrderQty: number },
  quantity: number,
): PurchasableResult {
  if (isOutOfStock(offer)) {
    return { ok: false, code: 'OUT_OF_STOCK', message: 'This offer is out of stock' };
  }
  const moq = offer.minOrderQty ?? 1;
  if (quantity < moq) {
    return {
      ok: false,
      code: 'BELOW_MOQ',
      message: `Minimum order quantity is ${moq}`,
      minOrderQty: moq,
    };
  }
  if (offer.trackInventory) {
    const free = availableQty(offer);
    if (quantity > free) {
      return {
        ok: false,
        code: 'INSUFFICIENT_STOCK',
        message: `Only ${free} unit(s) available`,
        available: free,
      };
    }
  }
  return { ok: true };
}

export function availabilityLabel(status: AvailabilityStatus): string {
  switch (status) {
    case AvailabilityStatus.IN_STOCK:
      return 'In stock';
    case AvailabilityStatus.LOW:
      return 'Low stock';
    default:
      return 'Out of stock';
  }
}
