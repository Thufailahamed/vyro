import { describe, expect, it } from 'vitest';
import {
  defaultUserSettings,
  defaultSupplierSettings,
  defaultPlatformSettings,
} from '../../src/modules/settings/defaults';

describe('settings/defaults', () => {
  it('user defaults match spec §3.1', () => {
    expect(defaultUserSettings('u-1')).toEqual({
      userId: 'u-1',
      displayName: null,
      avatarUrl: null,
      phone: null,
      preferredCurrency: 'LKR',
      notifyOrderUpdates: 1,
      notifyMessages: 1,
      notifyMarketing: 0,
      twoFactorEnabled: 0,
      sessionTimeoutMin: 1440,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  it('supplier defaults match spec §3.2', () => {
    const out = defaultSupplierSettings('s-1');
    expect(out.supplierId).toBe('s-1');
    expect(out.companyName).toBeNull();
    expect(out.warehouseLat).toBeNull();
    expect(out.defaultLeadTimeDays).toBeNull();
    expect(out.payoutMethod).toBeNull();
    expect(out.notifyNewOrders).toBe(1);
    expect(out.notifyLowStock).toBe(1);
    expect(out.notifyPaymentReceived).toBe(1);
  });

  it('platform defaults match spec §3.3 + seed row', () => {
    expect(defaultPlatformSettings()).toEqual({
      id: 1,
      brandName: 'VYRO',
      supportEmail: null,
      supportPhone: null,
      defaultCurrency: 'LKR',
      platformFeeBps: 250,
      enableBusinessSignup: 1,
      enableSupplierSignup: 1,
      updatedAt: expect.any(Number),
      updatedByUserId: null,
    });
  });
});
