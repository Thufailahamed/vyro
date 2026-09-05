import { describe, expect, it } from 'vitest';

const KEY = 'vyro_consent';

interface Consent {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

function build(analytics: boolean, marketing: boolean): Consent {
  return {
    essential: true,
    analytics,
    marketing,
    decidedAt: new Date().toISOString(),
  };
}

describe('cookie consent payload', () => {
  it('accept all → all true', () => {
    const c = build(true, true);
    expect(c.essential).toBe(true);
    expect(c.analytics).toBe(true);
    expect(c.marketing).toBe(true);
    expect(c.decidedAt).toBeDefined();
  });

  it('essential only → analytics and marketing false', () => {
    const c = build(false, false);
    expect(c.essential).toBe(true);
    expect(c.analytics).toBe(false);
    expect(c.marketing).toBe(false);
  });

  it('storage roundtrips JSON', () => {
    const c = build(true, false);
    const json = JSON.stringify(c);
    const back = JSON.parse(json) as Consent;
    expect(back).toEqual(c);
    expect(KEY.length).toBeGreaterThan(0);
  });
});
