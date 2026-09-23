/** API shapes used by the buyer commerce screens (mirrors apps/web pages). */

export type SponsoredSurface = 'search' | 'category' | 'homepage' | 'storefront';

export interface SponsoredPlacement {
  slotId: string;
  campaignId: string | null;
  productId: string | null;
  surface: SponsoredSurface;
  position: number;
}

export interface SearchSupplier {
  id: string;
  name: string;
  district?: string;
  city?: string;
  verificationStatus?: string;
  slug?: string | null;
  trustSealed?: boolean;
  trustSealExpiresAt?: number | null;
  memberSinceYear?: number | null;
}

export interface SearchHit {
  product: {
    id: string;
    name: string;
    unit: string;
    brand: string | null;
    sku?: string;
    slug?: string;
    packSize?: string | null;
    imageUrl?: string | null;
    categoryId?: string;
  };
  bestOffer: {
    id: string;
    priceCents: number;
    currency?: string;
    leadTimeDays?: number;
    minOrderQty: number;
    supplier: SearchSupplier;
  } | null;
  offerCount: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  nextCursor: string | null;
  sponsored?: SponsoredPlacement[];
}

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  sortOrder?: number;
  active?: boolean | number;
}

export interface SupplierRecord {
  id: string;
  name: string;
  slug?: string | null;
  address?: string;
  city: string;
  district: string;
  description: string | null;
  verificationStatus: string;
  status: string;
  activeListingsCount?: number;
}

export interface OrderRow {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  supplierName?: string;
  supplierId?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
}

export interface TierRef {
  minQty: number;
  discountPct: number;
}

export interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  discountCents: number;
  bestTier: TierRef | null;
  nextTier: TierRef | null;
  product: {
    id: string;
    name: string;
    unit?: string | null;
    brand?: string | null;
    packSize?: string | null;
    imageUrl?: string | null;
  };
  supplier: {
    id: string;
    name: string;
    city?: string;
    district?: string;
    verificationStatus?: string;
    address?: string;
  };
  offer: {
    id: string;
    minOrderQty: number;
    leadTimeDays: number;
    availabilityStatus: string;
    trackInventory?: boolean;
    availableQty?: number | null;
    lowStockThreshold?: number;
  };
  issues?: {
    code: 'OUT_OF_STOCK' | 'BELOW_MOQ' | 'INSUFFICIENT_STOCK';
    message: string;
    minOrderQty?: number;
    available?: number;
  }[];
}

export interface CartResponse {
  cart: { id: string };
  items: CartItem[];
  subtotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  supplierCount: number;
}

export interface OfferDetail {
  id: string;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  availabilityStatus: string;
  deliveryAvailable?: boolean | number;
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
  trackInventory?: boolean;
  availableQty?: number | null;
  lowStockThreshold?: number;
}

export interface OfferRow {
  rank: number;
  offer: OfferDetail;
  supplier: SearchSupplier & { address?: string };
  ranking?: { score: number; rank: number; reasons: string[] };
}

export interface ProductOffersResponse {
  product: {
    id: string;
    name: string;
    unit: string;
    brand?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    images?: { id: string; url: string; altText?: string | null }[];
  };
  offers: OfferRow[];
  priceStats: { count: number; min: number; max: number };
}

export interface TrustSignalView {
  kyc: boolean;
  memberSinceYear: number | null;
  onTimePct: number | null;
  onTimeSampleSize: number;
  disputeFree: boolean;
  lastComputedAt: number | null;
}

export interface StorefrontOffer {
  id: string;
  productId: string;
  productName?: string | null;
  productImage?: string | null;
  unit?: string | null;
  packSize?: string | null;
  priceCents: number;
  leadTimeDays?: number | null;
  productDescription?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  minOrderQty?: number | null;
  availabilityStatus?: string | null;
  stockQty?: number | null;
}

export interface StorefrontResponse {
  supplier: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    district: string | null;
    verificationStatus: string;
    businessTypeName: string | null;
    ratingCount: number;
    ratingAvg: number | null;
    trustSealed?: boolean;
    trustSealExpiresAt?: number | null;
    memberSinceYear?: number | null;
    supplierSinceYear?: number | null;
    supplierSinceDate?: string | null;
    supplierMemberYears?: number | null;
  };
  offers: StorefrontOffer[];
  trustSignals?: TrustSignalView | null;
  otherSuppliersSponsored?: SponsoredPlacement[];
}

export type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;

export interface ReviewSummary {
  count: number;
  avg: number | null;
  distribution: Distribution;
  lastReviewAt: number | null;
}

export interface ReviewItem {
  id: string;
  rating: number;
  body: string;
  createdAt: number;
  helpfulCount?: number;
  images?: { url: string; r2Key?: string }[];
  reply?: { body: string; createdAt: number } | null;
}

export interface RepeatOffer {
  supplierId: string;
  supplierName: string;
  percent: number;
  trailingSpendCents: number;
}

export interface LineHint {
  cartItemId: string;
  productName: string;
  cheaperSupplierName: string;
  currentPriceCents: number;
  altPriceCents: number;
  savingCents: number;
}

export interface CartHint {
  kind: 'switch_save' | 'delivery' | 'budget';
  evidence: string;
  action: string;
  savingCents?: number;
  dismissKey: string;
}

export interface CreditFacilityResponse {
  facility: { limitCents: number; usedCents: number; status: string } | null;
  availableCents: number;
  eligible: boolean;
  reason: string | null;
}

export interface BusinessDetail {
  id: string;
  name?: string;
  countryCode?: string | null;
  kycLevel?: 'none' | 'basic' | 'enhanced' | null;
  kycVerifiedAt?: number | null;
}

export interface Payment {
  id: string;
  purchaseOrderId: string;
  poNumber?: string;
  method: 'cash' | 'bank_transfer' | 'online';
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
  amountCents: number;
  feeCents?: number;
  netCents?: number;
  currency: string;
  transactionReference: string | null;
  paidAt?: number | null;
  confirmedAt: number | null;
  notes?: string | null;
  createdAt?: number;
}

export interface WireInstructions {
  poId: string;
  poNumber: string;
  paymentMethod: 'wire';
  totalLkrCents: number;
  equivalents: { currency: string; amountCents: number; rateScaled: string; fetchedAt: number }[];
  beneficiary: {
    name: string;
    address?: string;
    bankName: string;
    bankAddress?: string;
    accountNumber: string;
    swiftBic: string;
    iban?: string;
    intermediaryName?: string;
    intermediarySwift?: string;
    reference: string;
    memo: string;
  };
  initiatedAt: number;
}
