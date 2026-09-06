import type { SessionContext } from './types';

/**
 * Central tenancy helpers for VYRO.
 *
 * VYRO has no separate tenant table — a user can have multiple business
 * memberships and multiple supplier memberships. Every query that touches
 * business or supplier-scoped data MUST first verify membership via one of
 * these helpers and apply the resulting businessId/supplierId filter at
 * query level.
 *
 * Admins (`ctx.adminRole !== null`) bypass business/supplier membership
 * checks because they have platform-wide visibility. Admin endpoints MUST
 * still call `assertAdmin` to make that explicit.
 */

export class TenantAccessError extends Error {
  readonly status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

/**
 * Returns true if the session is bound to an admin role.
 * Use this for admin-only endpoints in place of inline `ctx.isAdmin` checks.
 */
export function isAdmin(ctx: SessionContext): boolean {
  return ctx.adminRole !== null;
}

/**
 * Returns true if the session is bound to the given business (active membership).
 * Admins always return true.
 */
export function hasBusinessAccess(ctx: SessionContext, businessId: string): boolean {
  if (isAdmin(ctx)) return true;
  return ctx.businesses.some((m) => m.businessId === businessId);
}

/**
 * Returns true if the session is bound to the given supplier (active membership).
 * Admins always return true.
 */
export function hasSupplierAccess(ctx: SessionContext, supplierId: string): boolean {
  if (isAdmin(ctx)) return true;
  return ctx.suppliers.some((m) => m.supplierId === supplierId);
}

/**
 * Returns the user's role within the given business, or null if not a member.
 * Useful for role-gated actions inside a business.
 */
export function getBusinessRole(
  ctx: SessionContext,
  businessId: string,
): string | null {
  return ctx.businesses.find((m) => m.businessId === businessId)?.role ?? null;
}

/**
 * Returns the user's role within the given supplier, or null if not a member.
 */
export function getSupplierRole(
  ctx: SessionContext,
  supplierId: string,
): string | null {
  return ctx.suppliers.find((m) => m.supplierId === supplierId)?.role ?? null;
}

/**
 * Throws TenantAccessError if the session has no access to the given business.
 * Use at the top of every business-scoped handler.
 */
export function assertBusinessAccess(ctx: SessionContext, businessId: string): void {
  if (!hasBusinessAccess(ctx, businessId)) {
    throw new TenantAccessError(
      `Forbidden: no access to business ${businessId}`,
    );
  }
}

/**
 * Throws TenantAccessError if the session has no access to the given supplier.
 * Use at the top of every supplier-scoped handler.
 */
export function assertSupplierAccess(ctx: SessionContext, supplierId: string): void {
  if (!hasSupplierAccess(ctx, supplierId)) {
    throw new TenantAccessError(
      `Forbidden: no access to supplier ${supplierId}`,
    );
  }
}

/**
 * Throws TenantAccessError if the session is not an admin.
 */
export function assertAdmin(ctx: SessionContext): void {
  if (!isAdmin(ctx)) {
    throw new TenantAccessError('Forbidden: admin role required');
  }
}

/**
 * Returns the list of businessIds the session can access. Empty for non-members
 * (admins should resolve to all businesses via separate query — this helper
 * returns their own empty list so admin code must explicitly handle the bypass).
 */
export function accessibleBusinessIds(ctx: SessionContext): string[] {
  return ctx.businesses.map((m) => m.businessId!).filter(Boolean);
}

/**
 * Returns the list of supplierIds the session can access.
 */
export function accessibleSupplierIds(ctx: SessionContext): string[] {
  return ctx.suppliers.map((m) => m.supplierId!).filter(Boolean);
}
