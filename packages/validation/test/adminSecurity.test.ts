import { describe, expect, it } from 'vitest';
import {
  adminImpersonateBody,
  adminDataExportCreateBody,
} from '../src/adminSecurity';

describe('adminImpersonateBody', () => {
  it('requires targetUserId and reason', () => {
    expect(adminImpersonateBody.safeParse({}).success).toBe(false);
  });
  it('requires reason >= 5 chars', () => {
    expect(
      adminImpersonateBody.safeParse({ targetUserId: 'u-1', reason: 'a' }).success,
    ).toBe(false);
  });
  it('accepts valid', () => {
    expect(
      adminImpersonateBody.safeParse({ targetUserId: 'u-1', reason: 'support escalation' })
        .success,
    ).toBe(true);
  });
});

describe('adminDataExportCreateBody', () => {
  it('requires userId', () => {
    expect(adminDataExportCreateBody.safeParse({}).success).toBe(false);
  });
  it('accepts userId', () => {
    expect(adminDataExportCreateBody.safeParse({ userId: 'u-1' }).success).toBe(true);
  });
});
