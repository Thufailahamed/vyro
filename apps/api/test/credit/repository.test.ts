import { describe, expect, it } from 'vitest';
import { getFacility } from '../../src/modules/credit/repository';

describe('credit repository shape', () => {
  it('exposes getFacility', () => {
    expect(typeof getFacility).toBe('function');
  });
});
