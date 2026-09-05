import { describe, expect, it } from 'vitest';
import {
  adminFeatureFlagsUpdateBody,
  adminEmailTemplatesUpdateBody,
  adminWebhookCreateBody,
  adminWebhookUpdateBody,
} from '../src/adminPlatformConfig';

describe('adminFeatureFlagsUpdateBody', () => {
  it('requires value and expectedVersion', () => {
    expect(adminFeatureFlagsUpdateBody.safeParse({}).success).toBe(false);
  });
  it('accepts empty object value', () => {
    expect(
      adminFeatureFlagsUpdateBody.safeParse({ value: {}, expectedVersion: 0 }).success,
    ).toBe(true);
  });
});

describe('adminEmailTemplatesUpdateBody', () => {
  it('rejects unknown key', () => {
    expect(
      adminEmailTemplatesUpdateBody.safeParse({ value: {}, expectedVersion: 0, foo: 1 })
        .success,
    ).toBe(false);
  });
});

describe('adminWebhookCreateBody', () => {
  it('requires url', () => {
    expect(
      adminWebhookCreateBody.safeParse({ name: 'x', eventTypes: ['a'], secret: 'longsecret' })
        .success,
    ).toBe(false);
  });
  it('rejects bad url', () => {
    expect(
      adminWebhookCreateBody.safeParse({
        name: 'x',
        url: 'not-a-url',
        eventTypes: ['a'],
        secret: 'longsecret',
      }).success,
    ).toBe(false);
  });
  it('accepts valid', () => {
    expect(
      adminWebhookCreateBody.safeParse({
        name: 'x',
        url: 'https://example.com/hook',
        eventTypes: ['order.created'],
        secret: 'longsecret',
      }).success,
    ).toBe(true);
  });
});

describe('adminWebhookUpdateBody', () => {
  it('rejects empty', () => {
    expect(adminWebhookUpdateBody.safeParse({}).success).toBe(false);
  });
  it('accepts single field', () => {
    expect(adminWebhookUpdateBody.safeParse({ active: false }).success).toBe(true);
  });
});
