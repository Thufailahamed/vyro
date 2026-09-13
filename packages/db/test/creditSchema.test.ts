import { describe, expect, it } from 'vitest';
import { creditFacilities, creditDrawdowns } from '../src/schema/index';

describe('credit schema exports', () => {
  it('exposes both tables', () => {
    expect(creditFacilities).toBeDefined();
    expect(creditDrawdowns).toBeDefined();
  });
});
