import { describe, it, expect } from 'vitest';
import { displayChipLabel } from '../src/ask/displayChipLabel';

describe('displayChipLabel', () => {
  it('sentence-cases ALL CAPS chips and keeps I capitalized', () => {
    expect(displayChipLabel('FIND MY CHEAPEST SUPPLIERS')).toBe('Find my cheapest suppliers');
    expect(displayChipLabel('WHAT SHOULD I REORDER?')).toBe('What should I reorder?');
  });

  it('leaves mixed-case labels alone', () => {
    expect(displayChipLabel('Find cheapest suppliers')).toBe('Find cheapest suppliers');
  });
});
