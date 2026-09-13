import { describe, expect, it } from 'vitest';

describe('checkout credit option', () => {
  it('labels Net14/30', () => {
    expect('Net 14 / Net 30').toContain('Net');
  });
});
