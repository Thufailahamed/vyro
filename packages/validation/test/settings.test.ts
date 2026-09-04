import { describe, expect, it } from 'vitest';
import {
  userProfilePatchSchema,
  userNotificationsPatchSchema,
  userSecurityPatchSchema,
  supplierSettingsPatchSchema,
  platformSettingsPatchSchema,
} from '../src/settings';

describe('settings schemas', () => {
  it('userProfile rejects extra keys', () => {
    const r = userProfilePatchSchema.safeParse({ displayName: 'X', isAdmin: true });
    expect(r.success).toBe(false);
  });

  it('userNotifications strictly requires booleans, rejects other types', () => {
    expect(userNotificationsPatchSchema.safeParse({ notifyOrderUpdates: 1 }).success).toBe(false);
    expect(userNotificationsPatchSchema.safeParse({ notifyOrderUpdates: 'yes' }).success).toBe(false);
    expect(userNotificationsPatchSchema.parse({ notifyOrderUpdates: true })).toEqual({
      notifyOrderUpdates: true,
    });
  });

  it('userSecurity sessionTimeoutMin must be in allowed set', () => {
    expect(userSecurityPatchSchema.safeParse({ sessionTimeoutMin: 45 }).success).toBe(false);
    expect(userSecurityPatchSchema.parse({ sessionTimeoutMin: 60 })).toEqual({ sessionTimeoutMin: 60 });
  });

  it('supplierSettings accepts partial keys', () => {
    const r = supplierSettingsPatchSchema.parse({ companyName: 'Acme' });
    expect(r).toMatchObject({ companyName: 'Acme' });
  });

  it('supplierSettings rejects empty', () => {
    expect(supplierSettingsPatchSchema.safeParse({}).success).toBe(false);
  });

  it('platformSettings rejects platformFeeBps out of range', () => {
    expect(platformSettingsPatchSchema.safeParse({ platformFeeBps: 1500 }).success).toBe(false);
    expect(platformSettingsPatchSchema.safeParse({ platformFeeBps: 250 }).success).toBe(true);
  });
});
