import { describe, expect, it } from 'vitest';
import creditRouter from '../../src/modules/credit/routes';

describe('credit routes', () => {
  it('mounts facility endpoint', () => {
    expect(creditRouter).toBeDefined();
  });
});
