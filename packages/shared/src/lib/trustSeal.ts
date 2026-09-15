export const TRUST_SEAL_PRICE_CENTS = 2500000;
export const TRUST_SEAL_TERM_DAYS = 365;
export const TRUST_SEAL_TERM_MS = TRUST_SEAL_TERM_DAYS * 24 * 60 * 60 * 1000;

export interface TrustSealSupplierLike {
  verificationStatus?: string | null;
  status?: string | null;
}

export interface TrustSealSubLike {
  status?: string | null;
  expiresAt?: number | null;
}

export function isTrustSealed(
  supplier: TrustSealSupplierLike | null | undefined,
  sub: TrustSealSubLike | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!supplier || !sub) return false;
  if (supplier.verificationStatus !== 'verified') return false;
  if (supplier.status && supplier.status !== 'active') return false;
  if (sub.status !== 'active') return false;
  if (sub.expiresAt == null || sub.expiresAt <= now) return false;
  return true;
}

export function memberSinceYear(startedAt: number | null | undefined): number | null {
  if (startedAt == null) return null;
  return new Date(startedAt).getUTCFullYear();
}
