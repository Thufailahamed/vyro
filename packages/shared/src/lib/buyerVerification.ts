export type BuyerKycLevel = 'none' | 'basic' | 'enhanced';

export function isVerifiedBuyer(biz: {
  kycLevel?: string | null;
  kycVerifiedAt?: number | null;
}): boolean {
  return !!biz.kycLevel && biz.kycLevel !== 'none' && biz.kycVerifiedAt != null;
}
