import { nowMs } from '@vyro/shared';

export type UserSettingsShape = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  preferredCurrency: 'LKR';
  notifyOrderUpdates: 0 | 1;
  notifyMessages: 0 | 1;
  notifyMarketing: 0 | 1;
  twoFactorEnabled: 0 | 1;
  sessionTimeoutMin: number;
  createdAt: number;
  updatedAt: number;
};

export type SupplierSettingsShape = {
  supplierId: string;
  companyName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  warehouseAddress: string | null;
  warehouseCity: string | null;
  warehouseDistrict: string | null;
  warehouseLat: number | null;
  warehouseLng: number | null;
  defaultLeadTimeDays: number | null;
  payoutMethod: 'bank' | 'cash' | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankBranch: string | null;
  bankAccountHolder: string | null;
  bankVerified: boolean;
  notifyNewOrders: 0 | 1;
  notifyLowStock: 0 | 1;
  notifyPaymentReceived: 0 | 1;
  createdAt: number;
  updatedAt: number;
};

export type PlatformSettingsShape = {
  id: 1;
  brandName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  defaultCurrency: 'LKR';
  platformFeeBps: number;
  enableBusinessSignup: 0 | 1;
  enableSupplierSignup: 0 | 1;
  updatedAt: number;
  updatedByUserId: string | null;
};

export function defaultUserSettings(userId: string): UserSettingsShape {
  const now = nowMs();
  return {
    userId,
    displayName: null,
    avatarUrl: null,
    phone: null,
    preferredCurrency: 'LKR',
    notifyOrderUpdates: 1,
    notifyMessages: 1,
    notifyMarketing: 0,
    twoFactorEnabled: 0,
    sessionTimeoutMin: 1440,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultSupplierSettings(supplierId: string): SupplierSettingsShape {
  const now = nowMs();
  return {
    supplierId,
    companyName: null,
    registrationNo: null,
    taxId: null,
    contactEmail: null,
    contactPhone: null,
    warehouseAddress: null,
    warehouseCity: null,
    warehouseDistrict: null,
    warehouseLat: null,
    warehouseLng: null,
    defaultLeadTimeDays: null,
    payoutMethod: null,
    bankName: null,
    bankAccountNo: null,
    bankBranch: null,
    bankAccountHolder: null,
    bankVerified: false,
    notifyNewOrders: 1,
    notifyLowStock: 1,
    notifyPaymentReceived: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultPlatformSettings(): PlatformSettingsShape {
  return {
    id: 1,
    brandName: 'VYRO',
    supportEmail: null,
    supportPhone: null,
    defaultCurrency: 'LKR',
    platformFeeBps: 250,
    enableBusinessSignup: 1,
    enableSupplierSignup: 1,
    updatedAt: nowMs(),
    updatedByUserId: null,
  };
}
