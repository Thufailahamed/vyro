export const VerificationStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const ProductAvailability = {
  IN_STOCK: 'in_stock',
  LOW: 'low',
  OUT_OF_STOCK: 'out_of_stock',
} as const;
export type ProductAvailability = (typeof ProductAvailability)[keyof typeof ProductAvailability];
