import { describe, it, expect } from 'vitest';
import { runMigrations } from './migrate';

describe('runMigrations', () => {
  it('is a function exported from the package', () => {
    expect(typeof runMigrations).toBe('function');
  });
});
