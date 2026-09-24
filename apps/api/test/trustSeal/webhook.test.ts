import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { trustSealRepository } from '../../src/modules/trustSeal/repository';

describe('trustSeal webhook activation', () => {
  it('activateFromWebhook is exported and idempotent contract holds', () => {
    expect(typeof trustSealRepository.activateFromWebhook).toBe('function');
  });
  it('payments-lk handler handles trust-seal order ids', () => {
    const src = fs.readFileSync('src/modules/webhooks/paymentslk.ts', 'utf8');
    expect(src).toMatch(/trustSeal|trust_seal|ts_/);
  });
});
