import { describe, it, expect } from 'vitest';
import { isCrossBorderEnabled, assertCrossBorderEnabled } from './crossBorderEnv';
import { HttpError } from './errors';

const env = (flag?: string) => ({ CROSS_BORDER_ENABLED: flag } as unknown as Env);

describe('crossBorderEnv', () => {
  it('returns false when flag unset', () => {
    expect(isCrossBorderEnabled(env())).toBe(false);
  });
  it('returns true when flag "true"', () => {
    expect(isCrossBorderEnabled(env('true'))).toBe(true);
  });
  it('returns false when flag "false"', () => {
    expect(isCrossBorderEnabled(env('false'))).toBe(false);
  });
  it('assert throws HttpError 503 CROSS_BORDER_DISABLED when disabled', () => {
    try {
      assertCrossBorderEnabled(env());
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
      expect((e as HttpError).code).toBe('CROSS_BORDER_DISABLED');
    }
  });
  it('assert passes when enabled', () => {
    expect(() => assertCrossBorderEnabled(env('true'))).not.toThrow();
  });
});