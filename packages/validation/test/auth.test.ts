import { describe, it, expect } from 'vitest';
import { signUpSchema, signInSchema } from '../src/auth';
import { onboardingBusinessSchema } from '../src/business';
import { onboardingSupplierSchema } from '../src/supplier';

describe('signUpSchema', () => {
  it('accepts valid input', () => {
    expect(
      signUpSchema.parse({ email: 'a@example.com', password: 'longenough', name: 'Foo' }),
    ).toBeTruthy();
  });
  it('rejects short password', () => {
    expect(() =>
      signUpSchema.parse({ email: 'a@example.com', password: 'short', name: 'Foo' }),
    ).toThrow();
  });
  it('rejects extra fields', () => {
    expect(() =>
      signUpSchema.parse({
        email: 'a@example.com',
        password: 'longenough',
        name: 'Foo',
        isAdmin: true,
      }),
    ).toThrow();
  });
});

describe('signInSchema', () => {
  it('accepts valid input', () => {
    expect(signInSchema.parse({ email: 'a@example.com', password: 'x' })).toBeTruthy();
  });
  it('rejects empty password', () => {
    expect(() => signInSchema.parse({ email: 'a@example.com', password: '' })).toThrow();
  });
});

describe('onboardingBusinessSchema', () => {
  const valid = {
    name: 'Acme',
    businessTypeSlug: 'restaurant',
    contactPerson: 'Alice',
    phone: '0771234567',
    email: 'alice@acme.lk',
    address: '1 Main St',
    city: 'Colombo',
    district: 'Colombo',
  };
  it('accepts valid minimal input', () => {
    expect(onboardingBusinessSchema.parse(valid)).toBeTruthy();
  });
  it('rejects unknown field', () => {
    expect(() => onboardingBusinessSchema.parse({ ...valid, isPlatformAdmin: true })).toThrow();
  });
});

describe('onboardingSupplierSchema', () => {
  const valid = {
    name: 'Acme Supplies',
    businessTypeSlug: 'wholesale',
    contactPerson: 'Bob',
    phone: '0771234567',
    email: 'bob@acme.lk',
    address: '1 Main St',
    city: 'Colombo',
    district: 'Colombo',
    categories: ['rice-grains'],
  };
  it('requires at least one category', () => {
    expect(() => onboardingSupplierSchema.parse({ ...valid, categories: [] })).toThrow();
  });
  it('accepts valid input', () => {
    expect(onboardingSupplierSchema.parse(valid)).toBeTruthy();
  });
});
